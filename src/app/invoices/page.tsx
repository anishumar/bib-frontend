"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, codeLabel, formatMoney } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import type { InvoiceSummary, PartySummary } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Icon,
  Input,
  LinkButton,
  NotSet,
  Pill,
  RowChevron,
  RowLink,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  ThChevron,
  Tr,
  type PillTone,
} from "@/components/ui";

/**
 * What the firm has BILLED, and to whom.
 *
 * The number is the first column and it is the point of the screen: an invoice
 * number is what a client quotes back, what a tax authority cites, and — unlike
 * a proposal reference — it may never gap. The API allocates it from a per-
 * entity, per-financial-year counter inside the same transaction that writes
 * the row, so this screen never picks one and never shows a "pending number".
 *
 * ISSUING is deliberately not offered here. It sends a legal demand under one of
 * the firm's own entities and the API gates it on `tenant:admin`; a list is
 * where somebody skims, and a one-click issue on a skim screen is how the wrong
 * invoice goes out. It lives on the invoice's own page, next to what it says.
 */
export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [raising, setRaising] = useState(false);
  const raiseForm = useId();

  const load = useCallback(async (): Promise<void> => {
    const [list, book, firm] = await Promise.all([
      api.GET("/api/v1/invoices", {}),
      api.GET("/api/v1/parties", {}),
      // WHICH OF THE FIRM'S OWN ENTITIES is charging. Not a free-text field and
      // not this app's guess: the preferences screen is where a firm says which
      // entity serves which country, and an invoice must be raised by one of
      // them because the series belongs to the entity.
      api.GET("/api/v1/firm-entities/preferences", {}),
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
    setInvoices(list.data.invoices);
    if (book.data) setParties(book.data.parties);
    if (firm.data) {
      // One row per country, so the same entity appears more than once. The
      // picker wants each company once.
      const seen = new Map<string, string>();
      for (const p of firm.data.preferences) seen.set(p.firmEntity.id, p.firmEntity.displayName);
      setEntities([...seen].map(([id, displayName]) => ({ id, displayName })));
    }
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function raise(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const dueOn = String(form.get("dueOn") ?? "");
    const seriesDate = String(form.get("seriesDate") ?? "");
    const result = await api.POST("/api/v1/invoices", {
      // TODAY WHERE YOU ARE. With no series date, an invoice lands in the books
      // of the year it is raised in, and the server's own day is Greenwich's.
      params: { query: { asOf: browserDay() } },
      body: {
        partyId: String(form.get("partyId")),
        entityPartyId: String(form.get("entityPartyId")),
        currency: String(form.get("currency")).toUpperCase(),
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        ...(dueOn === "" ? {} : { dueOn }),
        // Which financial year's series this belongs to. Offered because a firm
        // raising an invoice on 2 April for March's work is DECIDING it, not
        // discovering it — and the series it lands in is not reversible.
        ...(seriesDate === "" ? {} : { seriesDate }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/invoices/${result.data.id}`);
  }

  if (!loaded) return <Loading label="Loading invoices" />;

  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();

  return (
    <Page>
      {/* THE WAVE 4 SHAPE (2026-09-28): Raise an invoice is the one brand
          button and opens the form in a dialog (it sat under the list with a
          paragraph over it); the whole row opens the invoice; the status is a
          pill in words; an issued invoice past its due date with money still
          owed says Overdue under the date. */}
      <PageHeader
        title="Invoices"
        aside={
          <>
            <LinkButton variant="ghost" href="/receivables" iconAfter={<Icon name="arrowRight" size={16} />}>
              Receivables
            </LinkButton>
            <Button
              onClick={() => {
                setError(null);
                setRaising(true);
              }}
            >
              Raise an invoice
            </Button>
          </>
        }
      />

      {/* The dialog shows its own refusal; this one is the list's. */}
      <ErrorNotice error={raising ? null : error} />

      {invoices.length === 0 ? (
        <Card>
          <Empty title="Nothing billed yet" icon="invoices">
            Raise the first one with Raise an invoice.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th align="right">Total</Th>
                <Th align="right">Outstanding</Th>
                <ThChevron />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const owed = i.balance !== null && !isZero(i.balance.outstanding);
                const overdue =
                  i.invoice.status === "issued" && owed && i.invoice.dueOn !== null && i.invoice.dueOn < today;
                return (
                  <Tr key={i.invoice.id} linked>
                    <Td className="nowrap">
                      <RowLink href={`/invoices/${i.invoice.id}`}>{i.invoice.number}</RowLink>
                      {/* An IRN is the government registry's identifier for this
                          document. Shown here because a firm chasing an
                          e-invoice failure wants to see at a glance which are
                          registered. */}
                      {i.invoice.irn !== null && <Sub>IRN {i.invoice.irn}</Sub>}
                    </Td>
                    <Td>{i.party.displayName}</Td>
                    <Td>
                      <Pill dot tone={toneOf(i.invoice.status)}>
                        {codeLabel(i.invoice.status)}
                      </Pill>
                    </Td>
                    <Td className="nowrap">
                      {i.invoice.dueOn === null ? <NotSet>No date</NotSet> : longDay(i.invoice.dueOn)}
                      {overdue && (
                        <span className="sub tone-danger">Overdue</span>
                      )}
                    </Td>
                    <Td align="right" className="nowrap">
                      {formatMoney(i.totals.total, i.totals.currency)}
                      {/* The line count is what tells a zero total apart from
                          an empty draft — the API refuses to issue the second. */}
                      <Sub>
                        {i.totals.lineCount} {i.totals.lineCount === 1 ? "line" : "lines"}
                      </Sub>
                    </Td>
                    {/* WHAT IS STILL OWED, and the column this list went four
                        tasks without. Walked: a fully-settled invoice sat
                        beside one seventy-five days overdue, both reading
                        `issued` and both showing their full value — because
                        `status` is about the DOCUMENT and says nothing about
                        money. /receivables already dropped the settled one, so
                        the data existed and the list simply never asked for it.

                        There is still no "paid" badge, and there must not be:
                        paid is arithmetic over invoices, payments and credit
                        notes, and a cached flag drifts the first time a
                        payment is corrected. The figure IS the answer. */}
                    <Td align="right" className="nowrap">
                      {i.balance === null ? (
                        /* A DRAFT OWES NOTHING because nobody has been asked,
                           and that is not the same as nothing being
                           outstanding — a zero here would read as settled. */
                        <NotSet>Not issued</NotSet>
                      ) : isZero(i.balance.outstanding) ? (
                        <Pill dot tone="ok">
                          Settled
                        </Pill>
                      ) : (
                        <>
                          {formatMoney(i.balance.outstanding, i.totals.currency)}
                          {!isZero(i.balance.paid) && (
                            <Sub>{formatMoney(i.balance.paid, i.totals.currency)} received</Sub>
                          )}
                          {!isZero(i.balance.credited) && (
                            <Sub>{formatMoney(i.balance.credited, i.totals.currency)} credited</Sub>
                          )}
                        </>
                      )}
                    </Td>
                    <RowChevron />
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {/* The number is given from the issuing company's series and can never be
          chosen or changed; a wrong invoice is cancelled and a new one raised,
          both kept on record. */}
      <Dialog
        open={raising}
        size="lg"
        onClose={() => {
          setRaising(false);
        }}
        title="Raise an invoice"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setRaising(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={raiseForm} loading={busy}>
              Raise invoice
            </Button>
          </>
        }
      >
        <form
          id={raiseForm}
          action={(form) => {
            void raise(form);
          }}
        >
          <FieldStack>
            <ErrorNotice error={error} />
            <FieldRow>
              <Field label="Bill to">
                {/* AN UNCHOSEN PLACEHOLDER, because a party select that opens
                    on its first option opens on the FIRM. The list is
                    alphabetical and "10x Global" sorts above every client, so
                    filling the rest of this form and pressing the button quoted
                    or billed the firm to itself — a valid write the API has no
                    reason to refuse. `required` plus an empty value makes the
                    browser stop it instead. Found by walking the product. */}
                <Select name="partyId" required>
                  <option value="">Choose who to bill…</option>
                  {/* NOT the firm's own companies (F-10-1). The placeholder
                      stopped the accident; the API now refuses the choice, so
                      the list stops offering it. */}
                  {parties
                    .filter((p) => !entities.some((e) => e.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Charged by" hint="Its number comes from this company's series.">
                <Select name="entityPartyId" required>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Currency">
                <Input name="currency" defaultValue="INR" maxLength={3} required />
              </Field>
              <Field label="Rate to the firm's currency">
                <Input name="fxRate" defaultValue="1" required />
              </Field>
              <Field label="Rate as of">
                <Input name="fxRateDate" type="date" defaultValue={today} required />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Due" optional hint="No due date means no payment reminders.">
                <Input name="dueOn" type="date" />
              </Field>
              <Field label="Series date" hint="Picks the financial year's number series.">
                <Input name="seriesDate" type="date" defaultValue={today} />
              </Field>
            </FieldRow>
          </FieldStack>
        </form>
      </Dialog>
    </Page>
  );
}

/** A cancelled invoice wears the same pill a revoked membership does: it is
 *  still there, still numbered, and no longer in force. */
function toneOf(status: InvoiceSummary["invoice"]["status"]): PillTone {
  if (status === "cancelled") return "danger";
  return status === "issued" ? "ok" : "neutral";
}

/**
 * Is this decimal string zero?
 *
 * A STRING TEST, not `Number(x) === 0`. Money is a decimal string from the
 * database to the screen here and nothing in this app turns one into a float —
 * `formatMoney` hands the string straight to `Intl`, which formats it exactly.
 * A zero comparison is the thin end of that wedge, and the pattern answers it
 * without one: any number of zeros before or after the point, with or without a
 * sign, is zero and nothing else is.
 */
function isZero(amount: string): boolean {
  // At least one DIGIT is required: the looser `0*(\.0*)?` also matches the
  // empty string, and "we hold no figure" is not "nothing is owed".
  return /^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(amount.trim());
}
