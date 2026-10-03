"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Documents } from "@/lib/ui/documents";
import {
  CREDIT_REASONS,
  CREDIT_REASON_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  api,
  apiError,
  billingPersonName,
  codeLabel,
  colleagueLabel,
  formatCount,
  formatMoney,
  invoiceNumberWords,
  perPeriod,
} from "@/lib/api/client";
import type {
  BillableEngagement,
  Colleague,
  CreditNote,
  DunningAction,
  InvoiceBalance,
  InvoiceRecord,
  Payment,
} from "@/lib/api/client";
import {
  Button,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Meta,
  MetaItem,
  NotSet,
  Select,
  AmountInput,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { ConfirmAction } from "@/components/confirm-action";
import {
  Card,
  CardTitle,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { browserDay, longDay } from "@/lib/day";
import { cleanAmount } from "@/lib/money";

/**
 * One invoice: what it says, what has been paid against it, and what is left.
 *
 * THE BALANCE IS NEVER COMPUTED HERE. The API returns invoiced, paid, credited
 * and outstanding, all computed by Postgres in `numeric` over three tables, and
 * this screen renders the four strings. Adding them up in JavaScript would be
 * the one place a rounding error could enter money that has already been agreed
 * — and it would put a second answer beside the database's.
 *
 * There is no "paid" badge, because there is no such column: an invoice's
 * status is about the DOCUMENT (drafted, sent, withdrawn) and what has been
 * paid is arithmetic. A badge would be a cache of a sum, and it would drift the
 * first time a payment was corrected.
 *
 * Every rule is the API's. Whether this invoice may still be edited, whether a
 * credit would exceed it, whether money may be applied at all: each comes back
 * as a refusal written to be acted on, and this screen shows it verbatim.
 */
export default function InvoicePage() {
  const router = useRouter();
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;

  const [record, setRecord] = useState<InvoiceRecord | null>(null);
  const [balance, setBalance] = useState<InvoiceBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [chased, setChased] = useState<DunningAction[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  /** Active staff, for a draft's Manager (T4). */
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  /**
   * WHAT THIS CLIENT HAS SIGNED FOR, so a line can be billed from it.
   *
   * Loaded beside the invoice rather than when the picker is touched: a native
   * `<select>` opens the instant it is clicked, so options fetched on focus
   * arrive after the reader is already looking at an empty list — the mistake
   * `/client-requests`' document picker made and this file should not repeat.
   */
  const [billable, setBillable] = useState<BillableEngagement[]>([]);
  /** The engagement the new line is being billed from, or null for a one-off —
   *  a certificate, a recharge, something that never had a contract. */
  const [chosen, setChosen] = useState<BillableEngagement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const path = { params: { path: { invoiceId } } };
    const [one, bal, paid, credited, dunning, me, staff] = await Promise.all([
      api.GET("/api/v1/invoices/{invoiceId}", path),
      api.GET("/api/v1/invoices/{invoiceId}/balance", path),
      api.GET("/api/v1/invoices/{invoiceId}/payments", path),
      api.GET("/api/v1/invoices/{invoiceId}/credit-notes", path),
      api.GET("/api/v1/invoices/{invoiceId}/dunning", path),
      api.GET("/api/v1/auth/me", {}),
      api.GET("/api/v1/tenancy/colleagues", {}),
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
    if (bal.data) setBalance(bal.data);
    if (paid.data) setPayments(paid.data.payments);
    if (credited.data) setCredits(credited.data.creditNotes);
    if (dunning.data) setChased(dunning.data.actions);
    if (me.data) setPermissions(me.data.permissions);
    setColleagues(staff.data ? [...staff.data.colleagues] : []);

    // A SECOND ROUND TRIP, and it needs the invoice first: the engagements
    // belong to the CLIENT, whose id is on the record that has only just
    // arrived. A 403 here is ordinary — it is `party:read` — and leaves the
    // picker absent rather than the page broken.
    const engagements = await api.GET("/api/v1/parties/{partyId}/billable-engagements", {
      params: { path: { partyId: one.data.invoice.partyId } },
    });
    setBillable(engagements.data?.engagements ?? []);

    setError(null);
    setLoaded(true);
  }, [invoiceId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write goes through here: run it, show the API's own words on
   *  failure, and re-read on success rather than patching local state — the
   *  totals and the balance are the database's answer, not this screen's. */
  async function act(run: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await run();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!loaded) return <Loading />;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger" role="alert">
          {error ?? "No such invoice."}
        </Notice>
      </Page>
    );
  }

  const invoice = record.invoice;
  const draft = invoice.status === "draft";
  const issued = invoice.status === "issued";
  const mayAdmin = permissions.includes("tenant:admin");
  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();

  return (
    <Page>

      {/* The tab carries the identifier, the same as the proposal and the
          engagement letter. Walked with several tabs open and this one was
          "BiB — 10X Workspace" while its neighbours said which document they
          were: the tab strip is how a person finds their way back. */}
      <title>{`${invoiceNumberWords(invoice.number, invoice.status)} · ${record.party.displayName}`}</title>

      {/* THE WAVE 4 SHAPE (2026-09-28): the number in the sans face (it was
          the typewriter), the status a pill in words under it, and Issue — a
          draft's one committing act — the brand button where the eye lands.
          It is still offered only to an administrator (it uses a number). */}
      <PageHeader
        title={invoice.number ?? (invoice.status === "cancelled" ? "Cancelled draft" : "Draft invoice")}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            {record.party.displayName}
            {/* `ok`, not `accent`. Same word, different meaning under
                Tailwind — see the note in tailwind.css. */}
            <Pill dot tone={invoice.status === "cancelled" ? "danger" : issued ? "ok" : "neutral"}>
              {codeLabel(invoice.status)}
            </Pill>
          </span>
        }
        actions={
          draft && mayAdmin ? (
            // Confirmed (V1.3): issuing locks the money on a numbered tax
            // document, and the only way back is to cancel it.
            <ConfirmAction
              disabled={busy}
              title={invoice.number === null ? "Issue this invoice?" : `Issue ${invoice.number}?`}
              confirmLabel="Issue it"
              consequence={
                <p>
                  {invoice.number === null
                    ? `It gets the next number in ${record.entity.displayName}'s series and becomes a tax invoice dated ${longDay(browserDay())}.`
                    : `${invoice.number} becomes a tax invoice dated ${longDay(browserDay())}.`}{" "}
                  Its lines and amounts are then locked, and its PDF is filed and shown to the
                  client. To correct it later, you cancel it and raise a new invoice.
                </p>
              }
              onConfirm={() =>
                void act(() =>
                  // The date printed on the tax invoice: today where the
                  // person issuing it is, not Greenwich's day.
                  api.POST("/api/v1/invoices/{invoiceId}/issue", {
                    params: { path: { invoiceId }, query: { asOf: browserDay() } },
                  }),
                )
              }
            >
              Issue
            </ConfirmAction>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      <Card>
        <Meta>
          <MetaItem label="Bill to">{record.party.displayName}</MetaItem>
          {/* WHO IS CHARGING — one of the firm's own entities, and the owner of
              the series this number came from. Two of a firm's companies each
              issue their own INV/2026-27/0001, so the number alone is not an
              identifier without this. */}
          <MetaItem label="Charged by">{record.entity.displayName}</MetaItem>
          <MetaItem label="Issued">
            {invoice.issuedOn === null ? <NotSet>Not yet</NotSet> : longDay(invoice.issuedOn)}
          </MetaItem>
          <MetaItem label="Due">
            {invoice.dueOn === null ? <NotSet>No date</NotSet> : longDay(invoice.dueOn)}
          </MetaItem>
          <MetaItem label="Series">
            FY {invoice.financialYear}-{String((invoice.financialYear + 1) % 100).padStart(2, "0")},
            number {invoice.sequenceNumber}
          </MetaItem>
          <MetaItem label="Rate">
            <span className="num">
              {invoice.fxRate === null ? <NotSet>Hidden</NotSet> : formatCount(invoice.fxRate)} on{" "}
              {longDay(invoice.fxRateDate)}
            </span>
          </MetaItem>
          {/* WHOSE REVENUE THIS IS (0318): the manager it was raised under,
              frozen once issued. A hand-raised invoice may name nobody. On a
              DRAFT it changes here, saved as it changes (T4): the number is
              already drawn, so a wrong pick should not need a cancellation. */}
          <MetaItem label="Manager">
            {draft && permissions.includes("party:write") ? (
              <Select
                variant="quiet"
                size="sm"
                aria-label="Manager"
                value={invoice.managerUserId ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value;
                  void act(() =>
                    api.PUT("/api/v1/invoices/{invoiceId}/manager", {
                      params: { path: { invoiceId } },
                      body: { managerUserId: next === "" ? null : next },
                    }),
                  );
                }}
              >
                <option value="">No manager</option>
                {/* Somebody who has left stays shown while they are the one
                    named, or the box would claim a choice nobody made. */}
                {record.manager !== null && !colleagues.some((c) => c.userId === record.manager?.userId) && (
                  <option value={record.manager.userId}>{billingPersonName(record.manager)} (left)</option>
                )}
                {colleagues.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {colleagueLabel(c)}
                  </option>
                ))}
              </Select>
            ) : record.manager === null ? (
              <NotSet />
            ) : (
              billingPersonName(record.manager)
            )}
          </MetaItem>
          {/* The letters its lines bill, as the PDF prints them. */}
          <MetaItem label={record.letters.length > 1 ? "Engagement letters" : "Engagement letter"}>
            {record.letters.length === 0 ? (
              <NotSet />
            ) : (
              record.letters.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <Link href={`/engagement-letters/${l.id}` as Route}>{l.ref}</Link>
                </span>
              ))
            )}
          </MetaItem>
        </Meta>
        {/* NOTHING IS OWED on a draft or a cancelled invoice, and the four
            boxes said otherwise: a cancelled one showed its full value as
            Outstanding, a draft four zeros that read as settled. The list says
            "Not issued" and Receivables counts only issued ones; so does this. */}
        {draft && (
          <p className="mt-3 text-sm text-muted">Not issued yet, so nothing is owed.</p>
        )}
        {invoice.status === "cancelled" && (
          <p className="mt-3 text-sm text-muted">Cancelled, so nothing is owed.</p>
        )}
      </Card>

      {/* ── The money, as the database computed it ─────────────────────── */}
      {issued && balance !== null && (
        <Card>
          <CardTitle level={2}>What is owed</CardTitle>
          <Meta>
            <MetaItem label="Invoiced">
              <span className="num">{formatMoney(balance.invoiced, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Paid">
              <span className="num">{formatMoney(balance.paid, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Credited">
              <span className="num">{formatMoney(balance.credited, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Outstanding">
              {/* A NEGATIVE outstanding is not an error: the client overpaid, or
                  settled two invoices with one transfer. The API records what
                  actually arrived rather than what was tidy, and so does this. */}
              <strong className="num">{formatMoney(balance.outstanding, balance.currency)}</strong>
            </MetaItem>
          </Meta>
          {balance.outstanding?.startsWith("-") === true && (
            <p className="max-w-[var(--measure)] text-sm text-muted">
              More received than billed: an overpayment, or one transfer for several invoices.
            </p>
          )}
        </Card>
      )}

      {/* ── The lines ──────────────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Lines</CardTitle>
        {record.lines.length === 0 ? (
          <p className="text-sm text-muted">No lines yet. It needs one before it can be issued.</p>
        ) : (
          <TableWrap>
        <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit</Th>
                <Th align="right">Discount</Th>
                <Th align="right">Tax</Th>
                <Th align="right">Net</Th>
                {draft && <Th />}
              </tr>
            </thead>
            <tbody>
              {record.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td align="right">{formatCount(l.quantity)}</Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(l.unitAmount, l.currency)}
                  </Td>
                  {/* A discount is a price, so the fee axis takes it too — an
                      em dash rather than "0%", which would be a figure this
                      reader was not shown rather than one that is true. */}
                  <Td align="right">
                    {l.discountPercent === null ? <NotSet>None</NotSet> : `${formatCount(l.discountPercent)}%`}
                  </Td>
                  {/* Tax is per LINE because it is per service: 18% on
                      professional fees and 0% on a recharge, on one invoice. */}
                  <Td align="right" className="nowrap">
                    {formatCount(l.taxPercent)}% · {formatMoney(l.tax, l.currency)}
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(l.net, l.currency)}
                  </Td>
                  {draft && (
                    <Td align="right">
                      {/* NAMED BY THE LINE, for the reason the proposal's is:
                          no demo invoice is a draft, so this column has only
                          ever been seen by forcing `draft` true for one
                          reload, and never with more than one line under it. */}
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        aria-label={`Remove ${l.description} from this invoice`}
                        onClick={() =>
                          void act(() =>
                            api.DELETE("/api/v1/invoices/{invoiceId}/lines/{lineId}", {
                              params: { path: { invoiceId, lineId: l.id } },
                            }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <Td colSpan={4} />
                <Td align="right" className="label">
                  Tax
                </Td>
                <Td align="right" className="nowrap">
                  {formatMoney(record.totals.tax, record.totals.currency)}
                </Td>
                {draft && <Td />}
              </tr>
              <tr>
                <Td colSpan={4} />
                <Td align="right" className="label">
                  Total
                </Td>
                <Td align="right" className="nowrap">
                  <strong>{formatMoney(record.totals.total, record.totals.currency)}</strong>
                </Td>
                {draft && <Td />}
              </tr>
            </tfoot>
          </Table>
        </TableWrap>
        )}

        {draft && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const discount = cleanAmount(String(form.get("discountPercent") ?? ""));
              const tax = cleanAmount(String(form.get("taxPercent") ?? ""));
              const engagementId = String(form.get("engagementId") ?? "");
              void act(async () => {
                const result = await api.POST("/api/v1/invoices/{invoiceId}/lines", {
                  params: { path: { invoiceId } },
                  body: {
                    description: String(form.get("description")),
                    quantity: cleanAmount(String(form.get("quantity"))),
                    unitAmount: cleanAmount(String(form.get("unitAmount"))),
                    ...(discount === "" ? {} : { discountPercent: discount }),
                    ...(tax === "" ? {} : { taxPercent: tax }),
                    // WHAT THE WORK WAS. `crm.invoice_line.engagement_id` has
                    // existed since T3.4 with nothing offering it, so every
                    // line billed a client for something the system could not
                    // connect to the contract that agreed it.
                    ...(engagementId === "" ? {} : { engagementId }),
                  },
                });
                if (!result.error) setChosen(null);
                return result;
              });
            }}
          >
            <FieldStack>
              {/* THE OTHER END OF THE CARRY-FORWARD. Walked: the letter's
                  agreed price reached nothing here — there was no picker and
                  no link to the contract, so ₹1,75,000 was typed a THIRD time.
                  Choosing an engagement fills the description, the quantity,
                  the price and the discount from the letter LINE, and they stay
                  editable: an invoice bills a period, and a month at 1/12 of a
                  yearly fee is an ordinary thing to type over the top. */}
              {billable.length > 0 && (
                <Field
                  label="What is this for?"
                  hint="Fills the agreed wording and price. Edit them for one period."
                >
                  <Select
                    name="engagementId"
                    value={chosen?.engagementId ?? ""}
                    onChange={(e) => {
                      const next =
                        billable.find((b) => b.engagementId === e.target.value) ?? null;
                      setChosen(next);
                    }}
                  >
                    <option value="">Not from an engagement (type it below)</option>
                    {billable.map((b) => {
                      /* ANOTHER COMPANY SIGNED IT, said rather than hidden, as
                         the advance gate is. This invoice's number is in its
                         own company's series, so it can only bill that
                         company's letters; the API refuses the rest. */
                      const otherCompany = b.issuingEntityPartyId !== invoice.entityPartyId;
                      /* And another currency: a line takes the invoice's, so
                         USD 3,000 would be billed as ₹3,000. The API refuses
                         it too (ENGAGEMENT_IN_ANOTHER_CURRENCY). */
                      const otherCurrency = b.currency !== invoice.currency;
                      return (
                        <option
                          key={b.engagementId}
                          value={b.engagementId}
                          /* THE ADVANCE GATE, said rather than hidden. The row
                             comes back either way so the screen can explain why
                             a service the client signed for cannot be billed
                             yet — a picker that silently dropped it could not. */
                          disabled={otherCompany || otherCurrency || b.status !== "active"}
                        >
                          {b.entityName}: {b.description}
                          {b.feeGroup !== null
                            ? ` (in section ${b.feeGroup.code}, ${b.feeGroup.title})`
                            : b.unitAmount === null
                              ? " (no price agreed)"
                              : ""}
                          {otherCompany
                            ? ` (billed by ${b.issuingEntityName})`
                            : otherCurrency
                              ? ` (priced in ${b.currency})`
                              : b.status === "active"
                                ? ""
                                : " (waiting on the advance)"}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
              )}
              {chosen !== null && (
                <p className="field-hint">
                  From {chosen.letterRef}
                  {/* ONE FEE FOR SEVERAL SERVICES (0083). Its figure is the
                      whole section's, so it is named and never prefilled: four
                      services of a 5,000 retainer are billed 5,000, not 20,000. */}
                  {chosen.feeGroup !== null
                    ? `. It is one of ${String(chosen.feeGroup.lineCount)} services in section ${chosen.feeGroup.code}, ${chosen.feeGroup.title}, priced together at ${
                        chosen.feeGroup.amount === null
                          ? "a fee hidden from you"
                          : `${formatMoney(chosen.feeGroup.amount, chosen.currency)}${perPeriod(chosen.feeGroup.billingFrequency)}`
                      }. Bill the section once for the period, not once per service.`
                    : ""}
                  {chosen.feeGroup === null && chosen.pricingNote !== null ? ` · ${chosen.pricingNote}` : ""}
                  {chosen.feeGroup === null && chosen.unitAmount === null
                    ? ". This line was agreed with no price, so type the figure you are billing."
                    : ""}
                </p>
              )}
              <FieldRow>
                <Field label="Description">
                  {/* KEYED ON THE CHOICE. `defaultValue` is read once at mount,
                      so without the key a second pick would leave the first
                      one's wording in the box — the state-picker bug this repo
                      fixed on the work item, in a new place. */}
                  <Input
                    key={`d-${chosen?.engagementId ?? "none"}`}
                    name="description"
                    defaultValue={chosen?.description ?? ""}
                    required
                    placeholder="e.g. Monthly bookkeeping, October"
                  />
                </Field>
                {/* The letter's figures as a person writes them: the API sends
                    the column's scale ("1.0000", "25000.0000"), and
                    `formatCount` trims it on the string, never via a number. */}
                <Field label="Qty">
                  <AmountInput decimals={4}
                    key={`q-${chosen?.engagementId ?? "none"}`}
                    name="quantity"
                    defaultValue={chosen === null ? "1" : formatCount(chosen.quantity)}
                    required
                  />
                </Field>
                <Field label="Unit amount">
                  <AmountInput
                    key={`u-${chosen?.engagementId ?? "none"}`}
                    name="unitAmount"
                    defaultValue={chosen?.unitAmount == null ? "" : formatCount(chosen.unitAmount)}
                    required
                    placeholder="e.g. 50000"
                  />
                </Field>
                <Field label="Discount %">
                  <AmountInput decimals={4}
                    key={`x-${chosen?.engagementId ?? "none"}`}
                    name="discountPercent"
                    defaultValue={chosen === null ? "0" : formatCount(chosen.discountPercent)}
                  />
                </Field>
                <Field label="Tax %">
                  <AmountInput decimals={4} name="taxPercent" defaultValue="0" />
                </Field>
              </FieldRow>
              <div className="cluster">
                <Button type="submit" variant="secondary" disabled={busy}>
                  Add line
                </Button>
              </div>
            </FieldStack>
          </form>
        )}
      </Card>

      {/* ── Issue, cancel, register ────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>The document</CardTitle>
        {!mayAdmin && (draft || issued) && (
          /* Both use up a number in the series. */
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Only a firm administrator can issue or cancel an invoice.
          </p>
        )}
        {/* Issue moved to the page header (Wave 4); Cancel stays here, away
            from it. */}
        <div className="cluster">
          {(draft || issued) && mayAdmin && (
            /* SAYS WHICH CANCEL, because the other one on this screen is
               nothing like it. Open the Documents dialog and there are two
               buttons reading "Cancel": that one closes an upload form, this
               one VOIDS THE INVOICE and it keeps its number forever. Somebody
               moving between buttons by name had no way to tell them apart.
               The visible word is unchanged. */
            <ConfirmAction
              variant="destructive-quiet"
              size="sm"
              disabled={busy}
              aria-label={invoice.number === null ? "Cancel this draft invoice" : `Cancel invoice ${invoice.number}`}
              title={invoice.number === null ? "Cancel this draft?" : `Cancel ${invoice.number}?`}
              confirmLabel="Cancel the invoice"
              destructive
              consequence={
                <p>
                  {invoice.number === null
                    ? "The draft is voided. It has no number yet, so none is used up."
                    : `${invoice.number} is voided. It keeps this number, which cannot be used again.`}{" "}
                  Raise a new invoice to replace it.
                </p>
              }
              onConfirm={() =>
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/cancel", { params: { path: { invoiceId } } }),
                )
              }
            >
              Cancel
            </ConfirmAction>
          )}
        </div>
        {invoice.status === "cancelled" && (
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Cancelled. It keeps its number; raise a new invoice to replace it.
          </p>
        )}

        {/* The government registry's identifier. Nothing in this product talks
            to the IRP: this records an answer obtained elsewhere, exactly as the
            advance-fee gate records an attestation. */}
        <div>
          <Meta>
            <MetaItem label="IRN">
              {invoice.irn === null ? (
                <NotSet>Not registered</NotSet>
              ) : (
                <span className="mono">{invoice.irn}</span>
              )}
            </MetaItem>
          </Meta>
          {invoice.irn === null && (
            /* Behind a disclosure (Wave 4): recorded once per invoice. */
            <details style={{ marginTop: "var(--s-3)" }}>
              <summary>Record the e-invoice reference</summary>
            <form
              style={{ marginTop: "var(--s-3)" }}
              action={(form) => {
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/irn", {
                    params: { path: { invoiceId } },
                    body: { irn: String(form.get("irn")) },
                  }),
                );
              }}
            >
              {/* The button was a CELL of the grid, held down with
                  `alignSelf: end` so it lined up with an input that has a hint
                  under it — which it did not, because the hint made the first
                  cell taller. Out of the grid and into a cluster, it lines up
                  with itself. */}
              <FieldStack>
                <FieldRow>
                  <Field
                    label="Record the e-invoice reference"
                    hint="The IRN from the e-invoice portal. It cannot change later."
                  >
                    <Input name="irn" required placeholder="e.g. 7d3c1f0a9b8e…" />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={busy}
                    /* SAYS WHAT IT RECORDS. This button sits in the same card
                       as "Cancel", which VOIDS the invoice and keeps its number
                       forever, and its own visible word is "Record" — record
                       what? Somebody moving between buttons by name heard
                       "Cancel invoice INV/2026-27/0004" and then one bare verb.
                       The field beside it already carries the full sentence;
                       the button did not use it. The visible word is
                       unchanged. */
                    aria-label={`Record the e-invoice reference for ${invoice.number}`}
                  >
                    Record
                  </Button>
                </div>
              </FieldStack>
            </form>
            </details>
          )}
        </div>
      </Card>

      {/* ── Money against it ───────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Payments</CardTitle>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">Nothing received.</p>
        ) : (
          <TableWrap>
        <Table>
            <thead>
              <tr>
                <Th>Received</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td className="nowrap">{longDay(p.receivedOn)}</Td>
                  <Td>{PAYMENT_METHOD_LABELS[p.method]}</Td>
                  <Td>{p.reference ?? <NotSet>None</NotSet>}</Td>
                  {/* A NEGATIVE payment is a reversal — a bounced cheque — and
                      it is a row of its own beside the original rather than the
                      original edited away. Both are shown, which is the point. */}
                  <Td align="right" className="nowrap">
                    {formatMoney(p.amount, p.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        )}

        {issued && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const reference = String(form.get("reference") ?? "");
              const note = String(form.get("note") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/payments", {
                  params: { path: { invoiceId } },
                  body: {
                    amount: cleanAmount(String(form.get("amount"))),
                    receivedOn: String(form.get("receivedOn")),
                    method: String(form.get("method")) as Payment["method"],
                    ...(reference === "" ? {} : { reference }),
                    ...(note === "" ? {} : { note }),
                  },
                }),
              );
            }}
          >
            {/* A NAMED GROUP, no legend, so nothing moves on screen. This page
                has two forms asking for an "Amount" — money coming in and money
                coming off — and "Amount, edit" identifies neither of them. */}
            <fieldset className="fieldset" aria-label="Record a payment">
              <FieldStack>
                <FieldRow>
                  <Field label="Amount" hint="A negative amount reverses a payment.">
                    <AmountInput signed name="amount" required placeholder="e.g. 25000" />
                  </Field>
                  <Field label="Received">
                    <Input name="receivedOn" type="date" defaultValue={today} required />
                  </Field>
                  <Field label="Method">
                    <Select name="method" defaultValue="bank_transfer">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Bank reference" optional>
                    <Input name="reference" placeholder="e.g. NEFT 44120" />
                  </Field>
                  <Field label="Note" optional>
                    <Input name="note" placeholder="e.g. Part payment" />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button type="submit" disabled={busy}>
                    Record payment
                  </Button>
                </div>
              </FieldStack>
            </fieldset>
          </form>
        )}
        {!issued && (
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Payments can only be recorded against an issued invoice.
          </p>
        )}
      </Card>

      {/* ── Credit notes ───────────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Credit notes</CardTitle>
        {credits.length === 0 ? (
          <p className="text-sm text-muted">Nothing credited.</p>
        ) : (
          <TableWrap>
        <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Issued</Th>
                <Th>Why</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id}>
                  {/* Its OWN series, keyed separately from the invoice one — a
                      credit note is a distinct legal document. */}
                  <Td className="nowrap">{c.number}</Td>
                  <Td className="nowrap">{longDay(c.issuedOn)}</Td>
                  <Td>
                    {CREDIT_REASON_LABELS[c.reason]}
                    {c.note !== null && (
                      <div className="text-sm text-muted">{c.note}</div>
                    )}
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(c.amount, c.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        )}

        {issued && mayAdmin && (
          /* Behind a disclosure (Wave 4): rare, and a second open "Amount"
             form under the payments one. */
          <details style={{ marginTop: "var(--s-4)" }}>
            <summary>Issue a credit note</summary>
          <form
            style={{ marginTop: "var(--s-3)" }}
            action={(form) => {
              const note = String(form.get("creditNote") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/credit-notes", {
                  params: { path: { invoiceId }, query: { asOf: browserDay() } },
                  body: {
                    amount: cleanAmount(String(form.get("creditAmount"))),
                    reason: String(form.get("reason")) as CreditNote["reason"],
                    ...(note === "" ? {} : { note }),
                  },
                }),
              );
            }}
          >
            <fieldset className="fieldset" aria-label="Issue a credit note">
              <FieldStack>
                <FieldRow>
                  <Field label="Amount">
                    <AmountInput name="creditAmount" required placeholder="e.g. 10000" />
                  </Field>
                  {/* The reason is mandatory and closed because without it the
                      numbers always reconcile and WHY money came off does
                      not. */}
                  <Field
                    label="Why"
                    hint="A category, so credits total by reason."
                  >
                    <Select name="reason" required>
                      {CREDIT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {CREDIT_REASON_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Particulars" optional>
                    <Input name="creditNote" placeholder="e.g. Late delivery of the draft report" />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button type="submit" variant="secondary" disabled={busy}>
                    Issue credit note
                  </Button>
                </div>
              </FieldStack>
            </fieldset>
          </form>
          </details>
        )}
        {issued && !mayAdmin && (
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Only a firm administrator can issue a credit note.
          </p>
        )}
      </Card>

      {/* ── How far it has been chased ─────────────────────────────────── */}
      {chased.length > 0 && (
        <Card>
          <CardTitle level={2}>Payment reminders</CardTitle>
          <TableWrap>
        <Table>
            <thead>
              <tr>
                <Th>Step</Th>
                <Th>Action</Th>
                <Th>When</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {chased.map((a) => (
                <tr key={a.id}>
                  <Td>{a.step}</Td>
                  <Td>{codeLabel(a.action)}</Td>
                  <Td>{a.afterDays} days after the due date</Td>
                  <Td>
                    {/* `ok`, not `accent`. `accent` is shadcn's neutral hover
                        ground; the status teal is `ok`, and `components/tw`'s
                        `Pill` has no `accent` tone at all — this was a raw
                        `<span>` and so nothing caught it. */}
                    <Pill
                      dot
                      tone={
                        a.state === "rejected"
                          ? "danger"
                          : a.state === "approved"
                            ? "ok"
                            : "neutral"
                      }
                    >
                      {codeLabel(a.state)}
                    </Pill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Credit hold and legal action wait for a partner on{" "}
            <Link href="/receivables">Receivables</Link>.
          </p>
        </Card>
      )}
      {/* An invoice's own paperwork: the issued copy (filed by Issue, and never
          drawn again), the client's remittance advice, a signed challan.
          `party:write` decides what to OFFER; the API is still the only place
          the answer lives. Keyed on the status so Issue reloads the list with
          its new copy on it. */}
      <Documents
        key={invoice.status}
        subjectKind="invoice"
        subjectRef={invoiceId}
        partyId={invoice.partyId}
        canWrite={permissions.includes("party:write")}
        renderable="invoice"
        wentOut={invoice.issuedOn !== null}
        emptyHint="Upload a remittance advice, a challan or the issued copy."
      />
    </Page>
  );
}
