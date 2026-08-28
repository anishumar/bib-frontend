"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatCount, formatMoney, readServiceBody } from "@/lib/api/client";
import type { ConfigEntry, ProposalRecord } from "@/lib/api/client";

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

  if (!loaded) return <p className="bib-muted">Loading…</p>;
  if (record === null) {
    return (
      <main>
        <nav className="bib-nav">
          <Link href="/proposals">← Proposals</Link>
        </nav>
        <p className="bib-error">{error ?? "No such proposal."}</p>
      </main>
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
    <main>
      <nav className="bib-nav">
        <Link href="/proposals">← Proposals</Link>
        {/* There is no history table: the ledger IS this proposal's timeline —
            drafted, approved, sent, viewed, decided, each naming its actor. */}
        {permissions.includes("ledger:read") && (
          <Link href={`/audit?type=proposal&id=${proposalId}`}>History</Link>
        )}
      </nav>

      <h1 style={{ marginBottom: 4 }}>{proposal.title}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        {record.party.displayName} · <span className="bib-pill">{proposal.status}</span>
        {proposal.validUntil !== null && ` · valid until ${proposal.validUntil}`}
      </p>

      {error !== null && <p className="bib-error">{error}</p>}

      {shareLink !== null && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>The link to send</h2>
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            Shown once. Only its fingerprint is stored, so this page is the only place it can
            ever be read — send it again to issue a new one.
          </p>
          <p className="bib-mono" style={{ wordBreak: "break-all", margin: 0 }}>{shareLink}</p>
        </div>
      )}

      <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
        <table className="bib-table">
          <thead>
            <tr>
              <th>Line</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>List then</th>
              <th style={{ textAlign: "right" }}>Quoted</th>
              <th style={{ textAlign: "right" }}>Disc.</th>
              <th style={{ textAlign: "right" }}>Net</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <div>{l.description}</div>
                  {l.service !== null && (
                    <div className="bib-muted bib-mono">
                      {l.service.key}@{l.service.version}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatCount(l.quantity)}
                </td>
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
                <td style={{ textAlign: "right" }} className="bib-mono bib-muted">
                  {l.service?.listPrice ? (
                    <>
                      {formatMoney(l.service.listPrice.amount, l.service.listPrice.currency)}
                      {l.service.listPrice.currency !== l.currency && (
                        <div style={{ fontSize: 11 }}>not comparable</div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.unitAmount, l.currency)}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {l.discountPercent === null ? "—" : `${formatCount(l.discountPercent)}%`}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.net, l.currency)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {isDraft && (
                    <button
                      className="bib-button-quiet"
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
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="bib-muted">
                  Nothing quoted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ textAlign: "right", marginTop: "var(--bib-gap-2)" }}>
          <div className="bib-muted" style={{ fontSize: 14 }}>
            Gross {formatMoney(totals.gross, totals.currency)} · discount{" "}
            {formatMoney(totals.discount, totals.currency)}
          </div>
          <div className="bib-mono" style={{ fontSize: 20 }}>
            {formatMoney(totals.net, totals.currency)}
          </div>
        </div>
      </div>

      {isDraft && (
        <div className="bib-card" style={{ marginBottom: "var(--bib-gap-3)" }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Quote a service</h2>
          <form
            action={(form) => {
              addLine(form);
            }}
          >
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div style={{ flex: "2 1 220px" }}>
                <label className="bib-label" htmlFor="serviceVersionId">
                  From the catalogue
                </label>
                <select
                  className="bib-select"
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
                <label className="bib-label" htmlFor="description">
                  As it reads on the document
                </label>
                <input className="bib-input" id="description" name="description" required />
              </div>
            </div>
            <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
              <div>
                <label className="bib-label" htmlFor="quantity">
                  Quantity
                </label>
                <input className="bib-input" id="quantity" name="quantity" defaultValue="1"
                       required />
              </div>
              <div>
                <label className="bib-label" htmlFor="unitAmount">
                  Unit price ({proposal.currency})
                </label>
                <input className="bib-input" id="unitAmount" name="unitAmount" required />
              </div>
              <div>
                <label className="bib-label" htmlFor="discountPercent">
                  Discount %
                </label>
                <input className="bib-input" id="discountPercent" name="discountPercent"
                       defaultValue="0" required />
              </div>
            </div>
            <button className="bib-button" type="submit" disabled={busy !== null}>
              Add line
            </button>
          </form>
        </div>
      )}

      <div className="bib-card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>
          {isDraft ? "Send it" : "Where it stands"}
        </h2>

        {proposal.discountApprovedAt !== null && (
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            Discount signed off by{" "}
            {record.approvedBy?.displayName ?? record.approvedBy?.email ?? "a colleague"} on{" "}
            {proposal.discountApprovedAt.slice(0, 10)}.
          </p>
        )}
        {proposal.firstViewedAt !== null && (
          <p className="bib-muted" style={{ marginTop: 0, fontSize: 14 }}>
            First opened {proposal.firstViewedAt.slice(0, 10)} · {proposal.viewCount}{" "}
            {proposal.viewCount === 1 ? "view" : "views"}.
          </p>
        )}

        <div className="bib-nav" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          {isDraft && canApprove && (
            <button
              className="bib-button-quiet"
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
            <button className="bib-button" disabled={busy !== null} onClick={() => void send()}>
              {busy === "send" ? "Sending…" : "Send"}
            </button>
          )}
          {proposal.status === "sent" &&
            (["accepted", "rejected"] as const).map((decision) => (
              <button
                key={decision}
                className={
                  decision === "rejected" ? "bib-button-quiet bib-button-danger" : "bib-button"
                }
                disabled={busy !== null}
                onClick={() => {
                  void act(decision, () =>
                    api.POST("/api/v1/proposals/{proposalId}/decision", {
                      params: { path: { proposalId } },
                      body: { decision },
                    }),
                  );
                }}
              >
                Client {decision === "accepted" ? "accepted" : "declined"}
              </button>
            ))}
          {!isDraft && proposal.status !== "sent" && (
            <p className="bib-muted" style={{ margin: 0, fontSize: 14 }}>
              This proposal is {proposal.status}. A client who comes back is a new quote — which
              is what keeps this one readable as what they were actually shown.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
