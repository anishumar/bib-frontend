"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError, codeLabel, formatMoney } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import type { BillingDue, BillingUnscheduled, InvoiceSummary, PartySummary } from "@/lib/api/client";
import { Page, PageHeader, useSession } from "@/components/layout";
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
  TabPanel,
  Tabs,
  Td,
  Th,
  ThChevron,
  Tr,
  type PillTone,
  AmountInput,
} from "@/components/ui";
import { cleanAmount } from "@/lib/money";
import { ToRaiseTab } from "./to-raise";
import { NotSetUpTab } from "./not-set-up";

/** The three views, the current one in the URL (`?tab=`) so a link from My day
 *  or Your firm lands on it. */
const TABS = ["invoices", "raise", "setup"] as const;
type TabKey = (typeof TABS)[number];

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
  // `useSearchParams` needs a Suspense boundary above it in a static build.
  return (
    <Suspense fallback={<Loading label="Loading invoices" />}>
      <Invoices />
    </Suspense>
  );
}

/**
 * THE TABS (auto-invoice, 0318): Invoices, then "To raise" (the bills that have
 * fallen due and are not invoiced yet, its count in the warn tone while there
 * are any) and "Billing not set up" (recurring engagements the sweep cannot
 * bill until somebody gives the dates). The two billing tabs live in their own
 * files; this page reads their data with the list, so the counts are on the
 * tabs before anybody clicks, and re-reads all of it after any act on them.
 * A login that may not read the bills (`party:read`) gets the list alone.
 */
