"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiError, BLOCK_KINDS, BLOCK_KIND_LABELS, formatCount, formatMoney } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { ErrorState, Loading } from "@/components/states";
import { Stat, Strip, Table, TableWrap, Td, Th } from "@/components/ui";
import { Card, CardTitle } from "@/components/tw";
import type { SharedProposal } from "@/lib/api/client";
import { longDay } from "@/lib/day";

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
 *
 * Since 2026-09-24 that shape carries the document's own prose — the
 * exclusions, commercial notes and team block — because the staff screen
 * calls a sent quote's wording "the record of what the client was shown",
 * and until then the client was shown the prices and none of the wording.
 * Read-only, and only the words: nothing here says which lines are the
 * firm's standard text and which were written for this client.
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

  if (!loaded) return <Loading />;

  if (shared === null) {
    return (
      <Page width="narrow">
        <ErrorState
          title="This link does not work"
          message={error ?? "This link is not one we recognise."}
        />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={shared.firmName}
        title={shared.title}
        lede={
          <>
            {/* The number the RECIPIENT quotes back down the phone. They have
                no account and no other way to name this document. */}
            <span className="mono">{shared.ref}</span> · Prepared for {shared.addressedTo}
            {/* A `date` column, so `longDay` and never `longInstant`. This is
                the CLIENT's copy of the quote, and it was the one screen on
                the product where a client read an ISO date. */}
            {shared.validUntil !== null && ` · valid until ${longDay(shared.validUntil)}`}
          </>
        }
      />

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Service</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Discount</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {shared.lines.map((l, i) => (
              // The API returns lines in document order and gives the recipient
              // no internal ids — deliberately — so position is the key.
              <tr key={`${String(i)}-${l.description}`}>
                <Td>{l.description}</Td>
                <Td align="right">
                  <span className="mono">{formatCount(l.quantity)}</span>
                </Td>
                <Td align="right">
                  <span className="mono">{formatMoney(l.unitAmount, shared.currency)}</span>
                </Td>
                <Td align="right">
                  <span className="mono">
                    {Number(l.discountPercent) === 0
                      ? "none"
                      : `${formatCount(l.discountPercent)}%`}
                  </span>
                </Td>
                <Td align="right">
                  <span className="mono">{formatMoney(l.net, shared.currency)}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <Strip>
        <Stat
          label="Total"
          value={formatMoney(shared.totals.net, shared.currency)}
          {...(shared.totals.discount !== "0"
            ? {
                note: `after ${formatMoney(shared.totals.discount, shared.currency)} off ${formatMoney(shared.totals.gross, shared.currency)}`,
              }
            : {})}
        />
      </Strip>

      {shared.blocks.length > 0 && (
        <Card>
          <CardTitle level={2}>What this quote covers</CardTitle>
          {BLOCK_KINDS.map((kind) => {
            const mine = shared.blocks.filter((b) => b.kind === kind);
            // A kind the document carries nothing of is not drawn: an empty
            // "Exclusions" heading reads as the firm asserting there are none.
            if (mine.length === 0) return null;
            return (
              <div key={kind} className="mb-4">
                <div className="label">{BLOCK_KIND_LABELS[kind]}</div>
                <ul className="mt-1 list-disc pl-[18px]">
                  {mine.map((b, i) => (
                    // The API gives the recipient no ids, deliberately, so
                    // position within the kind is the key.
                    <li
                      key={`${kind}-${String(i)}`}
                      className={b.isHeading ? "text-md -ml-[18px] list-none" : "text-md"}
                    >
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      )}

      <p className="muted">
        {shared.status === "accepted"
          ? "You have accepted this proposal."
          : shared.status === "rejected"
            ? "This proposal was declined."
            : `To accept or discuss this proposal, reply to ${shared.firmName}.`}
      </p>
    </Page>
  );
}
