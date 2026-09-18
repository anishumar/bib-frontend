"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import {
  CREDIT_REASONS,
  CREDIT_REASON_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  api,
  apiError,
  formatCount,
  formatMoney,
} from "@/lib/api/client";
import type {
  BillableEngagement,
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
  Select,
} from "@/components/ui";
import { Loading } from "@/components/states";
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
    const [one, bal, paid, credited, dunning, me] = await Promise.all([
      api.GET("/api/v1/invoices/{invoiceId}", path),
      api.GET("/api/v1/invoices/{invoiceId}/balance", path),
      api.GET("/api/v1/invoices/{invoiceId}/payments", path),
      api.GET("/api/v1/invoices/{invoiceId}/credit-notes", path),
      api.GET("/api/v1/invoices/{invoiceId}/dunning", path),
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
    if (bal.data) setBalance(bal.data);
    if (paid.data) setPayments(paid.data.payments);
    if (credited.data) setCredits(credited.data.creditNotes);
    if (dunning.data) setChased(dunning.data.actions);
    if (me.data) setPermissions(me.data.permissions);

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
      <title>{`${invoice.number} · ${record.party.displayName}`}</title>

      <PageHeader
        eyebrow="Commercial"
        /* The number IS the identifier, so it keeps the mono face the rest of
           the product gives an identifier — `PageHeader` applies it here
           rather than taking markup, since an h1 has exactly one job. */
        title={invoice.number}
        titleMono
        actions={
          /* `ok`, not `accent`. Same word, different meaning under Tailwind —
             see the note in tailwind.css. */
          <Pill tone={invoice.status === "cancelled" ? "danger" : issued ? "ok" : "neutral"}>
            {invoice.status}
          </Pill>
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
          <MetaItem label="Issued">{invoice.issuedOn === null ? "not yet" : longDay(invoice.issuedOn)}</MetaItem>
          <MetaItem label="Due">{invoice.dueOn === null ? "no date" : longDay(invoice.dueOn)}</MetaItem>
          <MetaItem label="Series">
            <span className="mono">
              FY {invoice.financialYear}–{String((invoice.financialYear + 1) % 100).padStart(2, "0")} · #
              {invoice.sequenceNumber}
            </span>
          </MetaItem>
          <MetaItem label="Rate">
            <span className="mono">
              {invoice.fxRate} on {longDay(invoice.fxRateDate)}
            </span>
          </MetaItem>
        </Meta>
      </Card>

      {/* ── The money, as the database computed it ─────────────────────── */}
      {balance !== null && (
        <Card>
          <CardTitle level={2}>What is owed</CardTitle>
          <Meta>
            <MetaItem label="Invoiced">
              <span className="mono">{formatMoney(balance.invoiced, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Paid">
              <span className="mono">{formatMoney(balance.paid, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Credited">
              <span className="mono">{formatMoney(balance.credited, balance.currency)}</span>
            </MetaItem>
            <MetaItem label="Outstanding">
              {/* A NEGATIVE outstanding is not an error: the client overpaid, or
                  settled two invoices with one transfer. The API records what
                  actually arrived rather than what was tidy, and so does this. */}
              <strong className="mono">{formatMoney(balance.outstanding, balance.currency)}</strong>
            </MetaItem>
          </Meta>
          {Number(balance.outstanding) < 0 && (
            <p className="max-w-[var(--measure)] text-sm text-muted">
              More has been received than was billed. This is an overpayment, or one transfer
              that settled more than this invoice.
            </p>
          )}
        </Card>
      )}

      {/* ── The lines ──────────────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Lines</CardTitle>
        {record.lines.length === 0 ? (
          <p className="text-sm text-muted">
            No lines yet. An invoice cannot be issued until it has at least one line.
          </p>
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
                  <Td align="right" className="mono">
                    {formatCount(l.quantity)}
                  </Td>
                  <Td align="right" className="mono">
                    {formatMoney(l.unitAmount, l.currency)}
                  </Td>
                  {/* A discount is a price, so the fee axis takes it too — an
                      em dash rather than "0%", which would be a figure this
                      reader was not shown rather than one that is true. */}
                  <Td align="right" className="mono">
                    {l.discountPercent === null ? "none" : `${formatCount(l.discountPercent)}%`}
                  </Td>
                  {/* Tax is per LINE because it is per service: 18% on
                      professional fees and 0% on a recharge, on one invoice. */}
                  <Td align="right" className="mono">
                    {formatCount(l.taxPercent)}% · {formatMoney(l.tax, l.currency)}
                  </Td>
                  <Td align="right" className="mono">
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
                <Td align="right" className="mono">
                  {formatMoney(record.totals.tax, record.totals.currency)}
                </Td>
                {draft && <Td />}
              </tr>
              <tr>
                <Td colSpan={4} />
                <Td align="right" className="label">
                  Total
                </Td>
                <Td align="right" className="mono">
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
              const discount = String(form.get("discountPercent") ?? "");
              const tax = String(form.get("taxPercent") ?? "");
              const engagementId = String(form.get("engagementId") ?? "");
              void act(async () => {
                const result = await api.POST("/api/v1/invoices/{invoiceId}/lines", {
                  params: { path: { invoiceId } },
                  body: {
                    description: String(form.get("description")),
                    quantity: String(form.get("quantity")),
                    unitAmount: String(form.get("unitAmount")),
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
                  hint="Picks up the wording and the price this client agreed in the engagement letter. Everything below can still be edited, since an invoice usually bills one period rather than the whole contract."
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
                    {billable.map((b) => (
                      <option
                        key={b.engagementId}
                        value={b.engagementId}
                        /* THE ADVANCE GATE, said rather than hidden. The row
                           comes back either way so the screen can explain why
                           a service the client signed for cannot be billed
                           yet — a picker that silently dropped it could not. */
                        disabled={b.status !== "active"}
                      >
                        {b.entityName}: {b.description}
                        {b.unitAmount === null ? " (no price agreed)" : ""}
                        {b.status === "active" ? "" : " (waiting on the advance)"}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {chosen !== null && (
                <p className="field-hint">
                  From <span className="mono">{chosen.letterRef}</span>
                  {chosen.pricingNote === null ? "" : ` · ${chosen.pricingNote}`}
                  {chosen.unitAmount === null
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
                  />
                </Field>
                <Field label="Qty">
                  <Input
                    key={`q-${chosen?.engagementId ?? "none"}`}
                    name="quantity"
                    defaultValue={chosen?.quantity ?? "1"}
                    required
                  />
                </Field>
                <Field label="Unit amount">
                  <Input
                    key={`u-${chosen?.engagementId ?? "none"}`}
                    name="unitAmount"
                    defaultValue={chosen?.unitAmount ?? ""}
                    required
                  />
                </Field>
                <Field label="Discount %">
                  <Input
                    key={`x-${chosen?.engagementId ?? "none"}`}
                    name="discountPercent"
                    defaultValue={chosen?.discountPercent ?? "0"}
                  />
                </Field>
                <Field label="Tax %">
                  <Input name="taxPercent" defaultValue="0" />
                </Field>
              </FieldRow>
              <div className="cluster">
                <Button type="submit" disabled={busy}>
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
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Only a firm administrator can issue or cancel an invoice, because both use up a
            number in the series.
          </p>
        )}
        <div className="cluster">
          {draft && mayAdmin && (
            <Button
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/issue", { params: { path: { invoiceId } } }),
                )
              }
            >
              Issue
            </Button>
          )}
          {(draft || issued) && mayAdmin && (
            /* SAYS WHICH CANCEL, because the other one on this screen is
               nothing like it. Open the Documents dialog and there are two
               buttons reading "Cancel": that one closes an upload form, this
               one VOIDS THE INVOICE and it keeps its number forever. Somebody
               moving between buttons by name had no way to tell them apart.
               The visible word is unchanged. */
            <Button
              variant="destructive-quiet"
              size="sm"
              disabled={busy}
              aria-label={`Cancel invoice ${invoice.number}`}
              onClick={() =>
                void act(() =>
                  api.POST("/api/v1/invoices/{invoiceId}/cancel", { params: { path: { invoiceId } } }),
                )
              }
            >
              Cancel
            </Button>
          )}
        </div>
        {invoice.status === "cancelled" && (
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Cancelled. It keeps its number so the series stays unbroken. To replace it, raise a
            new invoice.
          </p>
        )}

        {/* The government registry's identifier. Nothing in this product talks
            to the IRP: this records an answer obtained elsewhere, exactly as the
            advance-fee gate records an attestation. */}
        <div>
          <Meta>
            <MetaItem label="IRN">
              {invoice.irn === null ? (
                <span className="unstated">not registered</span>
              ) : (
                <span className="mono">{invoice.irn}</span>
              )}
            </MetaItem>
          </Meta>
          {invoice.irn === null && (
            <form
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
                    hint="The IRN you received from the e-invoice portal (IRP). It cannot be changed once recorded."
                  >
                    <Input name="irn" required />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button
                    type="submit"
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
                  <Td className="mono">{longDay(p.receivedOn)}</Td>
                  <Td>{PAYMENT_METHOD_LABELS[p.method]}</Td>
                  <Td className="mono muted">{p.reference ?? "none"}</Td>
                  {/* A NEGATIVE payment is a reversal — a bounced cheque — and
                      it is a row of its own beside the original rather than the
                      original edited away. Both are shown, which is the point. */}
                  <Td align="right" className="mono">
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
                    amount: String(form.get("amount")),
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
                  <Field label="Amount" hint="Enter a negative amount to reverse a payment.">
                    <Input name="amount" required />
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
                  <Field label="Bank reference">
                    <Input name="reference" />
                  </Field>
                  <Field label="Note">
                    <Input name="note" />
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
                  <Td className="mono">{c.number}</Td>
                  <Td className="mono">{longDay(c.issuedOn)}</Td>
                  <Td>
                    {CREDIT_REASON_LABELS[c.reason]}
                    {c.note !== null && (
                      <div className="text-sm text-muted">{c.note}</div>
                    )}
                  </Td>
                  <Td align="right" className="mono">
                    {formatMoney(c.amount, c.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        )}

        {issued && mayAdmin && (
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const note = String(form.get("creditNote") ?? "");
              void act(() =>
                api.POST("/api/v1/invoices/{invoiceId}/credit-notes", {
                  params: { path: { invoiceId } },
                  body: {
                    amount: String(form.get("creditAmount")),
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
                    <Input name="creditAmount" required />
                  </Field>
                  {/* The reason is mandatory and closed because without it the
                      numbers always reconcile and WHY money came off does
                      not. */}
                  <Field
                    label="Why"
                    hint="Choose a category, so credit notes can be totalled by reason later. Put the details under Particulars."
                  >
                    <Select name="reason" required>
                      {CREDIT_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {CREDIT_REASON_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Particulars">
                    <Input name="creditNote" />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button type="submit" disabled={busy}>
                    Issue credit note
                  </Button>
                </div>
              </FieldStack>
            </fieldset>
          </form>
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
                  <Td className="mono">{a.step}</Td>
                  <Td>{a.action.replace("_", " ")}</Td>
                  <Td className="text-sm text-muted">{a.afterDays} days after the due date</Td>
                  <Td>
                    {/* `ok`, not `accent`. `accent` is shadcn's neutral hover
                        ground; the status teal is `ok`, and `components/tw`'s
                        `Pill` has no `accent` tone at all — this was a raw
                        `<span>` and so nothing caught it. */}
                    <Pill
                      tone={
                        a.state === "rejected"
                          ? "danger"
                          : a.state === "approved"
                            ? "ok"
                            : "neutral"
                      }
                    >
                      {a.state.replace("_", " ")}
                    </Pill>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
          <p className="max-w-[var(--measure)] text-sm text-muted">
            Reminders are sent automatically, step by step. Credit hold and legal action are
            never applied automatically; they wait for a partner’s decision on{" "}
            <Link href="/receivables">Receivables</Link>.
          </p>
        </Card>
      )}
      {/* An invoice's own paperwork — the issued PDF once T3.8 renders one, the
          client's remittance advice, a signed challan. `party:write` decides
          what to OFFER; the API is still the only place the answer lives. */}
      <Documents
        subjectKind="invoice"
        subjectRef={invoiceId}
        partyId={invoice?.partyId ?? undefined}
        canWrite={permissions.includes("party:write")}
        renderable="invoice"
        emptyHint="Nothing attached yet. A remittance advice, a signed challan, or the issued copy of this invoice belongs here."
      />
    </Page>
  );
}
