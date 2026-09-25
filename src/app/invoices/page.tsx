"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import type { InvoiceSummary, PartySummary } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  ErrorNotice,
  Field,
  FieldRow,
  Icon,
  Input,
  LinkButton,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
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
      <PageHeader
        eyebrow="Commercial"
        title="Invoices"
        lede="Every invoice the firm has raised, when it is due and what is still outstanding. Raise a new one at the bottom of the page."
        aside={
          <LinkButton
            size="sm"
            href="/receivables"
            iconAfter={<Icon name="arrowRight" size={15} />}
          >
            Receivables
          </LinkButton>
        }
      />

      <ErrorNotice error={error} />

      {invoices.length === 0 ? (
        <Card>
          <Empty title="Nothing billed yet" icon="invoices">
            Raise the first invoice below. Its number is given automatically from the issuing
            company’s series.
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
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.invoice.id}>
                  <Td>
                    <Link href={`/invoices/${i.invoice.id}`} className="mono">
                      {i.invoice.number}
                    </Link>
                    {/* An IRN is the government registry's identifier for this
                        document. Shown here because a firm chasing an e-invoice
                        failure wants to see at a glance which are registered. */}
                    {i.invoice.irn !== null && <Sub>IRN {i.invoice.irn}</Sub>}
                  </Td>
                  <Td>{i.party.displayName}</Td>
                  <Td>
                    <Pill tone={toneOf(i.invoice.status)}>{i.invoice.status}</Pill>
                  </Td>
                  <Td>
                    {i.invoice.dueOn === null ? (
                      <span className="empty">no date</span>
                    ) : (
                      <span className="mono">{longDay(i.invoice.dueOn)}</span>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="mono">
                      {formatMoney(i.totals.total, i.totals.currency)}
                    </span>
                    {/* The line count is what tells a zero total apart from an
                        empty draft — the API refuses to issue the second. */}
                    <Sub>
                      {i.totals.lineCount} {i.totals.lineCount === 1 ? "line" : "lines"}
                    </Sub>
                  </Td>
                  {/* WHAT IS STILL OWED, and the column this list went four
                      tasks without. Walked: a fully-settled invoice sat beside
                      one seventy-five days overdue, both reading `issued` and
                      both showing their full value — because `status` is about
                      the DOCUMENT and says nothing about money. /receivables
                      already dropped the settled one, so the data existed and
                      the list simply never asked for it.

                      There is still no "paid" badge, and there must not be:
                      paid is arithmetic over invoices, payments and credit
                      notes, and a cached flag drifts the first time a payment
                      is corrected. The figure IS the answer. */}
                  <Td align="right">
                    {i.balance === null ? (
                      /* A DRAFT OWES NOTHING because nobody has been asked, and
                         that is not the same as nothing being outstanding — a
                         zero here would read as settled. */
                      <span className="empty">not issued</span>
                    ) : isZero(i.balance.outstanding) ? (
                      <Pill tone="ok">Settled</Pill>
                    ) : (
                      <>
                        <span className="mono">
                          {formatMoney(i.balance.outstanding, i.totals.currency)}
                        </span>
                        {!isZero(i.balance.paid) && (
                          <Sub>
                            {formatMoney(i.balance.paid, i.totals.currency)} received
                          </Sub>
                        )}
                        {!isZero(i.balance.credited) && (
                          <Sub>
                            {formatMoney(i.balance.credited, i.totals.currency)} credited
                          </Sub>
                        )}
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <Card>
        <CardHead title="New invoice" level={2}>
          <p className="lede">
            The invoice number is given automatically from the issuing company&apos;s series. It
            cannot be chosen or changed. If an invoice is wrong, cancel it and raise a new one;
            both stay on record.
          </p>
        </CardHead>
        <form
          action={(form) => {
            void raise(form);
          }}
        >
          <div className="stack">
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
              <Field label="Charged by" hint="Each of the firm’s companies has its own invoice number series.">
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
              <Field label="Exchange rate to the firm&apos;s currency">
                <Input name="fxRate" defaultValue="1" required />
              </Field>
              <Field label="Rate as of">
                <Input name="fxRateDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Due" optional hint="Without a due date, no payment reminders are sent.">
                <Input name="dueOn" type="date" />
              </Field>
              <Field label="Series date" hint="Decides which financial year’s number series is used.">
                <Input name="seriesDate" type="date" defaultValue={today} />
              </Field>
            </FieldRow>

            <div>
              <Button type="submit" loading={busy}>
                Raise invoice
              </Button>
            </div>
          </div>
        </form>
      </Card>
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
