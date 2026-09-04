"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import type { LetterSummary, PartySummary } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";

/**
 * Engagement letters — what the firm has AGREED, as opposed to what it offered.
 *
 * EVERY ROW LEADS WITH ITS REFERENCE. `EL-2026-0001` is the string the client
 * quotes back down the phone, the one an invoice narrates and a court filing
 * cites; the uuid is the system's name for the letter and this is the firm's.
 * A list that showed only the title made the one question a caller actually
 * asks — "which letter?" — unanswerable from this screen.
 *
 * The draft form asks WHERE and WHO separately, and that is not a formality.
 * `jurisdiction` is the law the letter is written under and it decides which
 * clauses may go on it; the ISSUING ENTITY is which of the firm's own companies
 * is bound by it. The letter that started this review was issued by the US
 * entity and printed Indian law, and nothing in the schema could have caught it
 * because nothing knew who had issued it.
 */
export default function LettersPage() {
  const router = useRouter();
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advance, setAdvance] = useState(false);
  // The prose and the dates are settable HERE and nowhere else: a letter is
  // editable only while it is a draft, and there is deliberately no route that
  // rewrites a sent one — the client already has it as it was sent.
  const [moreTerms, setMoreTerms] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, book] = await Promise.all([
      api.GET("/api/v1/engagement-letters", {}),
      api.GET("/api/v1/parties", {}),
    ]);
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setLetters(list.data.letters);
    if (book.data) setParties(book.data.parties);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function draft(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const amount = String(form.get("advanceAmount") ?? "").trim();
    // Only what has a value. An empty string is not a date, not a paragraph and
    // not a party — sending one would be this form asserting a fact nobody
    // entered, and the API's schemas refuse it anyway.
    const text = (name: string): string => String(form.get(name) ?? "").trim();
    const background = text("background");
    const addressedToPartyId = text("addressedToPartyId");
    const issuedOn = text("issuedOn");
    const effectiveFrom = text("effectiveFrom");
    const supersedesId = text("supersedesId");
    const issuingEntityPartyId = text("issuingEntityPartyId");

    const result = await api.POST("/api/v1/engagement-letters", {
      body: {
        partyId: String(form.get("partyId")),
        jurisdiction: String(form.get("jurisdiction")).toUpperCase(),
        title: String(form.get("title")),
        currency: String(form.get("currency")).toUpperCase(),
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        advanceRequired: advance,
        ...(advance && amount !== "" ? { advanceAmount: amount } : {}),
        ...(issuingEntityPartyId === "" ? {} : { issuingEntityPartyId }),
        ...(background === "" ? {} : { background }),
        ...(addressedToPartyId === "" ? {} : { addressedToPartyId }),
        ...(issuedOn === "" ? {} : { issuedOn }),
        ...(effectiveFrom === "" ? {} : { effectiveFrom }),
        ...(supersedesId === "" ? {} : { supersedesId }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/engagement-letters/${result.data.id}`);
  }

  if (!loaded) return <Loading />;

  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();
  // A letter already replaced cannot be replaced again — the API refuses a
  // second successor, naming the first — and a draft or a withdrawn letter was
  // never supersedable at all. The list already carries both facts, so the
  // picker offers only what will work rather than a slower error.
  const replaced = new Set(
    letters.map((l) => l.letter.supersedesId).filter((id): id is string => id !== null),
  );
  const supersedable = letters.filter(
    (l) => l.letter.status === "signed" && !replaced.has(l.letter.id),
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="Engagement letters"
        lede="What each client has actually signed, and what is still a draft."
        aside={<Pill tone="quiet">{letters.length}</Pill>}
      />
      <ErrorNotice error={error} />

      <Card>
        {letters.length === 0 ? (
          <p className="muted">
            Nothing agreed yet.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Ref</Th>
                  <Th>Letter</Th>
                  <Th>Client</Th>
                  <Th>Issued by</Th>
                  <Th>Status</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.letter.id}>
                    {/* The number, first, because it is what somebody arrives
                        holding. */}
                    <Td className="mono">
                      <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.ref}</Link>
                    </Td>
                    <Td>
                      <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.title}</Link>
                      <div className="muted text-sm">
                        {l.lineCount} {l.lineCount === 1 ? "service" : "services"}
                        {l.letter.advanceRequired && " · advance required"}
                        {l.letter.effectiveFrom !== null && ` · from ${longDay(l.letter.effectiveFrom)}`}
                      </div>
                    </Td>
                    <Td>{l.party.displayName}</Td>
                    {/* WHO is bound, and WHERE the law is — the two questions the
                        jurisdiction alone could never answer, side by side. */}
                    <Td>
                      {l.issuingEntity.displayName}
                      <div className="mono muted text-sm">
                        {l.letter.jurisdiction}
                      </div>
                    </Td>
                    <Td>
                      <Pill tone={l.letter.status === "withdrawn" ? "danger" : "neutral"}>
                        {l.letter.status}
                      </Pill>
                    </Td>
                    <Td align="right" className="mono">
                      {formatMoney(l.totals.net, l.totals.currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardTitle level={2}>New engagement letter</CardTitle>
        <form
          action={(form) => {
            void draft(form);
          }}
        >
          {/* Eight hand-written `marginBottom`s down this form, and none under
              the last row — which is a stack, spelt out. `.select` is already
              `width: 100%`, so the four inline widths styled nothing. */}
          <FieldStack>
            <FieldRow>
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Client">
                <Select name="partyId" required>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Written for">
                {/* Stated, not inferred: not always the client's, not always the
                    firm's, and it decides which clauses may go on the letter. */}
                <Input name="jurisdiction" defaultValue="IN" maxLength={2} required />
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Currency">
                <Input name="currency" defaultValue="INR" maxLength={3} required />
              </Field>
              <Field label="Rate to the firm&apos;s currency">
                <Input name="fxRate" defaultValue="1" required />
              </Field>
              <Field label="Rate dated">
                <Input name="fxRateDate" type="date" defaultValue={today} required />
              </Field>
            </FieldRow>

            <Checkbox
              label="An advance is required before work begins. Engagements will be held until it is recorded — no advance, no jobs."
              checked={advance}
              onChange={(e) => {
                setAdvance(e.target.checked);
              }}
            />
            {advance && (
              <FieldRow>
                {/* Required once the box is ticked — the API refuses a gate with
                    no figure, because nobody can pass one. */}
                <Field label="Advance amount">
                  <Input name="advanceAmount" required />
                </Field>
              </FieldRow>
            )}

            {/* Split at the em dash the sentence already had, so the words and
                the rendering are unchanged and the NAME of the control is
                "Write the document" rather than all three lines of it. */}
            <Checkbox
              label="Write the document"
              note="who it is addressed to, why they are buying, its date, when the work begins, and the letter it replaces. Every one of these is frozen at signature, and none of them can be added afterwards."
              checked={moreTerms}
              onChange={(e) => {
                setMoreTerms(e.target.checked);
              }}
            />

            {moreTerms && (
              <>
                <FieldRow>
                  <Field label="Issued by">
                    {/* Stored, never derived: the firm's rule for picking an
                        entity may change, and re-deriving this at read time
                        would silently restate every letter already issued. Left
                        blank, the API applies the firm's own preference for this
                        jurisdiction. */}
                    <Select name="issuingEntityPartyId" defaultValue="">
                      <option value="">the firm&apos;s entity for this jurisdiction</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Addressed to">
                    {/* A named PERSON, care-of the client above. Not who is
                        billed — that is the client — which is why it is a second
                        field and not a rename of the first. */}
                    <Select name="addressedToPartyId" defaultValue="">
                      <option value="">nobody named — the organization</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FieldRow>

                <Field label="Background">
                  <Textarea
                    name="background"
                    rows={4}
                    placeholder="Why this client is buying this — the paragraph the letter opens with."
                  />
                </Field>

                {/* These three sentences were loose `<p>`s under their fields,
                    read by nobody: `.field-hint` already carries the 4px they
                    were hand-rolling, and as `hint` they become the field's own
                    `aria-describedby`. */}
                <FieldRow>
                  <Field
                    label="Dated"
                    hint="The date under the letterhead. Blank means the day it is sent."
                  >
                    <Input name="issuedOn" type="date" />
                  </Field>
                  <Field
                    label="Work begins"
                    hint="Blank means the signature date. A line may start later still."
                  >
                    <Input name="effectiveFrom" type="date" />
                  </Field>
                  <Field
                    label="Replaces"
                    hint={
                      supersedable.length === 0
                        ? "No signed letter is waiting to be replaced."
                        : "A signed letter is never edited. This is how the change is recorded."
                    }
                  >
                    <Select
                      name="supersedesId"
                      defaultValue=""
                      disabled={supersedable.length === 0}
                    >
                      <option value="">nothing — this is a new agreement</option>
                      {supersedable.map((l) => (
                        <option key={l.letter.id} value={l.letter.id}>
                          {l.letter.ref} — {l.party.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FieldRow>
              </>
            )}

            {/* A `cluster`, because the stack is a flex COLUMN and a button laid
                straight into one stretches the width of the card. */}
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {busy ? "Drafting…" : "Draft letter"}
              </Button>
            </div>
          </FieldStack>
        </form>
      </Card>
    </Page>
  );
}
