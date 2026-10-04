"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { ErrorState, Loading } from "@/components/states";
import { Button, Checkbox, ErrorNotice, Field, FieldStack, Input, Stat, Strip, Textarea } from "@/components/ui";
import { PdfPages } from "@/components/pdf-pages";
import { Card, CardTitle } from "@/components/tw";
import type { SharedProposal } from "@/lib/api/client";
import { longDay, longInstantTime } from "@/lib/day";
import { addDecimals } from "@/lib/money";
import { FREQUENCY_WORDS } from "@/components/proposal-document/words";
import { plural } from "@/lib/plural";
import { keepTyped } from "@/lib/ui/keep-typed";

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
 * THE PROPOSAL ITSELF IS THE PDF (2026-09-28): the pages are the PDF of
 * record (`POST /proposals/shared/pdf`, the file the email attached), drawn
 * with pdf.js above the answer box, where a table and a card of its wording
 * used to imitate it. The totals per frequency stay in the answer box, so the
 * figure the client is agreeing to sits beside the button that agrees to it.
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
  /** The PDF of record's bytes, drawn on the page and saved from here. */
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
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

  // The pages. Not for an expired proposal: the link no longer serves its PDF.
  const status = shared?.status ?? null;
  useEffect(() => {
    if (status === null || status === "expired") return;
    let live = true;
    void api
      .POST("/api/v1/proposals/shared/pdf", { body: { token }, parseAs: "arrayBuffer" })
      .then((result) => {
        if (!live) return;
        if (result.error) {
          setPdfError(apiError(result.error).message);
          return;
        }
        setPdf(new Uint8Array(result.data as unknown as ArrayBuffer));
      });
    return () => {
      live = false;
    };
  }, [status, token]);

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
    if (pdf !== null) {
      // The very bytes on the page.
      save(new Blob([pdf.slice()], { type: "application/pdf" }), filename);
      return;
    }
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
    save(result.data as unknown as Blob, filename);
  }

  function save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
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
            {shared.ref} · Prepared for {shared.addressedTo}
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

      {pdfError !== null && <ErrorNotice error={pdfError} />}
      {shared.status !== "expired" && pdfError === null && (
        <PdfPages data={pdf} label={`Proposal ${shared.ref}`} />
      )}

      {shared.status === "sent" ? (
        <div ref={answerCard} tabIndex={-1}>
          <Card>
            <CardTitle level={2}>Your answer</CardTitle>
            <FrequencyTotals shared={shared} />
            <p className="text-md mb-3">
              Your name is recorded with your answer, and {shared.firmName} is told at once.
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
              <form onSubmit={(event) => keepTyped(event, (form) => answer(form, "accepted"))}>
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
              <form onSubmit={(event) => keepTyped(event, (form) => answer(form, "rejected"))}>
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
        <>
          <FrequencyTotals shared={shared} />
          <p className="muted">{closing(shared)}</p>
        </>
      )}
    </Page>
  );
}

/**
 * THE TOTAL, PER FREQUENCY (D8), as the PDF the client holds ends its Summary
 * of Fees. One figure for a month's fee and a set-up fee added together
 * ("Total ₹70,000" for ₹45,000 a month and ₹25,000 once) is a number nobody is
 * ever billed, and it was the only total this page drew until the W4D walk
 * found it. The shared read has no per-frequency sum, so the nets are added
 * here exactly as strings (`addDecimals`), never as JS numbers. With one
 * frequency the API's own total stands, with its discount note.
 */
function FrequencyTotals({ shared }: { shared: SharedProposal }) {
  const groups = totalsByFrequency(shared.lines, shared.currency);
  const [one] = shared.totals;
  // ONE PER CURRENCY (0344): two currencies are never added, so a proposal in
  // dollars and dirhams shows each, and the label names which.
  const several = shared.totals.length > 1;
  const only = groups?.[0]?.frequency ?? null;
  const unpriced = shared.totals.reduce((n, t) => n + t.unpricedLineCount, 0);
  return (
    <div className="mb-4 flex flex-col gap-2">
      <Strip>
        {!several && one !== undefined && (groups === null || groups.length <= 1) ? (
          <Stat
            label={only === null ? "Total" : `${FREQUENCY_WORDS[only]} total`}
            value={formatMoney(one.net, one.currency)}
            figure={{ amount: one.net, currency: one.currency }}
            /* "0.00" is no discount too: the wire sends a decimal string, and
               comparing it to "0" drew "after ₹0 off ₹65,000" (Wave 4). */
            {...(!/^-?0*(\.0*)?$/.test(one.discount)
              ? {
                  note: `after ${formatMoney(one.discount, one.currency)} off ${formatMoney(one.gross, one.currency)}`,
                }
              : {})}
          />
        ) : (
          (groups ?? []).map((g) => (
            <Stat
              key={`${g.currency}:${g.frequency ?? "none"}`}
              label={
                (g.frequency === null ? "Total, frequency not set" : `${FREQUENCY_WORDS[g.frequency]} total`) +
                (several ? ` in ${g.currency}` : "")
              }
              value={formatMoney(g.net, g.currency)}
              figure={{ amount: g.net, currency: g.currency }}
            />
          ))
        )}
      </Strip>
      {unpriced > 0 && (
        <p className="text-md">
          Plus {plural(unpriced, "service")} as mutually agreed.
        </p>
      )}
    </div>
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

const FREQUENCY_ORDER = ["monthly", "quarterly", "annually", "one_time", "custom", null] as const;

/**
 * The priced lines' nets summed per billing frequency, in the order the PDF
 * prints them, as exact decimal strings. Null when a net is not a plain
 * decimal (the page then falls back to the API's one total rather than guess).
 */
function totalsByFrequency(
  lines: SharedProposal["lines"],
  main: string,
): { currency: string; frequency: SharedProposal["lines"][number]["billingFrequency"]; net: string }[] | null {
  // Per currency, then per frequency: one currency's nets added as exact
  // strings, never across currencies (0344). The main currency first.
  const currencies = [...new Set(lines.map((l) => l.currency))].sort((a, b) =>
    a === main ? -1 : b === main ? 1 : a.localeCompare(b),
  );
  const out: { currency: string; frequency: SharedProposal["lines"][number]["billingFrequency"]; net: string }[] = [];
  for (const currency of currencies) {
    const groups = new Map<SharedProposal["lines"][number]["billingFrequency"], string[]>();
    for (const l of lines) {
      if (l.net === null || l.currency !== currency) continue;
      groups.set(l.billingFrequency, [...(groups.get(l.billingFrequency) ?? []), l.net]);
    }
    for (const f of FREQUENCY_ORDER) {
      const nets = groups.get(f);
      if (nets === undefined) continue;
      const net = addDecimals(nets);
      if (net === null) return null;
      out.push({ currency, frequency: f, net });
    }
  }
  return out;
}
