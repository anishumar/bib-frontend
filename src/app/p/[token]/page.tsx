"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiError, formatCount, formatMoney } from "@/lib/api/client";
import type { SharedProposal } from "@/lib/api/client";

/**
 * The proposal, as its RECIPIENT reads it. The only page in this app with no
 * session behind it.
 *
 * The person opening this has no login and will not get one — that is what a
 * proposal is, the document that comes before the relationship. The link is a
 * bearer capability: the token is in the URL because a link has to be sendable,
 * and this page immediately puts it in a request BODY rather than a path, so it
 * does not travel onward into the API's access logs or a Referer header.
 *
 * What it deliberately cannot do: accept. Binding a firm to a click on an
 * unauthenticated link is a bigger decision than this feature, so the firm
 * records the client's answer. The page says so rather than showing a button
 * that does not exist.
 *
 * It shows the API's `SharedProposal`, which is a DIFFERENT shape from the one
 * staff read — not the same one with fields blanked. A field added for
 * colleagues therefore cannot arrive on this page by default.
 */
export default function SharedProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [shared, setShared] = useState<SharedProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await api.POST("/api/v1/proposals/shared", { body: { token } });
      if (!live) return;
      if (result.error) {
        // Shown verbatim. The API answers the same way for a mistyped link, an
        // unknown one and a withdrawn one, on purpose — a friendlier local
        // rewrite would either lose that or leak the difference.
        setError(apiError(result.error).message);
        setLoaded(true);
        return;
      }
      setShared(result.data);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, [token]);

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  if (shared === null) {
    return (
      <main>
        <div className="bib-card">
          <p className="bib-error" style={{ margin: 0 }}>
            {error ?? "This link is not one we recognise."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <p className="bib-muted" style={{ marginBottom: 4, fontSize: 14 }}>
        {shared.firmName}
      </p>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>{shared.title}</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        Prepared for {shared.addressedTo}
        {shared.validUntil !== null && ` · valid until ${shared.validUntil}`}
      </p>

      <div className="bib-card">
        <table className="bib-table">
          <thead>
            <tr>
              <th>Service</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Discount</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {shared.lines.map((l, i) => (
              // The API returns lines in document order and gives the recipient
              // no internal ids — deliberately — so position is the key.
              <tr key={`${String(i)}-${l.description}`}>
                <td>{l.description}</td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatCount(l.quantity)}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.unitAmount, shared.currency)}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {Number(l.discountPercent) === 0 ? "—" : `${formatCount(l.discountPercent)}%`}
                </td>
                <td style={{ textAlign: "right" }} className="bib-mono">
                  {formatMoney(l.net, shared.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: "right", marginTop: "var(--bib-gap-2)" }}>
          {shared.totals.discount !== "0" && (
            <div className="bib-muted" style={{ fontSize: 14 }}>
              {formatMoney(shared.totals.gross, shared.currency)} less{" "}
              {formatMoney(shared.totals.discount, shared.currency)}
            </div>
          )}
          <div className="bib-mono" style={{ fontSize: 22 }}>
            {formatMoney(shared.totals.net, shared.currency)}
          </div>
        </div>
      </div>

      <p className="bib-muted" style={{ fontSize: 14 }}>
        {shared.status === "accepted"
          ? "You have accepted this proposal."
          : shared.status === "rejected"
            ? "This proposal was declined."
            : `To accept or discuss this proposal, reply to ${shared.firmName}.`}
      </p>
    </main>
  );
}
