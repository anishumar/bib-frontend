"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  apiError,
  LEAD_SOURCES,
  LEAD_STAGES,
  recordsLostReason,
  TERMINAL_STAGES,
} from "@/lib/api/client";
import type { LeadRecord, LeadStage, Member } from "@/lib/api/client";

/**
 * The pipeline.
 *
 * The thing worth understanding here: A LEAD IS A PARTY. Capture does not make
 * a second copy of a prospect — it resolves the party by identifier FIRST
 * (phone, PAN, email, normalised), and if that party already has an open lead
 * the capture APPENDS to it rather than starting a rival. So submitting the
 * same company twice answers 200 and not 201, and this screen says which
 * happened, because "we already had them" is the useful part.
 *
 * At most one open lead per party is a database constraint, not a convention.
 * Two live opportunities for one prospect means two people ringing them and two
 * forecasts counting it.
 *
 * CLOSING IS TWO STEPS, AND THAT IS THE POINT. `lost` and `abandoned` are not
 * shades of each other — chose a competitor is a PRICING problem, went quiet is
 * a FOLLOW-UP problem — and a firm that cannot tell them apart cannot tell
 * which of its two fixable failures it has. Both take a reason, in the closer's
 * own words, because a dropdown of five reasons produces five reasons and the
 * useful one is always the sixth. The API REQUIRES one on those two stages and
 * REFUSES one on every other, so the box appears on exactly those two.
 */
