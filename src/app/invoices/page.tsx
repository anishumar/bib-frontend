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
        lede="What the firm has billed. The number is allocated by the write itself and cannot be chosen."
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
            Raise the first invoice below. It is numbered from the issuing entity’s own series.
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
                      <span className="empty">—</span>
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
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <Card>
        <CardHead title="New invoice" level={2}>
          <p className="lede">
            The number is allocated by the write itself, from the issuing entity&apos;s series.
            It cannot be chosen, and once allocated it cannot be changed — a wrong invoice is
            cancelled and a new one issued, and both stay readable.
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
                <Select name="partyId" required>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Charged by" hint="Each of the firm’s entities owns its own series.">
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
              <Field label="Billed in">
                <Input name="currency" defaultValue="INR" maxLength={3} required />
              </Field>
              <Field label="Rate to the firm&apos;s currency">
                <Input name="fxRate" defaultValue="1" required />
              </Field>
              <Field label="Rate dated">
                <Input name="fxRateDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Due" optional hint="No due date is never chased.">
                <Input name="dueOn" type="date" />
              </Field>
              <Field label="Series date" hint="Which financial year’s series.">
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
