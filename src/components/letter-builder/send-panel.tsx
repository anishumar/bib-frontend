"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { api, apiError } from "@/lib/api/client";
import type { LetterRouting } from "@/lib/api/client";
import { browserDay } from "@/lib/day";
import { Button, Field, FieldRow, Input, LinkButton, Notice } from "@/components/ui";
import { Card, CardTitle } from "@/components/tw";
import { useSession } from "@/components/layout";
import { RoutingWarning } from "./routing-warning";
import { reloadLetter, useLetter } from "./store";
import { StandardsHelp } from "@/lib/ui/who-may";

/** "a, b and c". */
function andWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * SENDING THE LETTER FOR SIGNATURE, from the builder's step 3 (T6.18 S6).
 *
 * The letter page's send, unchanged in what it does: under DocuSign it asks who
 * signs for the client and DocuSign emails them; under the attested signer it
 * freezes the terms and the page records the signature later. The owner rule's
 * warning (T6.17) says whose desk each Dept's work will land on. Send stays
 * disabled, with the reason, until the letter has a service AND a term, the
 * two things the API refuses a send without.
 */
export function LetterSendPanel({ letterId, onSent }: { letterId: string; onSent?: () => void }) {
  const { record } = useLetter(letterId);
  const session = useSession();
  const [routing, setRouting] = useState<LetterRouting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState<string | null>(null);
  const [signerEmail, setSignerEmail] = useState("");

  const status = record?.letter.status ?? null;
  const unsigned = (status === "draft" || status === "sent") && record?.letter.deletedAt === null;

  useEffect(() => {
    if (!unsigned) return;
    void api
      .GET("/api/v1/engagement-letters/{letterId}/routing", { params: { path: { letterId } } })
      .then((r) => {
        setRouting(r.data ?? null);
      });
  }, [letterId, unsigned, record?.lines.length]);

  if (record === null) return null;
  const { letter, signing } = record;
  const isDraft = letter.status === "draft" && letter.deletedAt === null;
  const canWrite = session?.permissions.includes("party:write") ?? false;
  const providerName = signing.provider === "docusign" ? "DocuSign" : signing.provider;
  // CA#2 (audit 2026-10-03): page 1 must say something between "Dear …" and
  // "Yours sincerely"; the API refuses the send otherwise (LETTER_HAS_NO_BODY).
  const hasOpening = record.blocks.some((b) => b.kind === "cover" && !b.isHeading && b.body.trim() !== "");
  const missing = [
    record.lines.length === 0 ? "a service" : null,
    hasOpening ? null : "an opening paragraph under Cover letter",
    record.clauses.length === 0 ? "the terms" : null,
  ].filter((m): m is string => m !== null);
  const name = signerName ?? record.addressedTo?.displayName ?? "";

  async function send(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/engagement-letters/{letterId}/send", {
      // An undated letter is dated today where you are, never Greenwich's day.
      params: { path: { letterId }, query: { asOf: browserDay() } },
      ...(signing.sends ? { body: { signer: { name: name.trim(), email: signerEmail.trim() } } } : {}),
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await reloadLetter(letterId);
    onSent?.();
  }

  return (
    <Card>
      <div id={`send-${letterId}`}>
        <CardTitle level={2}>{isDraft ? "Send for signature" : "Where it stands"}</CardTitle>

        {isDraft && routing !== null && <RoutingWarning routing={routing} client={record.party} />}

        {isDraft && canWrite && (
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {signing.sends && (
              <FieldRow>
                <Field label="Who signs for the client">
                  <Input
                    value={name}
                    required
                    autoComplete="off"
                    onChange={(e) => {
                      setSignerName(e.target.value);
                    }}
                  />
                </Field>
                <Field label="Their email">
                  <Input
                    type="email"
                    value={signerEmail}
                    required
                    autoComplete="off"
                    placeholder="e.g. priya@acme.in"
                    onChange={(e) => {
                      setSignerEmail(e.target.value);
                    }}
                  />
                </Field>
              </FieldRow>
            )}
            {missing.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Add {andWords(missing)} before sending.</p>
                {/* Where the words come from, and who can write them (CA#3). */}
                <StandardsHelp
                  opening={!hasOpening}
                  terms={record.clauses.length === 0 ? "missing" : false}
                  issuerPartyId={record.issuer.partyId}
                  issuerHasCountry={record.issuer.jurisdiction !== null}
                />
              </div>
            )}
            {error !== null && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="cluster">
              <Button type="submit" loading={busy} disabled={busy || missing.length > 0}>
                {signing.sends ? `Send with ${providerName}` : "Send for signature"}
              </Button>
            </div>
          </form>
        )}

        {letter.status === "sent" && (
          <Notice tone="neutral" role="status">
            {signing.request === null
              ? "Sent for signature. Record the client's signature on the letter page when it comes back."
              : signing.request.envelopeId === null
                ? `Sent, but ${providerName} has not emailed it yet. Try again from the letter page.`
                : `Out for signature with ${providerName}, sent to ${signing.request.signerName}.`}
          </Notice>
        )}
        {letter.status === "signed" && <Notice tone="ok">Signed. This letter no longer changes.</Notice>}
        {letter.status === "withdrawn" && <Notice tone="warn">This letter was withdrawn.</Notice>}

        {!isDraft && (
          <div className="cluster mt-3">
            <LinkButton variant="secondary" href={`/engagement-letters/${letterId}` as Route}>
              Open the letter page
            </LinkButton>
          </div>
        )}
      </div>
    </Card>
  );
}