function Invoices() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const session = useSession();
  const tabsId = useId();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  /** Null until read, and stays null when the login may not read them. */
  const [dues, setDues] = useState<BillingDue[] | null>(null);
  const [unscheduled, setUnscheduled] = useState<BillingUnscheduled[]>([]);
  const [autoBilling, setAutoBilling] = useState<boolean | null>(null);
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [raising, setRaising] = useState(false);
  const raiseForm = useId();
  /** The dialog's "Bill to" and "Charged by", held so choosing the client can
   *  choose the company. */
  const [billTo, setBillTo] = useState("");
  const [chargedBy, setChargedBy] = useState("");
  /** What the chosen client's letters say about who charges them. */
  const [signedBy, setSignedBy] = useState<SignedBy | null>(null);
  /** The invoice's currency: INR unless the letters chose "Charged by" and
   *  priced everything in one currency. */
  const [currency, setCurrency] = useState("INR");
  /** The client whose letters were last asked for, so a slow answer about an
   *  earlier choice cannot overwrite a later one. */
  const asked = useRef("");

  const load = useCallback(async (): Promise<void> => {
    const [list, book, firm, billed, unset, settings] = await Promise.all([
      api.GET("/api/v1/invoices", {}),
      api.GET("/api/v1/parties", {}),
      // WHICH OF THE FIRM'S OWN COMPANIES is charging: the firm's members
      // (0313), the list the letter and proposal builders issue from. The
      // routing preferences left out a company no country pointed at, and its
      // letters then had no "Charged by" to be invoiced under.
      api.GET("/api/v1/firm-entities", {}),
      api.GET("/api/v1/billing/dues", {}),
      api.GET("/api/v1/billing/unscheduled", {}),
      api.GET("/api/v1/billing/settings", {}),
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
      setEntities(firm.data.entities.map((e) => ({ id: e.partyId, displayName: e.name })));
    }
    setDues(billed.data?.dues ?? null);
    setUnscheduled(unset.data?.engagements ?? []);
    setAutoBilling(settings.data?.autoBilling ?? null);
    setError(null);
    setLoaded(true);
  }, [router]);

  function openRaise(): void {
    setError(null);
    setBillTo("");
    setChargedBy("");
    setSignedBy(null);
    setCurrency("INR");
    asked.current = "";
    setRaising(true);
  }

  /**
   * THE COMPANY THAT SIGNED THE CLIENT'S LETTERS CHARGES FOR THE WORK.
   *
   * "Charged by" opened on the first company in the list, so an Indian
   * client's invoice was numbered in the Gulf company's series unless somebody
   * noticed, and a number drawn cannot be undone. Now choosing the client reads
   * its letters: one issuing company is preselected and the letters named under
   * it; none, or several, leaves the placeholder and `required` to make
   * somebody choose. Never a silent first option.
   *
   * And when that one company's letters are all priced in one currency, the
   * invoice is raised in it: a line takes the invoice's currency, and the API
   * refuses an engagement priced in another (ENGAGEMENT_IN_ANOTHER_CURRENCY).
   */
  async function chooseClient(partyId: string): Promise<void> {
    setBillTo(partyId);
    setChargedBy("");
    setSignedBy(null);
    setCurrency("INR");
    asked.current = partyId;
    if (partyId === "") return;
    const result = await api.GET("/api/v1/parties/{partyId}/billable-engagements", {
      params: { path: { partyId } },
    });
    if (asked.current !== partyId) return;
    const letters = new Map<string, { refs: Set<string>; currencies: Set<string> }>();
    for (const e of result.data?.engagements ?? []) {
      const of = letters.get(e.issuingEntityPartyId) ?? { refs: new Set(), currencies: new Set() };
      of.refs.add(e.letterRef);
      of.currencies.add(e.currency);
      letters.set(e.issuingEntityPartyId, of);
    }
    const [only] = letters;
    if (letters.size === 1 && only !== undefined && entities.some((e) => e.id === only[0])) {
      const [entityId, { refs, currencies }] = only;
      const [priced] = currencies;
      const oneCurrency = currencies.size === 1 && priced !== undefined ? priced : null;
      setChargedBy(entityId);
      if (oneCurrency !== null) setCurrency(oneCurrency);
      setSignedBy({ kind: "one", entityId, letters: [...refs].sort(), currency: oneCurrency });
      return;
    }
    setSignedBy(letters.size > 1 ? { kind: "several", count: letters.size } : { kind: "none" });
  }

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
        fxRate: cleanAmount(String(form.get("fxRate"))),
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

  const billing = dues !== null;
  const askedTab = search.get("tab");
  const tab: TabKey = billing ? (TABS.find((t) => t === askedTab) ?? "invoices") : "invoices";
  function showTab(next: TabKey): void {
    const q = new URLSearchParams(search.toString());
    if (next === "invoices") q.delete("tab");
    else q.set("tab", next);
    const query = q.toString();
    router.replace((query === "" ? pathname : `${pathname}?${query}`) as Route, { scroll: false });
  }
  const toRaise = (dues ?? []).filter((d) => d.status === "open").length;
  // A fee group is one row on its tab, so it counts once here.
  const notSetUp = new Set(unscheduled.map((u) => u.feeGroup?.id ?? u.engagementId)).size;
  const canWrite = session?.permissions.includes("party:write") === true;
  const seesFees = session?.commercialVisibility === true;

  const body =
    tab === "raise" && dues !== null ? (
      <ToRaiseTab
        dues={dues}
        invoices={invoices}
        autoBilling={autoBilling}
        canWrite={canWrite}
        seesFees={seesFees}
        onChanged={load}
      />
    ) : tab === "setup" ? (
      <NotSetUpTab rows={unscheduled} canWrite={canWrite} onChanged={load} />
    ) : invoices.length === 0 ? (
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
    );

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
            <Button onClick={openRaise}>Raise an invoice</Button>
          </>
        }
      />

      {/* The dialog shows its own refusal; this one is the list's. */}
      <ErrorNotice error={raising ? null : error} />

      {billing && (
        <Tabs
          id={tabsId}
          label="Invoice views"
          value={tab}
          onChange={showTab}
          tabs={[
            { value: "invoices", label: "Invoices" },
            { value: "raise", label: "To raise", count: toRaise, ...(toRaise > 0 ? { tone: "warn" as const } : {}) },
            { value: "setup", label: "Billing not set up", count: notSetUp },
          ]}
        />
      )}

      {billing ? (
        <TabPanel tabsId={tabsId} value={tab}>
          {body}
        </TabPanel>
      ) : (
        body
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
                <Select
                  name="partyId"
                  required
                  value={billTo}
                  onChange={(e) => {
                    void chooseClient(e.target.value);
                  }}
                >
                  <option value="">Choose who to bill…</option>
                  {/* NOT the firm's own companies (F-10-1). The placeholder
                      stopped the accident; the API now refuses the choice, so
                      the list stops offering it. */}
                  {parties
                    .filter((p) => !p.isOwnCompany && !entities.some((e) => e.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Charged by" hint={chargedByHint(signedBy, chargedBy)}>
                <Select
                  name="entityPartyId"
                  required
                  value={chargedBy}
                  onChange={(e) => {
                    setChargedBy(e.target.value);
                  }}
                >
                  <option value="">Choose the company…</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Currency" hint={currencyHint(signedBy, chargedBy, currency)}>
                <Input
                  name="currency"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                  }}
                  maxLength={3}
                  required
                />
              </Field>
              <Field label="Rate to the firm's currency">
                <AmountInput decimals={10} name="fxRate" defaultValue="1" required />
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

/** Who signed the chosen client's letters: one company (and which letters), or
 *  more than one, or nobody yet. */
type SignedBy =
  | {
      readonly kind: "one";
      readonly entityId: string;
      readonly letters: readonly string[];
      /** The one currency those letters are priced in, or null for several. */
      readonly currency: string | null;
    }
  | { readonly kind: "several"; readonly count: number }
  | { readonly kind: "none" };

/** "EL-2026-0001, EL-2026-0004 and 2 more". */
function namedLetters(letters: readonly string[]): string {
  const [first, second, ...rest] = letters;
  const named = [first, second].filter((r) => r !== undefined).join(", ");
  return `${named}${rest.length > 0 ? ` and ${String(rest.length)} more` : ""}`;
}

/** The line under "Charged by": the letters that chose it while it is still
 *  their company, otherwise what the choice decides. */
function chargedByHint(signedBy: SignedBy | null, chargedBy: string): string {
  if (signedBy?.kind === "one" && chargedBy === signedBy.entityId) {
    return `Issued ${namedLetters(signedBy.letters)}.`;
  }
  if (signedBy?.kind === "several") {
    return `Their letters come from ${String(signedBy.count)} companies.`;
  }
  return "Its number comes from this company's series.";
}

/** The line under "Currency", only while it is still the letters' currency. */
function currencyHint(signedBy: SignedBy | null, chargedBy: string, currency: string): string | undefined {
  if (
    signedBy?.kind === "one" &&
    signedBy.currency !== null &&
    chargedBy === signedBy.entityId &&
    currency.trim().toUpperCase() === signedBy.currency
  ) {
    return `As priced in ${namedLetters(signedBy.letters)}.`;
  }
  return undefined;
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
