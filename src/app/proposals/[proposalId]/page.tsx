"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BLOCK_KIND_LABELS,
  api,
  apiError,
  formatCount,
  formatMoney,
  readServiceBody,
} from "@/lib/api/client";
import type { ConfigEntry, ProposalRecord } from "@/lib/api/client";
import { LinkButton, Pill, Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

/**
 * One proposal: what was quoted, from which catalogue version, at what price.
 *
 * The screen the pin exists for. Each line shows the LIST PRICE as it was when
 * the line was quoted, beside what the firm actually charged — the archived
 * catalogue version still resolves, so a proposal reopened long after the price
 * list moved on still answers both halves of the question.
 *
 * Every rule belongs to the API and none is repeated here. Whether a discount
 * needs approval, whether this proposal may still be edited, whether it has
 * expired: all of them come back as a refusal with a message written to be
 * acted on, and this screen shows that message verbatim.
 */
export default function ProposalPage() {
  const router = useRouter();
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;

  const [record, setRecord] = useState<ProposalRecord | null>(null);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A decline in progress. The status already says a quote was lost; WHY is the
  // half worth anything later, and asking for it after the fact means asking
  // somebody who has moved on. So the button opens the box rather than posting.
  const [declining, setDeclining] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [one, catalogue, me] = await Promise.all([
      api.GET("/api/v1/proposals/{proposalId}", { params: { path: { proposalId } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/auth/me", {}),
    ]);
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setRecord(one.data);
    // Published only. A service that exists as a draft was never in force, and
    // the API refuses to quote one — offering it here would be a dropdown entry
    // whose only outcome is an error.
    if (catalogue.data) {
      setServices(catalogue.data.entries.filter((e) => e.published !== null));
    }
    if (me.data) setPermissions(me.data.permissions);
    setError(null);
    setLoaded(true);
  }, [proposalId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every mutation funnels through here, so one place owns the busy flag, the
   *  error and the reload. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  function addLine(form: FormData): void {
    void act("add", () =>
      api.POST("/api/v1/proposals/{proposalId}/lines", {
        params: { path: { proposalId } },
        body: {
          serviceVersionId: String(form.get("serviceVersionId")),
          description: String(form.get("description")),
          quantity: String(form.get("quantity")),
          // A decimal STRING all the way from this input to the numeric column.
          // Parsing it to a number anywhere in between is the one thing this
          // whole path is arranged to avoid.
          unitAmount: String(form.get("unitAmount")),
          discountPercent: String(form.get("discountPercent")),
        },
      }),
    );
  }

  async function send(): Promise<void> {
    setBusy("send");
    setError(null);
    const result = await api.POST("/api/v1/proposals/{proposalId}/send", {
      params: { path: { proposalId } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    // The link comes back ONCE — only its digest is stored, so this response is
    // the only place it can ever be read. Holding it in state rather than
    // re-fetching it is not a shortcut; there is nothing to re-fetch.
    setShareLink(`${window.location.origin}/p/${result.data.shareToken}`);
    await load();
    setBusy(null);
  }

  if (!loaded) return <p className="muted">Loading…</p>;
  if (record === null) {
    return (
      <Page>
        <p className="notice" data-tone="danger" role="alert">{error ?? "No such proposal."}</p>
      </Page>
    );
  }

  const { proposal, totals, lines } = record;
  const isDraft = proposal.status === "draft";
  // The API decides whether an approval is needed; this only decides whether to
  // OFFER the button, from what /auth/me says the session holds. Somebody
  // without it still gets an accurate refusal — but not offering it is not the
  // same as refusing it afterwards.
  const canApprove = permissions.includes("proposal:approve");

  return (
    <Page>

      {/* The tab carries the reference for the same reason the header does: it
          is how a person names this document to anybody else. */}
      <title>{`${proposal.ref} — ${proposal.title}`}</title>
      {/* The firm's own number for this quote goes in the eyebrow. The uuid in
          the address bar is the system's name for it; this is the one a client
          quotes back. */}
      <PageHeader
        eyebrow={<span className="mono">{proposal.ref}</span>}
        title={<>{proposal.title}</>}
        lede={
          <>
            {record.party.displayName} · <Pill>{proposal.status}</Pill>
            {proposal.validUntil !== null && ` · valid until ${proposal.validUntil}`}
          </>
        }
        /* There is no history table: the ledger IS this proposal's timeline —
           drafted, approved, sent, viewed, decided, each naming its actor. The
           sidebar's Audit trail is the WHOLE firm's; this one is scoped to this
           document, which is why it cannot live there. */
        aside={
          permissions.includes("ledger:read") ? (
            <LinkButton size="sm" href={`/audit?type=proposal&id=${proposalId}`}>
              History
            </LinkButton>
          ) : undefined
        }
      />

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {shareLink !== null && (
        <div className="card">
          <h2 className="card-title">The link to send</h2>
          <p className="muted text-md">
            Shown once. Only its fingerprint is stored, so this page is the only place it can
            ever be read — send it again to issue a new one.
          </p>
          <p className="mono" style={{ wordBreak: "break-all" }}>{shareLink}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <table className="table">
          <thead>
            <tr>
              <Th>Line</Th>
              <Th style={{ textAlign: "right" }}>Qty</Th>
              <Th style={{ textAlign: "right" }}>List then</Th>
              <Th style={{ textAlign: "right" }}>Quoted</Th>
              <Th style={{ textAlign: "right" }}>Disc.</Th>
              <Th style={{ textAlign: "right" }}>Net</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <Td>
                  <div>{l.description}</div>
                  {l.service !== null && (
                    <div className="mono muted">
                      {l.service.key}@{l.service.version}
                    </div>
                  )}
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  {formatCount(l.quantity)}
                </Td>
                {/* The catalogue's price AS IT WAS — the thing the pin exists
                    to preserve. Null means the firm never listed one (a service
                    it quotes case by case), which is not the same as free, so it
                    reads as a dash.

                    When the catalogue prices in one currency and the quote is in
                    another, the two columns are NOT comparable and the screen
                    says so rather than letting them sit side by side looking as
                    though they are. Converting here would need a rate between
                    them, and the only rate this proposal carries goes to the
                    firm's reporting currency, not to the catalogue's. */}
                <Td style={{ textAlign: "right" }} className="mono muted">
                  {l.service?.listPrice ? (
                    <>
                      {formatMoney(l.service.listPrice.amount, l.service.listPrice.currency)}
                      {l.service.listPrice.currency !== l.currency && (
                        <div className="text-xs">not comparable</div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  {formatMoney(l.unitAmount, l.currency)}
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  {l.discountPercent === null ? "—" : `${formatCount(l.discountPercent)}%`}
                </Td>
                <Td style={{ textAlign: "right" }} className="mono">
                  {formatMoney(l.net, l.currency)}
                </Td>
                <Td style={{ textAlign: "right" }}>
                  {isDraft && (
                    <button
                      className="btn" data-variant="secondary" data-size="sm"
                      disabled={busy !== null}
                      onClick={() => {
                        void act(l.id, () =>
                          api.DELETE("/api/v1/proposals/{proposalId}/lines/{lineId}", {
                            params: { path: { proposalId, lineId: l.id } },
                          }),
                        );
                      }}
                    >
                      Remove
                    </button>
                  )}
                </Td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <Td colSpan={7} className="muted">
                  Nothing quoted yet.
                </Td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ textAlign: "right", marginTop: "var(--s-4)" }}>
          <div className="muted text-md">
            Gross {formatMoney(totals.gross, totals.currency)} · discount{" "}
            {formatMoney(totals.discount, totals.currency)}
          </div>
          <div className="mono text-lg">
            {formatMoney(totals.net, totals.currency)}
          </div>
        </div>
      </div>

      {/* ── The proposal's own prose ────────────────────────────────────
          The exclusions and commercial notes this document carries, COPIED from
          the firm's standard set at drafting. A UAE proposal correctly has no
          Indian tax note: the copy filters by the client's country, so what is
          missing here is a decision rather than an omission. */}
      {record.blocks.length > 0 && (
        <div className="card">
          <h2 className="card-title">Exclusions and notes</h2>
          {(["exclusion", "commercial", "team"] as const).map((kind) => {
            const mine = record.blocks.filter((b) => b.kind === kind);
            if (mine.length === 0) return null;
            return (
              <div key={kind} style={{ marginBottom: "var(--s-4)" }}>
                <div className="label">{BLOCK_KIND_LABELS[kind]}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {mine.map((b) => (
                    <li
                      key={b.id}
                      style={{
                        listStyle: b.isHeading ? "none" : undefined,
                        marginLeft: b.isHeading ? -18 : 0,
                      }}
                    >
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                      {b.sourceId === null && (
                        <span className="muted text-xs">
                          {" "}
                          · this proposal&apos;s own
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {isDraft && (
        <div className="card">
          <h2 className="card-title">Quote a service</h2>
          <form
            action={(form) => {
              addLine(form);
            }}
          >
            <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
              <div style={{ flex: "2 1 220px" }}>
                <label className="label" htmlFor="serviceVersionId">
                  From the catalogue
                </label>
                <select
                  className="select"
                  id="serviceVersionId"
                  name="serviceVersionId"
                  required
                  style={{ width: "100%" }}
                >
                  {services.map((entry) => {
                    const body = readServiceBody(entry.published?.body);
                    return (
                      <option key={entry.entry.id} value={entry.published?.id}>
                        {body.name || entry.entry.key}
                        {body.listPrice !== null &&
                          ` — ${formatMoney(body.listPrice.amount, body.listPrice.currency)}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={{ flex: "2 1 220px" }}>
                <label className="label" htmlFor="description">
                  As it reads on the document
                </label>
                <input className="input" id="description" name="description" required />
              </div>
            </div>
            <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
              <div>
                <label className="label" htmlFor="quantity">
                  Quantity
                </label>
                <input className="input" id="quantity" name="quantity" defaultValue="1"
                       required />
              </div>
              <div>
                <label className="label" htmlFor="unitAmount">
                  Unit price ({proposal.currency})
                </label>
                <input className="input" id="unitAmount" name="unitAmount" required />
              </div>
              <div>
                <label className="label" htmlFor="discountPercent">
                  Discount %
                </label>
                <input className="input" id="discountPercent" name="discountPercent"
                       defaultValue="0" required />
              </div>
            </div>
            <button className="btn" type="submit" disabled={busy !== null}>
              Add line
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">
          {isDraft ? "Send it" : "Where it stands"}
        </h2>

        {proposal.discountApprovedAt !== null && (
          <p className="muted text-md">
            Discount signed off by{" "}
            {record.approvedBy?.displayName ?? record.approvedBy?.email ?? "a colleague"} on{" "}
            {proposal.discountApprovedAt.slice(0, 10)}.
          </p>
        )}
        {proposal.firstViewedAt !== null && (
          <p className="muted text-md">
            First opened {proposal.firstViewedAt.slice(0, 10)} · {proposal.viewCount}{" "}
            {proposal.viewCount === 1 ? "view" : "views"}.
          </p>
        )}

        <div className="cluster" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          {isDraft && canApprove && (
            <button
              className="btn" data-variant="secondary" data-size="sm"
              disabled={busy !== null}
              onClick={() => {
                void act("approve", () =>
                  api.POST("/api/v1/proposals/{proposalId}/discount-approval", {
                    params: { path: { proposalId } },
                  }),
                );
              }}
            >
              Approve the discount
            </button>
          )}
          {isDraft && (
            <button className="btn" disabled={busy !== null} onClick={() => void send()}>
              {busy === "send" ? "Sending…" : "Send"}
            </button>
          )}
          {proposal.status === "sent" && !declining && (
            <>
              <button
                className="btn"
                disabled={busy !== null}
                onClick={() => {
                  void act("accepted", () =>
                    api.POST("/api/v1/proposals/{proposalId}/decision", {
                      params: { path: { proposalId } },
                      body: { decision: "accepted" },
                    }),
                  );
                }}
              >
                Client accepted
              </button>
              <button
                className="btn" data-variant="destructive-quiet" data-size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setDeclining(true);
                }}
              >
                Client declined
              </button>
            </>
          )}
          {!isDraft && proposal.status !== "sent" && (
            <p className="muted text-md">
              This proposal is {proposal.status}. A client who comes back is a new quote — which
              is what keeps this one readable as what they were actually shown.
            </p>
          )}
        </div>

        {proposal.status === "sent" && declining && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const declinedReason = String(form.get("declinedReason") ?? "").trim();
              void act("rejected", () =>
                api.POST("/api/v1/proposals/{proposalId}/decision", {
                  params: { path: { proposalId } },
                  body: {
                    decision: "rejected",
                    // Only when there is one. The API records a reason on a
                    // rejection and nowhere else — a sentence about why they
                    // declined has no meaning on a quote they signed, and the
                    // schema refuses it there.
                    ...(declinedReason === "" ? {} : { declinedReason }),
                  },
                }),
              );
            }}
          >
            <label className="label" htmlFor="declinedReason">
              Why did they say no?
            </label>
            <textarea className="input" id="declinedReason" name="declinedReason" rows={2}
                      autoFocus
                      placeholder="Went with their existing auditor on price." />
            <div className="cluster" style={{ marginTop: "var(--s-2)", marginBottom: 0 }}>
              <button className="btn" data-variant="destructive-quiet" data-size="sm" type="submit"
                      disabled={busy !== null}>
                Record the decline
              </button>
              <button
                className="btn" data-variant="secondary" data-size="sm"
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setDeclining(false);
                }}
              >
                Cancel
              </button>
            </div>
            <p className="muted text-sm">
              In the firm&apos;s own words. The status already says the quote was lost; this is
              the half worth anything next quarter, and it cannot be added later.
            </p>
          </form>
        )}

        {proposal.status === "rejected" && (
          <>
            <p className="label" style={{ marginBottom: 2 }}>
              Why they said no
            </p>
            <p className="text-md">
              {proposal.declinedReason ?? (
                // Null on a rejection means nobody wrote one down, which is a
                // different silence from a quote that was never decided.
                <span className="muted">Not recorded — nobody was asked.</span>
              )}
            </p>
          </>
        )}
      </div>
    </Page>
  );
}
