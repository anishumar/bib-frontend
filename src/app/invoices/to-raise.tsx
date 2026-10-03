"use client";

import Link from "next/link";
import type { Route } from "next";
import { useId, useState } from "react";
import {
  api,
  apiError,
  billLabel,
  billingPersonName,
  codeLabel,
  formatCount,
  formatMoney,
  invoiceNumberWords,
  noPriceWords,
} from "@/lib/api/client";
import type { BillingBillNow, BillingDue, BillingRefund, InvoiceSummary } from "@/lib/api/client";
import { ConfirmAction } from "@/components/confirm-action";
import { browserDay, longDay, longInstant } from "@/lib/day";
import { cleanAmount, commonUnits } from "@/lib/money";
import { Empty, Loading } from "@/components/states";
import {
  AmountInput,
  Button,
  Card,
  CardHead,
  Checkbox,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  NotSet,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";

/**
 * TO RAISE: the bills the daily sweep says have fallen due, and nobody has
 * invoiced yet (auto-invoice, 0318).
 *
 * ONE CARD PER INVOICE THAT COULD BE RAISED. An invoice is one client, one of
 * the firm's companies (its number series), one currency and one manager (whose
 * revenue it is), and the API refuses a mix of any of the four; so the bills are
 * grouped by exactly those, and each card's Raise drafts one invoice from the
 * ticked rows. A client with two managers is two cards, on purpose.
 *
 * The number is drawn when Raise is pressed, not by the sweep: a bill skipped
 * here leaves no cancelled number for an auditor to ask about.
 *
 * A bill on a draft invoice stays on the list (it is not billed until the
 * invoice is issued) and links to the draft. A week after its bill date an
 * open bill is Overdue and is on the manager's own manager's desk too; the row
 * names that person.
 *
 * A bill the letter priced at nothing (`priced` false) says so in weeks, the
 * weekly reminder Ashish asked for, and its amount is asked for when raising,
 * whoever raises it: there is no figure to hide from a login without fees.
 * A priced bill whose amount did not come (no fee axis) reads Hidden.
 *
 * THE ADVANCE AND THE FINAL BILL (0320). An ADVANCE bill is raised on an
 * invoice of its own (the API refuses it beside anything else), so it has its
 * own Raise button and no tick, and it cannot be skipped: the work waits for
 * it. A FINAL bill is a one-time service whose job is done. When an advance has
 * been invoiced, a bill shows what is left of it: the API takes it off, earliest
 * bill first, before tax, and a bill it pays in full gets no invoice at all
 * ("Covered by the advance"). Below the cards: "To refund" (an advance left once
 * the work is finished: an admin gives it back as a credit note, or keeps it
 * with a reason) and one-time work with no process, billed with "Bill it now".
 */
export function ToRaiseTab({
  dues,
  invoices,
  autoBilling,
  canWrite,
  canSkip,
  isAdmin,
  mayIssue,
  seesFees,
  refunds,
  billNow,
  onChanged,
}: {
  dues: readonly BillingDue[];
  /** The firm's invoices, for "Link to an invoice". */
  invoices: readonly InvoiceSummary[];
  autoBilling: boolean | null;
  canWrite: boolean;
  /** The firm's `billing:skip` (0321): skipping a bill gives up revenue. */
  canSkip: boolean;
  /** Linking an advance to an invoice already raised is an administrator's
   *  (it starts the work). */
  isAdmin: boolean;
  /** `invoice:issue` (0323, CA#6): giving an advance back or keeping it, as
   *  issuing a credit note is. */
  mayIssue: boolean;
  /** B27: giving it back writes a credit note, money, so it is offered only
   *  to a login that sees fees. */
  seesFees: boolean;
  refunds: readonly BillingRefund[];
  billNow: readonly BillingBillNow[];
  onChanged: () => Promise<void>;
}) {
  /** Bills the reader UNticked. Absent is ticked, so a bill that arrives on a
   *  reload is included without anybody having to notice it. */
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [raising, setRaising] = useState<readonly BillingDue[] | null>(null);
  const [skipping, setSkipping] = useState<BillingDue | null>(null);
  const [linking, setLinking] = useState<BillingDue | null>(null);
  const [keeping, setKeeping] = useState<BillingRefund | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const [showDone, setShowDone] = useState(false);
  /** Raised, covered and skipped bills: read only when asked for. The list the
   *  page reads is pending only (the API's default since review item 14), so
   *  history is its own read, `status=all`, newest first. */
  const [done, setDone] = useState<readonly BillingDue[] | null>(null);
  const [acting, setActing] = useState(false);

  const pending = dues.filter((d) => d.status === "open" || d.status === "drafted");
  const groups = groupDues(pending);

  async function loadDone(): Promise<void> {
    const result = await api.GET("/api/v1/billing/dues", { params: { query: { status: "all" } } });
    setDone(
      (result.data?.dues ?? []).filter((d) => d.status === "billed" || d.status === "skipped" || d.status === "covered"),
    );
  }

  function toggle(id: string, on: boolean): void {
    setUnticked((was) => {
      const next = new Set(was);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finished(next: Said): Promise<void> {
    setRaising(null);
    setSkipping(null);
    setLinking(null);
    setKeeping(null);
    // An untick is a choice for ONE invoice. Kept after it was raised, the bill
    // left out stayed unticked and its card's Raise sat disabled with nothing
    // saying why (found by the walk).
    setUnticked(new Set());
    await onChanged();
    if (showDone) await loadDone();
    setSaid(next);
  }

  /** Give an advance back: a credit note, its number said above the list. */
  async function refund(r: BillingRefund): Promise<void> {
    setSaid(null);
    setActing(true);
    const result = await api.POST("/api/v1/billing/refunds/{dueId}/credit-note", {
      params: { path: { dueId: r.dueId }, query: { asOf: browserDay() } },
    });
    setActing(false);
    if (result.error) {
      setSaid({ tone: "warn", text: apiError(result.error).message });
      return;
    }
    const back = payBack(r);
    await finished({
      tone: "ok",
      text:
        back === null
          ? `Credit note ${result.data.number} cancels the advance ${r.party.displayName} was asked for. Nothing was paid, so nothing goes back.`
          : `Credit note ${result.data.number} gives ${r.party.displayName} the advance back. Pay back ${formatMoney(back, r.currency)} and record it as a negative payment.`,
      invoice: { id: r.invoice.id, number: r.invoice.number },
    });
  }

  /** Bill a one-time service with no process now: its final bill joins the list. */
  async function billItNow(b: BillingBillNow): Promise<void> {
    setSaid(null);
    setActing(true);
    const result = await api.POST("/api/v1/billing/engagements/{engagementId}/bill-now", {
      params: { path: { engagementId: b.engagementId } },
    });
    setActing(false);
    if (result.error) {
      setSaid({ tone: "warn", text: apiError(result.error).message });
      return;
    }
    await finished({ tone: "ok", text: `${b.serviceName} for ${b.party.displayName} is on the list to raise.` });
  }

  return (
    <>
      {autoBilling === false && (
        <Notice tone="warn">
          <p>
            Automatic billing is off, so no new bills are made.{" "}
            <Link href={"/admin/firm#billing" as Route}>Turn it on</Link>
          </p>
        </Notice>
      )}

      {said !== null && (
        <Notice tone={said.tone}>
          <p>
            {said.text}
            {said.invoice !== undefined && (
              <>
                {" "}
                <Link href={`/invoices/${said.invoice.id}` as Route}>
                  {said.invoice.number === null ? "Open the draft" : `Open ${said.invoice.number}`}
                </Link>
              </>
            )}
          </p>
        </Notice>
      )}

      {groups.length === 0 ? (
        <Card>
          <Empty title="Nothing to raise" icon="check">
            Bills appear here when a period with billing set up falls due.
          </Empty>
        </Card>
      ) : (
        groups.map((g) => {
          // An advance is raised on its own, from its own row.
          const open = g.dues.filter((d) => d.status === "open" && d.kind !== "advance");
          const picked = open.filter((d) => !unticked.has(d.id));
          return (
            <Card key={g.key}>
              <CardHead
                level={2}
                title={<Link href={`/clients/${g.party.id}` as Route}>{g.party.displayName}</Link>}
                aside={
                  canWrite && open.length > 0 ? (
                    <Button
                      variant="secondary"
                      disabled={picked.length === 0}
                      onClick={() => {
                        setSaid(null);
                        setRaising(picked);
                      }}
                    >
                      {picked.length > 1 ? `Raise invoice for ${String(picked.length)}` : "Raise invoice"}
                    </Button>
                  ) : undefined
                }
              />
              <p className="text-ink-2">
                {g.issuer.displayName} · {g.currency} · Manager{" "}
                {g.manager === null ? <NotSet /> : <strong>{billingPersonName(g.manager)}</strong>}
              </p>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      {canWrite && (
                        <Th>
                          <span className="sr-only">Include</span>
                        </Th>
                      )}
                      <Th>Service</Th>
                      <Th>Period</Th>
                      <Th>Bill date</Th>
                      <Th align="right">Amount</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.dues.map((d) => (
                      <tr key={d.id}>
                        {canWrite && (
                          <Td>
                            {d.status === "open" && d.kind !== "advance" && (
                              <Checkbox
                                label={<span className="sr-only">{`Include ${billLabel(d)}`}</span>}
                                checked={!unticked.has(d.id)}
                                onChange={(e) => {
                                  toggle(d.id, e.target.checked);
                                }}
                              />
                            )}
                          </Td>
                        )}
                        <Td>
                          <span className="cell-text">
                            {d.kind === "advance" && d.engagementId === null ? "Advance for the whole letter" : d.serviceName}
                          </span>
                          {d.kind !== "period" && (
                            <>
                              {" "}
                              <Pill tone="quiet">{d.kind === "advance" ? "Advance" : "Final bill"}</Pill>
                            </>
                          )}
                          {d.entityName !== null && d.entityName !== g.party.displayName && <Sub>{d.entityName}</Sub>}
                          <Sub>
                            <Link href={`/engagement-letters/${d.letter.id}` as Route}>{d.letter.ref}</Link>
                          </Sub>
                          {d.managerHow !== "spoc_manager" && d.managerNote !== null && (
                            <Sub>
                              <span className="cell-text tone-warn">{d.managerNote}</span>
                            </Sub>
                          )}
                        </Td>
                        <Td className="nowrap">
                          {d.kind === "advance" ? "Before work starts" : d.kind === "final" ? "Work done" : d.periodLabel}
                          {d.servedDays < d.periodDays && (
                            <Sub>
                              {d.servedDays} of {d.periodDays} days
                            </Sub>
                          )}
                        </Td>
                        <Td className="nowrap">
                          {longDay(d.billOn)}
                          {d.escalated && (
                            <span className="sub tone-danger">
                              {d.managerReportsTo === null
                                ? "Overdue"
                                : `Overdue, also with ${billingPersonName(d.managerReportsTo)}`}
                            </span>
                          )}
                        </Td>
                        <Td align="right" className="nowrap">
                          {!d.priced ? (
                            <>
                              <NotSet>No price</NotSet>
                              {d.status === "open" && (
                                <Sub>
                                  <span className="tone-warn">{noPriceWords(d.daysSinceBillOn)}</span>
                                </Sub>
                              )}
                            </>
                          ) : d.amount === null ? (
                            <NotSet>Hidden</NotSet>
                          ) : (
                            <>
                              {formatMoney(d.amount, d.currency)}
                              {d.fullAmount !== null && d.servedDays < d.periodDays && (
                                <Sub>of {formatMoney(d.fullAmount, d.currency)}</Sub>
                              )}
                            </>
                          )}
                          {d.kind === "advance" && <Sub>before tax</Sub>}
                          {d.status === "open" && d.advancePool !== null && (
                            <Sub>
                              <span className="tone-ok">
                                {d.advancePool.remaining === null
                                  ? "Less the advance"
                                  : `Less up to ${formatMoney(d.advancePool.remaining, d.currency)} advance`}
                              </span>
                            </Sub>
                          )}
                        </Td>
                        <Td className="nowrap">
                          {d.status === "drafted" && d.invoice !== null ? (
                            <>
                              <Pill dot tone="warn">
                                On a draft
                              </Pill>
                              <Sub>
                                <Link href={`/invoices/${d.invoice.id}` as Route}>{invoiceNumberWords(d.invoice.number)}</Link>
                              </Sub>
                            </>
                          ) : canWrite ? (
                            <span className="cluster">
                              {d.kind === "advance" && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  aria-label={`Raise the invoice for ${billLabel(d)}`}
                                  onClick={() => {
                                    setSaid(null);
                                    setRaising([d]);
                                  }}
                                >
                                  Raise invoice
                                </Button>
                              )}
                              {/* An advance linked to a paid invoice starts the
                                  work, so it is an admin's (0321). */}
                              {(d.kind !== "advance" || isAdmin) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Link ${billLabel(d)} to an invoice`}
                                  onClick={() => {
                                    setSaid(null);
                                    setLinking(d);
                                  }}
                                >
                                  Link
                                </Button>
                              )}
                              {/* The firm's billing:skip; an advance only once no
                                  work waits on it (0321). */}
                              {canSkip && (d.kind !== "advance" || !d.advanceHoldsWork) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Skip ${billLabel(d)}`}
                                  onClick={() => {
                                    setSaid(null);
                                    setSkipping(d);
                                  }}
                                >
                                  Skip
                                </Button>
                              )}
                            </span>
                          ) : (
                            <Pill dot tone="neutral">
                              To raise
                            </Pill>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Card>
          );
        })
      )}

      {refunds.length > 0 && (
        <Card>
          <CardHead level={2} title="To refund" />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Advance</Th>
                  <Th align="right">Left</Th>
                  <Th align="right">Credit note</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.dueId}>
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        <Link href={`/clients/${r.party.id}` as Route}>{r.party.displayName}</Link>
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/invoices/${r.invoice.id}` as Route}>{r.invoice.number}</Link>
                      <Sub>
                        {r.serviceName === "All services" ? "Whole letter" : r.serviceName} ·{" "}
                        <Link href={`/engagement-letters/${r.letter.id}` as Route}>{r.letter.ref}</Link>
                      </Sub>
                    </Td>
                    <Td align="right" className="nowrap">
                      {r.remaining === null ? <NotSet>Hidden</NotSet> : formatMoney(r.remaining, r.currency)}
                      <Sub>before tax</Sub>
                    </Td>
                    <Td align="right" className="nowrap">
                      {r.refundAmount === null ? <NotSet>Hidden</NotSet> : formatMoney(r.refundAmount, r.currency)}
                      <Sub>with tax</Sub>
                    </Td>
                    <Td className="nowrap">
                      {mayIssue ? (
                        <span className="cluster">
                          {seesFees && (
                          <ConfirmAction
                            variant="secondary"
                            size="sm"
                            disabled={acting}
                            title={`Give ${r.party.displayName} the advance back?`}
                            confirmLabel="Issue the credit note"
                            consequence={
                              <p>
                                A credit note on {r.invoice.number} for what is left, with its tax.{" "}
                                {payBack(r) === null
                                  ? "Nothing was paid on it, so nothing goes back."
                                  : `Pay back ${formatMoney(payBack(r), r.currency)} and record it as a negative payment.`}
                              </p>
                            }
                            onConfirm={() => void refund(r)}
                          >
                            Give it back
                          </ConfirmAction>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Keep the advance on ${r.invoice.number}`}
                            onClick={() => {
                              setSaid(null);
                              setKeeping(r);
                            }}
                          >
                            Keep it
                          </Button>
                        </span>
                      ) : (
                        <Pill dot tone="warn">
                          For whoever issues invoices
                        </Pill>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {billNow.length > 0 && (
        <Card>
          <CardHead level={2} title="One-time work with no process" />
          <p className="text-ink-2">Its job never finishes by itself. Bill it when the work is done.</p>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Service</Th>
                  <Th align="right">Fee</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {billNow.map((b) => (
                  <tr key={b.engagementId}>
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        <Link href={`/clients/${b.party.id}` as Route}>{b.party.displayName}</Link>
                      </span>
                    </Td>
                    <Td>
                      <span className="cell-text">{b.serviceName}</span>
                      <Sub>{b.letterRef}</Sub>
                    </Td>
                    <Td align="right" className="nowrap">
                      {b.fullAmount === null ? <NotSet>No price</NotSet> : formatMoney(b.fullAmount, b.currency)}
                    </Td>
                    <Td className="nowrap">
                      {canWrite && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={acting}
                          aria-label={`Bill ${b.serviceName} now`}
                          onClick={() => void billItNow(b)}
                        >
                          Bill it now
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <div className="cluster">
        <Button
          variant="ghost"
          aria-expanded={showDone}
          aria-controls="billing-done"
          onClick={() => {
            const next = !showDone;
            setShowDone(next);
            if (next) void loadDone();
          }}
        >
          {showDone ? "Hide raised and skipped" : "Show raised and skipped"}
        </Button>
      </div>
      {showDone && (
        <div id="billing-done">
          {done === null ? (
            <Loading label="Loading raised and skipped bills" />
          ) : done.length === 0 ? (
            <p className="text-ink-2">Nothing raised or skipped yet.</p>
          ) : (
            <DoneTable dues={done} />
          )}
        </div>
      )}

      <RaiseDialog
        dues={raising}
        onClose={() => {
          setRaising(null);
        }}
        onRaised={(out, count) => finished(raisedWords(out, count))}
      />
      <KeepDialog
        refund={keeping}
        onClose={() => {
          setKeeping(null);
        }}
        onKept={(r) => finished({ tone: "ok", text: `${r.party.displayName}'s advance on ${r.invoice.number} is kept.` })}
      />
      <SkipDialog
        due={skipping}
        onClose={() => {
          setSkipping(null);
        }}
        onSkipped={(d) => finished({ tone: "ok", text: `${billLabel(d)} will not be billed.` })}
      />
      <LinkDialog
        due={linking}
        invoices={invoices}
        onClose={() => {
          setLinking(null);
        }}
        onLinked={(d, number) =>
          finished({ tone: "ok", text: `${billLabel(d)} is billed on ${number}.` })
        }
      />
    </>
  );
}


/** What a raise did, in one sentence: drafted, covered by the advance, or both. */
function raisedWords(out: Raised, count: number): Said {
  const covered = out.covered.length;
  const coveredWords = `${String(covered)} ${covered === 1 ? "bill was" : "bills were"} paid in full by the advance`;
  // No invoice id = the advance paid every bill. A draft has no number until
  // an admin issues it (0322), so `number` is null on every new draft.
  if (out.invoiceId === null) {
    return { tone: "ok", text: `No invoice needed: ${coveredWords}.` };
  }
  const invoice = { id: out.invoiceId, number: out.number };
  const lines = count - covered;
  if (out.conflicts.length > 0) {
    return {
      tone: "warn",
      text: `Drafted an invoice, but ${String(out.conflicts.length)} of its bills were settled by somebody else meanwhile. Remove those lines from the draft.`,
      invoice,
    };
  }
  return {
    tone: "ok",
    text: `Drafted an invoice with ${String(lines)} ${lines === 1 ? "bill" : "bills"}${covered > 0 ? `; ${coveredWords}` : ""}. It gets its number when it is issued.`,
    invoice,
  };
}

/** What the last act did, said once above the list. */
interface Said {
  readonly tone: "ok" | "warn";
  readonly text: string;
  readonly invoice?: { readonly id: string; readonly number: string | null };
}

interface DueGroup {
  readonly key: string;
  readonly party: BillingDue["party"];
  readonly issuer: BillingDue["issuer"];
  readonly currency: string;
  readonly manager: BillingDue["manager"];
  readonly dues: BillingDue[];
}

/** By client, company, currency and manager: the four an invoice cannot mix.
 *  Oldest bill first, so what has waited longest is at the top. */
function groupDues(dues: readonly BillingDue[]): DueGroup[] {
  const groups = new Map<string, DueGroup>();
  for (const d of dues) {
    const key = [d.party.id, d.issuer.id, d.currency, d.manager?.userId ?? ""].join("|");
    const group = groups.get(key) ?? {
      key,
      party: d.party,
      issuer: d.issuer,
      currency: d.currency,
      manager: d.manager,
      dues: [],
    };
    group.dues.push(d);
    groups.set(key, group);
  }
  const oldest = (g: DueGroup): string => g.dues.reduce((min, d) => (d.billOn < min ? d.billOn : min), "9999-12-31");
  for (const g of groups.values()) {
    g.dues.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.serviceName.localeCompare(b.serviceName));
  }
  return [...groups.values()].sort(
    (a, b) => oldest(a).localeCompare(oldest(b)) || a.party.displayName.localeCompare(b.party.displayName),
  );
}

/** Raised and skipped bills: what became of each. */
function DoneTable({ dues }: { dues: readonly BillingDue[] }) {
  const sorted = [...dues].sort(
    (a, b) => b.periodStart.localeCompare(a.periodStart) || a.party.displayName.localeCompare(b.party.displayName),
  );
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Service</Th>
            <Th>Period</Th>
            <Th>What happened</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id}>
              <Td>
                <span className="cell-text" data-size="narrow">
                  <Link href={`/clients/${d.party.id}` as Route}>{d.party.displayName}</Link>
                </span>
              </Td>
              <Td>
                <span className="cell-text">{billLabel(d)}</span>
                {d.entityName !== null && d.entityName !== d.party.displayName && <Sub>{d.entityName}</Sub>}
              </Td>
              <Td className="nowrap">{d.kind === "period" ? d.periodLabel : longDay(d.billOn)}</Td>
              <Td>
                {d.status === "covered" && d.advanceApplied !== null ? (
                  <>Covered by the advance on {d.advanceApplied.invoiceNumber}</>
                ) : d.status === "billed" && d.invoice !== null ? (
                  <>
                    Billed on <Link href={`/invoices/${d.invoice.id}` as Route}>{invoiceNumberWords(d.invoice.number)}</Link>
                  </>
                ) : d.skipped !== null ? (
                  <>
                    <span className="cell-text">Skipped: {d.skipped.reason}</span>
                    <Sub>
                      {d.skipped.by === null ? "" : `${billingPersonName(d.skipped.by)}, `}
                      {longInstant(d.skipped.at)}
                    </Sub>
                  </>
                ) : (
                  codeLabel(d.status)
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

// ── Raise ───────────────────────────────────────────────────────────────────

type Raised = {
  readonly invoiceId: string | null;
  readonly number: string | null;
  readonly covered: readonly string[];
  readonly conflicts: readonly string[];
};

/**
 * One draft invoice from the ticked bills. Asked per bill: the tax rate
 * (prefilled with the rate this work's last invoice line carried) and the
 * amount, only where the letter fixed none. The exchange rate starts at the
 * one the letters were struck at, when they agree. "Today" is the reader's
 * calendar day (`asOf`), so an invoice raised at 00:30 in Mumbai is not
 * Greenwich's yesterday.
 */
function RaiseDialog({
  dues,
  onClose,
  onRaised,
}: {
  dues: readonly BillingDue[] | null;
  onClose: () => void;
  onRaised: (out: Raised, count: number) => Promise<void>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = dues?.[0];
  if (dues === null || first === undefined) return null;

  // The letters' rate, when every bill's letter agrees; otherwise the box is
  // empty and must be filled (the API would refuse to guess).
  const rates = new Set(dues.map((d) => `${d.letter.fxRate}|${d.letter.fxRateDate}`));
  const agreed = rates.size === 1 ? first.letter : null;
  const today = browserDay();

  async function raise(form: FormData): Promise<void> {
    if (dues === null) return;
    setBusy(true);
    setError(null);
    const dueOn = String(form.get("dueOn") ?? "");
    const result = await api.POST("/api/v1/billing/raise", {
      params: { query: { asOf: browserDay() } },
      body: {
        dueIds: dues.map((d) => d.id),
        lines: dues.map((d) => {
          const typed = form.get(`amount-${d.id}`);
          return {
            dueId: d.id,
            taxPercent: cleanAmount(String(form.get(`tax-${d.id}`) ?? "")),
            ...(typed === null ? {} : { amount: cleanAmount(String(typed)) }),
          };
        }),
        fxRate: cleanAmount(String(form.get("fxRate") ?? "")),
        fxRateDate: String(form.get("fxRateDate") ?? ""),
        ...(dueOn === "" ? {} : { dueOn }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setError(null);
    await onRaised(result.data, dues.length);
  }

  function close(): void {
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={close}
      title={
        first.kind === "advance"
          ? `Raise the advance invoice for ${first.party.displayName}`
          : `Raise an invoice for ${first.party.displayName}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Raise invoice
          </Button>
        </>
      }
    >
      <form
        id={formId}
        action={(form) => {
          void raise(form);
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">
            Charged by {first.issuer.displayName}, in {first.currency}. The number comes from its series.
          </p>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Tax %</Th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <span className="cell-text">{billLabel(d)}</span>
                      {d.entityName !== null && d.entityName !== d.party.displayName && <Sub>{d.entityName}</Sub>}
                      {d.advancePool !== null && (
                        <Sub>
                          <span className="tone-ok">
                            Less the advance on {d.advancePool.invoiceNumber}
                            {d.advancePool.remaining === null
                              ? ""
                              : `, up to ${formatMoney(d.advancePool.remaining, d.currency)} before tax`}
                          </span>
                        </Sub>
                      )}
                    </Td>
                    <Td align="right" className="nowrap">
                      {d.amount !== null ? (
                        formatMoney(d.amount, d.currency)
                      ) : !d.priced ? (
                        <AmountInput
                          name={`amount-${d.id}`}
                          required
                          aria-label={`Amount for ${billLabel(d)}`}
                          placeholder="e.g. 25,000"
                        />
                      ) : (
                        <NotSet>Hidden</NotSet>
                      )}
                    </Td>
                    <Td align="right">
                      <AmountInput
                        decimals={4}
                        name={`tax-${d.id}`}
                        required
                        aria-label={`Tax % for ${billLabel(d)}`}
                        defaultValue={d.lastTaxPercent === null ? "" : formatCount(d.lastTaxPercent)}
                        placeholder="e.g. 18"
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <FieldRow>
            <Field label="Rate to the firm's currency" hint={agreed !== null ? "As in the letter." : undefined}>
              <AmountInput
                decimals={10}
                name="fxRate"
                required
                defaultValue={agreed === null ? "" : formatCount(agreed.fxRate)}
                placeholder="e.g. 1"
              />
            </Field>
            <Field label="Rate as of">
              <Input name="fxRateDate" type="date" required defaultValue={agreed?.fxRateDate ?? today} />
            </Field>
            <Field label="Due" optional hint="No due date means no payment reminders.">
              <Input name="dueOn" type="date" />
            </Field>
          </FieldRow>
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── Skip ────────────────────────────────────────────────────────────────────

/** Decide a bill will not be raised. The reason is required and kept on the
 *  bill; there is no undo, so the dialog names what is being skipped. */
function SkipDialog({
  due,
  onClose,
  onSkipped,
}: {
  due: BillingDue | null;
  onClose: () => void;
  onSkipped: (due: BillingDue) => Promise<void>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (due === null) return null;

  async function skip(form: FormData): Promise<void> {
    if (due === null) return;
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/billing/dues/{dueId}/skip", {
      params: { path: { dueId: due.id } },
      body: { reason: String(form.get("reason") ?? "").trim() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSkipped(due);
  }

  function close(): void {
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`Skip ${billLabel(due)}?`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Skip this bill
          </Button>
        </>
      }
    >
      <form
        id={formId}
        action={(form) => {
          void skip(form);
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">{due.party.displayName} will not be billed for it.</p>
          <Field label="Why">
            <Textarea name="reason" required maxLength={500} rows={3} placeholder="e.g. Billed with the annual fee" />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── Keep an advance ─────────────────────────────────────────────────────────

/** The firm keeps an advance left over (a cancellation fee, say): the reason
 *  is required and kept, and it leaves "To refund". */
function KeepDialog({
  refund,
  onClose,
  onKept,
}: {
  refund: BillingRefund | null;
  onClose: () => void;
  onKept: (refund: BillingRefund) => Promise<void>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (refund === null) return null;

  async function keep(form: FormData): Promise<void> {
    if (refund === null) return;
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/billing/refunds/{dueId}/keep", {
      params: { path: { dueId: refund.dueId } },
      body: { reason: String(form.get("reason") ?? "").trim() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onKept(refund);
  }

  function close(): void {
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`Keep the advance on ${refund.invoice.number}?`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Keep it
          </Button>
        </>
      }
    >
      <form
        id={formId}
        action={(form) => {
          void keep(form);
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">{refund.party.displayName} will not get it back.</p>
          <Field label="Why">
            <Textarea name="reason" required maxLength={500} rows={3} placeholder="e.g. Cancellation fee in the letter" />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── Link ────────────────────────────────────────────────────────────────────

/** The bill was raised by hand: say which invoice it is on. Offers only the
 *  client's invoices from the same company in the same currency, not cancelled,
 *  which is what the API accepts. */
function LinkDialog({
  due,
  invoices,
  onClose,
  onLinked,
}: {
  due: BillingDue | null;
  invoices: readonly InvoiceSummary[];
  onClose: () => void;
  onLinked: (due: BillingDue, number: string) => Promise<void>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (due === null) return null;

  const fits = invoices.filter(
    (i) =>
      i.invoice.partyId === due.party.id &&
      i.invoice.entityPartyId === due.issuer.id &&
      i.invoice.currency === due.currency &&
      i.invoice.status !== "cancelled",
  );

  async function link(form: FormData): Promise<void> {
    if (due === null) return;
    const invoiceId = String(form.get("invoiceId") ?? "");
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/billing/dues/{dueId}/link", {
      params: { path: { dueId: due.id } },
      body: { invoiceId },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    const picked = fits.find((i) => i.invoice.id === invoiceId)?.invoice;
    await onLinked(due, picked === undefined ? "the invoice" : (picked.number ?? "the draft invoice"));
  }

  function close(): void {
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`Link ${billLabel(due)}`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {fits.length > 0 && (
            <Button type="submit" form={formId} loading={busy}>
              Link
            </Button>
          )}
        </>
      }
    >
      <form
        id={formId}
        action={(form) => {
          void link(form);
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          {fits.length === 0 ? (
            <p className="text-ink-2">
              {due.party.displayName} has no invoice from {due.issuer.displayName} in {due.currency}.
            </p>
          ) : (
            <Field label="Already billed on" hint={`${due.party.displayName}'s invoices from ${due.issuer.displayName}.`}>
              <Select name="invoiceId" required defaultValue="">
                <option value="" disabled>
                  Choose the invoice…
                </option>
                {fits.map((i) => (
                  <option key={i.invoice.id} value={i.invoice.id}>
                    {i.invoice.number === null
                      ? "Draft"
                      : `${i.invoice.number} · ${codeLabel(i.invoice.status)}`}{" "}
                    · {formatMoney(i.totals.total, i.totals.currency)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldStack>
      </form>
    </Dialog>
  );
}

/**
 * What goes back to the client after an advance's credit note (0321): the
 * credit note's amount, but never more than was actually paid, and null when
 * nothing was. A credit note on an advance nobody paid only cancels what was
 * asked for. Compared on bigints, never as numbers.
 */
function payBack(r: BillingRefund): string | null {
  if (r.paid === null || r.refundAmount === null) return null;
  const units = commonUnits([r.paid, r.refundAmount]);
  if (units === null) return null;
  const [paid = BigInt(0), refund = BigInt(0)] = units.units;
  if (paid <= BigInt(0)) return null;
  return paid < refund ? r.paid : r.refundAmount;
}