export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [staff, setStaff] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The close in progress. Picking `lost` or `abandoned` does not post — it
  // opens the reason box and posts BOTH in one call, because the API refuses a
  // close without a reason and a screen that fired the request first would
  // report an error the user could not have avoided.
  const [closing, setClosing] = useState<{ leadId: string; stage: LeadStage } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [pipeline, roster] = await Promise.all([
      api.GET("/api/v1/leads", {}),
      // The roster needs tenant:admin, so an associate gets a 403 here and no
      // owner dropdown. That is the API's rule and this screen does not argue
      // with it — it simply offers what the caller can actually use.
      api.GET("/api/v1/tenancy/members", {}),
    ]);
    if (pipeline.response.status === 401) {
      router.push("/login");
      return;
    }
    if (pipeline.error) {
      setError(apiError(pipeline.error).message);
      setLoaded(true);
      return;
    }
    setLeads(pipeline.data.leads);
    setStaff(roster.data?.members.filter((m) => m.membership.isActive) ?? []);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    setNote(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  /** Move a lead, with the reason when the stage is one that takes one. */
  function move(leadId: string, stage: LeadStage, lostReason?: string): void {
    void act(leadId, async () => {
      const result = await api.POST("/api/v1/leads/{leadId}/stage", {
        params: { path: { leadId } },
        body: {
          stage,
          // Sent only for `lost` and `abandoned`. The API refuses it anywhere
          // else, and an empty string is not a reason.
          ...(lostReason === undefined || lostReason === "" ? {} : { lostReason }),
        },
      });
      if (!result.error) setClosing(null);
      return result;
    });
  }

  async function capture(form: FormData): Promise<void> {
    setBusy("capture");
    setError(null);
    setNote(null);
    // The API deduplicates on these three, normalised. Blank ones are dropped
    // rather than sent — an empty identifier is not a fact about anybody.
    const identifiers = (["email", "phone", "pan"] as const)
      .map((type) => ({ type, value: String(form.get(type) ?? "").trim() }))
      .filter((i) => i.value !== "");

    const result = await api.POST("/api/v1/leads", {
      body: {
        source: String(form.get("source")) as LeadRecord["lead"]["source"],
        kind: "organization",
        name: String(form.get("name")).trim(),
        // What this opportunity is FOR. Required since G3.1, and the reason is
        // this list: a client with two live opportunities used to render as the
        // same company twice, because the party's name was all a row had.
        title: String(form.get("title")).trim(),
        identifiers,
      },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    // 201 created something; 200 landed on what was already there. Saying so is
    // the whole point of capture answering two codes.
    setNote(
      result.data.merged
        ? // The merge is right — a firm holds one live opportunity per client —
          // but the title typed above was thrown away, and saying so is the
          // whole point of the API returning it. Silence here would put the bug
          // back on the screen after it was fixed underneath.
          result.data.discardedTitle
          ? `We already had an open opportunity with them, so this capture was added to it — and "${result.data.discardedTitle}" was not kept. It is still called "${result.data.lead.title}". Rename it, or close it before opening the next one.`
          : "We already had an open opportunity with them — this capture was added to it."
        : result.data.matchedExistingParty
          ? "They were already in the book; a new opportunity was opened against that record."
          : "New prospect, new opportunity.",
    );
    await load();
  }

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  const open = leads.filter((l) => !TERMINAL_STAGES.includes(l.lead.stage));
  const closed = leads.filter((l) => TERMINAL_STAGES.includes(l.lead.stage));

  return (
    <main>
      <nav className="bib-nav">
        <Link href="/">← Workspace</Link>
        <Link href="/clients">Clients</Link>
        <Link href="/proposals">Proposals</Link>
      </nav>
      <h1>Pipeline</h1>
      {error !== null && <p className="bib-error">{error}</p>}
      {note !== null && (
        <p className="bib-muted" style={{ fontSize: 14 }}>
          {note}
        </p>
      )}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Open</h2>
        {open.length === 0 ? (
          <p className="bib-muted" style={{ margin: 0 }}>
            Nothing in the pipeline.
          </p>
        ) : (
          <table className="bib-table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Source</th>
                <th>Stage</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {open.map((l) => {
                const closingThis = closing?.leadId === l.lead.id ? closing : null;
                return (
                  <Fragment key={l.lead.id}>
                    <tr>
                      <td>
                        {/* What the opportunity IS, over who it is with. Two live
                            opportunities for one client used to render as the same
                            company twice, because the party was all a row had. */}
                        <div>{l.lead.title}</div>
                        {/* The party links, because the lead IS the party and
                            everything else known about them is there. */}
                        <Link className="bib-muted" href={`/clients/${l.party.id}`}
                              style={{ fontSize: 13 }}>
                          {l.party.displayName}
                        </Link>
                      </td>
                      <td className="bib-muted">{l.lead.source}</td>
                      <td>
                        <select
                          className="bib-select"
                          // While a close is being written the select shows the
                          // stage being moved TO, not the stored one — the
                          // request has not gone yet and snapping back would
                          // look like the choice was refused.
                          value={closingThis?.stage ?? l.lead.stage}
                          disabled={busy !== null}
                          onChange={(e) => {
                            const stage = e.target.value as LeadStage;
                            if (recordsLostReason(stage)) {
                              setClosing({ leadId: l.lead.id, stage });
                              return;
                            }
                            setClosing(null);
                            move(l.lead.id, stage);
                          }}
                        >
                          {LEAD_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="bib-select"
                          value={l.owner?.userId ?? ""}
                          disabled={busy !== null || staff.length === 0}
                          onChange={(e) => {
                            void act(l.lead.id, () =>
                              api.PUT("/api/v1/leads/{leadId}/owner", {
                                params: { path: { leadId: l.lead.id } },
                                body: {
                                  ownerUserId: e.target.value === "" ? null : e.target.value,
                                },
                              }),
                            );
                          }}
                        >
                          {/* Unassigned is a real state — it is the queue somebody
                              works from — so it is an option, not an absence. */}
                          <option value="">unassigned</option>
                          {staff.map((m) => (
                            <option key={m.membership.id} value={m.membership.userId}>
                              {m.displayName ?? m.email}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {closingThis !== null && (
                      <tr>
                        <td colSpan={4}>
                          <form
                            action={(form) => {
                              move(
                                l.lead.id,
                                closingThis.stage,
                                String(form.get("lostReason") ?? "").trim(),
                              );
                            }}
                          >
                            <label className="bib-label" htmlFor={`lostReason-${l.lead.id}`}>
                              {closingThis.stage === "lost"
                                ? "Why did it go elsewhere?"
                                : "What happened to it?"}
                            </label>
                            <textarea
                              className="bib-input"
                              id={`lostReason-${l.lead.id}`}
                              name="lostReason"
                              rows={2}
                              required
                              autoFocus
                              placeholder={
                                closingThis.stage === "lost"
                                  ? "Went with their existing auditor on price."
                                  : "Three calls and two emails, no reply since June."
                              }
                            />
                            <div className="bib-nav"
                                 style={{ marginTop: "var(--bib-gap-1)", marginBottom: 0 }}>
                              <button className="bib-button" type="submit"
                                      disabled={busy !== null}>
                                Close as {closingThis.stage}
                              </button>
                              <button
                                className="bib-button-quiet"
                                type="button"
                                disabled={busy !== null}
                                onClick={() => {
                                  setClosing(null);
                                }}
                              >
                                Keep it open
                              </button>
                            </div>
                            <p className="bib-muted" style={{ fontSize: 13, marginBottom: 0 }}>
                              In your own words, and required — the stage says only THAT it did
                              not close won. Lost and abandoned are different findings and this
                              is the half worth reading next quarter.
                            </p>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {closed.length > 0 && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Closed</h2>
          <table className="bib-table">
            <tbody>
              {closed.map((l) => (
                <tr key={l.lead.id} data-inactive="true">
                  <td>
                    <div>{l.lead.title}</div>
                    <Link className="bib-muted" href={`/clients/${l.party.id}`}
                          style={{ fontSize: 13 }}>
                      {l.party.displayName}
                    </Link>
                  </td>
                  <td>
                    {/* `lost` and `abandoned` render as themselves. Collapsing
                        them into one word would throw away the only signal that
                        separates a pricing problem from a follow-up one. */}
                    <span
                      className="bib-pill"
                      data-tone={recordsLostReason(l.lead.stage) ? "revoked" : ""}
                    >
                      {l.lead.stage}
                    </span>
                  </td>
                  {/* WHY, in the closer's own words. Null on a converted lead is
                      right; null on a closed-unwon one means it was closed
                      before anybody was asked, which is a different silence. */}
                  <td style={{ fontSize: 13 }}>
                    {l.lead.lostReason ??
                      (recordsLostReason(l.lead.stage) ? (
                        <span className="bib-muted">no reason recorded — nobody was asked</span>
                      ) : (
                        ""
                      ))}
                  </td>
                  <td className="bib-muted">{l.lead.closedAt?.slice(0, 10) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Capture a lead</h2>
        <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
          At least one way to reach them. Email, phone and PAN are what the firm
          deduplicates on, so the same prospect arriving twice lands on one record.
        </p>
        <form
          action={(form) => {
            void capture(form);
          }}
        >
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div style={{ flex: "2 1 240px" }}>
              <label className="bib-label" htmlFor="name">
                Company
              </label>
              <input className="bib-input" id="name" name="name" required />
            </div>
            <div style={{ flex: "2 1 240px" }}>
              <label className="bib-label" htmlFor="title">
                Opportunity
              </label>
              <input
                className="bib-input"
                id="title"
                name="title"
                placeholder="FY26 statutory audit"
                required
              />
            </div>
            <div>
              <label className="bib-label" htmlFor="source">
                Source
              </label>
              <select className="bib-select" id="source" name="source" style={{ width: "100%" }}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
            <div>
              <label className="bib-label" htmlFor="email">
                Email
              </label>
              <input className="bib-input" id="email" name="email" type="email" />
            </div>
            <div>
              <label className="bib-label" htmlFor="phone">
                Phone
              </label>
              <input className="bib-input" id="phone" name="phone" />
            </div>
            <div>
              <label className="bib-label" htmlFor="pan">
                PAN
              </label>
              <input className="bib-input" id="pan" name="pan" placeholder="AAACL1234M" />
            </div>
          </div>
          <button className="bib-button" type="submit" disabled={busy !== null}>
            {busy === "capture" ? "Capturing…" : "Capture"}
          </button>
        </form>
      </div>
    </main>
  );
}
