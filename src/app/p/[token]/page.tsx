"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, apiError, BLOCK_KIND_LABELS, PROPOSAL_BLOCK_KINDS, formatCount, formatMoney } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { ErrorState, Loading } from "@/components/states";
import {
  Button,
  Checkbox,
  ErrorNotice,
  Field,
  FieldStack,
  Input,
  Stat,
  Strip,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { Card, CardTitle } from "@/components/tw";
import type { SharedProposal } from "@/lib/api/client";
import { longDay, longInstantTime } from "@/lib/day";

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
 * SINCE 0085 IT IS ALSO WHERE THE CLIENT ANSWERS. bib emails the proposal with
 * Accept and Decline buttons, and each opens THIS page with that answer ready
 * (`?answer=accept|decline`) — never given. Mail filters open every link in a
 * message to scan it, so the answer is a separate step here: a name typed for
 * either answer, and for an acceptance the API's own sentence ticked, word for
 * word, so what the page showed is what the firm records.
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
  /**
   * WHICH ANSWER IS READY — from the email's button, or picked here. Ready is
   * all it is: nothing is sent until the form below is submitted, which is the
   * point of the buttons opening a page rather than answering.
   */
  const initial = useSearchParams().get("answer");
  const [choice, setChoice] = useState<"accept" | "decline" | null>(
    initial === "accept" || initial === "decline" ? initial : null,
  );
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const answerCard = useRef<HTMLDivElement>(null);
  const lastUrl = useRef<string | null>(null);

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

  // Arriving from the email's button: bring the answer into view, and move
  // focus there so a keyboard or screen reader lands where the reader meant to.
  useEffect(() => {
    if (shared?.status === "sent" && initial !== null) {
      answerCard.current?.scrollIntoView({ block: "start" });
      answerCard.current?.focus({ preventScroll: true });
    }
  }, [shared?.status, initial]);

  // An object URL holds its bytes until it is revoked; one per page is enough.
  useEffect(() => {
    return () => {
      if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    };
  }, []);

  async function answer(form: FormData, decision: "accepted" | "rejected"): Promise<void> {
    setAnswering(true);
    setAnswerError(null);
    const reason = String(form.get("declinedReason") ?? "").trim();
    const result = await api.POST("/api/v1/proposals/shared/answer", {
      body: {
        token,
        decision,
        signerName: String(form.get("signerName") ?? "").trim(),
        confirmed: form.get("confirmed") !== null,
        ...(decision === "rejected" && reason !== "" ? { declinedReason: reason } : {}),
      },
    });
    setAnswering(false);
    if (result.error) {
      // Verbatim: the API's refusals here are written to the CLIENT — "type
      // your full name", "already accepted, and that answer stands".
      setAnswerError(apiError(result.error).message);
      return;
    }
    setShared(result.data);
  }

  async function download(filename: string): Promise<void> {
    setDownloading(true);
    setDownloadError(null);
    // POST with the token in the BODY, like the page's own read — so the link
    // does not land in a log — and the bytes saved here rather than by a plain
    // link that would have to carry the token in its address.
    const result = await api.POST("/api/v1/proposals/shared/pdf", {
      body: { token },
      parseAs: "blob",
    });
    setDownloading(false);
    if (result.error) {
      setDownloadError(apiError(result.error).message);
      return;
    }
    const url = URL.createObjectURL(result.data as unknown as Blob);
    if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = url;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }

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
        aside={
          shared.status === "expired" ? undefined : (
            <Button
              variant="secondary"
              size="sm"
              loading={downloading}
              disabled={downloading}
              onClick={() => void download(`${shared.ref}.pdf`)}
            >
              Download PDF
            </Button>
          )
        }
      />
      <ErrorNotice error={downloadError} />

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
          {PROPOSAL_BLOCK_KINDS.map((kind) => {
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

      {shared.status === "sent" ? (
        <div ref={answerCard} tabIndex={-1}>
          <Card>
            <CardTitle level={2}>Your answer</CardTitle>
            <p className="muted text-md mb-3">
              Accept or decline this proposal. Your name is recorded with your answer, and{" "}
              {shared.firmName} is told at once.
            </p>
            {/* Toggle buttons, not tabs: two answers, one ready at a time. */}
            <div className="cluster mb-4" role="group" aria-label="Your answer">
              <Button
                variant={choice === "accept" ? "primary" : "secondary"}
                aria-pressed={choice === "accept"}
                disabled={answering}
                onClick={() => {
                  setChoice("accept");
                  setAnswerError(null);
                }}
              >
                Accept
              </Button>
              <Button
                variant={choice === "decline" ? "destructive" : "secondary"}
                aria-pressed={choice === "decline"}
                disabled={answering}
                onClick={() => {
                  setChoice("decline");
                  setAnswerError(null);
                }}
              >
                Decline
              </Button>
            </div>
            <ErrorNotice error={answerError} />

            {choice === "accept" && (
              <form action={(form) => void answer(form, "accepted")}>
                <FieldStack>
                  <Field label="Your full name">
                    <Input name="signerName" required maxLength={200} autoComplete="name" />
                  </Field>
                  {/* The API's sentence, WORD FOR WORD — the record keeps
                      exactly what this box said. */}
                  <Checkbox name="confirmed" required label={shared.acceptanceStatement} />
                  <div className="cluster">
                    <Button type="submit" loading={answering} disabled={answering}>
                      Accept proposal
                    </Button>
                  </div>
                </FieldStack>
              </form>
            )}

            {choice === "decline" && (
              <form action={(form) => void answer(form, "rejected")}>
                <FieldStack>
                  <Field label="Your full name">
                    <Input name="signerName" required maxLength={200} autoComplete="name" />
                  </Field>
                  <Field
                    label="Why not?"
                    optional
                    hint={`In your own words. It helps ${shared.firmName} understand.`}
                  >
                    <Textarea name="declinedReason" rows={3} maxLength={2000} />
                  </Field>
                  <div className="cluster">
                    <Button
                      type="submit"
                      variant="destructive"
                      loading={answering}
                      disabled={answering}
                    >
                      Decline proposal
                    </Button>
                  </div>
                </FieldStack>
              </form>
            )}

            <p className="muted text-sm mt-4">
              {/* A firm's legal name often ends in its own full stop ("10X
                  Global Inc."), and the sentence must not add a second one. */}
              Questions first? Reply to the email from {shared.firmName}
              {shared.firmName.endsWith(".") ? "" : "."}
            </p>
          </Card>
        </div>
      ) : (
        <p className="muted">{closing(shared)}</p>
      )}
    </Page>
  );
}

/**
 * The sentence under an answered, or closed, proposal. The answer given on
 * this page names who gave it; one the firm recorded does not, because that
 * record names a colleague, and a colleague is the firm's business.
 */
function closing(shared: SharedProposal): string {
  const by =
    shared.answer === null
      ? ""
      : ` by ${shared.answer.signerName} on ${longInstantTime(shared.answer.decidedAt)}`;
  switch (shared.status) {
    case "accepted":
      return `This proposal was accepted${by}.`;
    case "rejected":
      return `This proposal was declined${by}.`;
    case "expired":
      return `This proposal is no longer open. If you would still like the work, contact ${shared.firmName}${shared.firmName.endsWith(".") ? "" : "."}`;
    default:
      return "";
  }
}
