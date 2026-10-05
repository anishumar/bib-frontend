"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  api,
  apiError,
  billingPersonName,
  colleagueLabel,
  formatCount,
  formatMoney,
  invoiceNumberWords,
} from "@/lib/api/client";
import type { AdhocAdvance, AdhocAllocation, AdvanceTarget, Colleague, TaxDefault } from "@/lib/api/client";

/** A client the raise dialog may bill: the firm's own companies are left out. */
export interface AdvanceClient {
  readonly id: string;
  readonly displayName: string;
  readonly isOwnCompany: boolean;
}
import { addDecimals, cleanAmount, compareSigned } from "@/lib/money";
import { browserDay, longDay, longInstant } from "@/lib/day";
import { useSession } from "@/components/layout";
import { ConfirmAction } from "@/components/confirm-action";
import { CurrencySelect } from "@/components/currency-select";
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
  type PillTone,
} from "@/components/ui";
import { keepTyped } from "@/lib/ui/keep-typed";
import { fxSuggestion, type FxSuggestion } from "@/lib/fx";

/**
 * ADVANCES TO BE ADJUSTED (0363, Q044-Q048): money a client paid before there
 * was an engagement letter. Each is an ordinary tax invoice; until it is mapped
 * to the services it pays for it is on this list, and the person who raised it
 * and the admins are reminded every month (Q047).
 *
 * Map splits what is left across services (and a job of one); each part then
 * comes off that service's earliest bills, before tax, and counts in that
 * service's manager's revenue. End frees what a mapping's bills have not taken,
 * to map it elsewhere or give it back. Give back is a credit note for the part
 * mapped nowhere. All three are the API's decisions: this screen offers what
 * the session's permissions allow and shows the refusal when one arrives.
 *
 * Used on Invoices (every client) and on a client's page (`partyId`).
 */
export function AdjustTab({
  partyId,
  parties,
  entities,
  colleagues,
  reportingCurrency,
  taxDefaults,
  onChanged,
}: {
  /** One client's advances only (its page). */
  partyId?: string;
  parties: readonly AdvanceClient[];
  entities: readonly { id: string; displayName: string }[];
  colleagues: readonly Colleague[];
  reportingCurrency: string;
  taxDefaults: readonly TaxDefault[];
  /** Something changed: the page re-reads its counts. */
  onChanged?: () => void | Promise<void>;
}) {
  const session = useSession();
  const seesFees = session?.commercialVisibility === true;
  const mayManage = seesFees && session?.permissions.includes("advance:manage") === true;
  const mayIssue = seesFees && session?.permissions.includes("invoice:issue") === true;

  const [rows, setRows] = useState<AdhocAdvance[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [mapping, setMapping] = useState<AdhocAdvance | null>(null);
  const [ending, setEnding] = useState<{ advance: AdhocAdvance; allocation: AdhocAllocation } | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/advances", {
      params: { query: { status: showAll ? "all" : "open", ...(partyId === undefined ? {} : { partyId }) } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setRows([]);
      return;
    }
    setRows(result.data.advances);
  }, [showAll, partyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function changed(): Promise<void> {
    await load();
    await onChanged?.();
  }

  async function giveBack(a: AdhocAdvance): Promise<void> {
    setActing(true);
    setError(null);
    const result = await api.POST("/api/v1/advances/{advanceId}/give-back", {
      params: { path: { advanceId: a.id }, query: { asOf: browserDay() } },
    });
    setActing(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await changed();
  }

  if (rows === null) return <Loading label="Loading advances" />;

  const left = leftByCurrency(rows);

  return (
    <Card>
      <CardHead
        level={2}
        title="Advances to be adjusted"
        aside={
          <>
            <Checkbox
              label="Show mapped and cancelled"
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked);
              }}
            />
            {mayManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setRaising(true);
                }}
              >
                Raise an advance
              </Button>
            )}
          </>
        }
      />
      <ErrorNotice error={raising || mapping !== null || ending !== null ? null : error} />
      {left.length > 0 && (
        <p className="text-ink-2" data-testid="adjust-left">
          Left to adjust: {left.map((l) => formatMoney(l.amount, l.currency)).join(" · ")}
        </p>
      )}
      {rows.length === 0 ? (
        <Empty title="Nothing to adjust" icon="check">
          {showAll ? "No advance has been raised before a letter." : "Every advance is mapped to its services."}
        </Empty>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                {partyId === undefined && <Th>Client</Th>}
                <Th>Invoice</Th>
                <Th align="right">Advance</Th>
                <Th>Mapped to</Th>
                <Th align="right">Left</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} data-advance={a.id}>
                  {partyId === undefined && (
                    <Td>
                      <span className="cell-text" data-size="narrow">
                        <Link href={`/clients/${a.party.id}` as Route}>{a.party.displayName}</Link>
                      </span>
                      <Sub>{a.issuer.displayName}</Sub>
                    </Td>
                  )}
                  <Td>
                    <Link href={`/invoices/${a.invoice.id}` as Route} className="nowrap">
                      {invoiceNumberWords(a.invoice.number, a.invoice.status)}
                    </Link>
                    <Sub>{a.raisedBy === null ? "Raised" : `By ${billingPersonName(a.raisedBy)}`}</Sub>
                    <Sub>{longInstant(a.raisedAt)}</Sub>
                    <div>
                      <Pill dot tone={paidTone(a)}>
                        {paidWords(a)}
                      </Pill>
                    </div>
                  </Td>
                  <Td align="right" className="nowrap">
                    {a.amount === null ? <NotSet>Hidden</NotSet> : formatMoney(a.amount, a.currency)}
                    <Sub>before tax</Sub>
                  </Td>
                  <Td>
                    <Allocations
                      advance={a}
                      mayEnd={mayManage}
                      onEnd={(allocation) => {
                        setError(null);
                        setEnding({ advance: a, allocation });
                      }}
                    />
                  </Td>
                  <Td align="right" className="nowrap">
                    {a.status === "draft" ? (
                      <NotSet>Not issued</NotSet>
                    ) : a.status === "cancelled" ? (
                      <NotSet>Cancelled</NotSet>
                    ) : a.unmapped === null ? (
                      <NotSet>Hidden</NotSet>
                    ) : (
                      formatMoney(a.unmapped, a.currency)
                    )}
                  </Td>
                  <Td>
                    <div className="cluster">
                      {a.status === "draft" && (
                        <Link href={`/invoices/${a.invoice.id}` as Route}>Issue it to map it</Link>
                      )}
                      {a.status === "open" && mayManage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setError(null);
                            setMapping(a);
                          }}
                        >
                          Map
                        </Button>
                      )}
                      {a.status === "open" && mayIssue && a.refundAmount !== null && (
                        <ConfirmAction
                          size="sm"
                          variant="secondary"
                          disabled={acting}
                          title={`Give ${a.party.displayName} this advance back?`}
                          confirmLabel="Issue the credit note"
                          consequence={
                            <p>
                              A credit note on {a.invoice.number} for {formatMoney(a.refundAmount, a.currency)}, the part
                              mapped to no service, with its tax. Pay the money back and record it as a negative payment.
                            </p>
                          }
                          onConfirm={() => {
                            void giveBack(a);
                          }}
                        >
                          Give back
                        </ConfirmAction>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {raising && (
        <RaiseAdvanceDialog
          {...(partyId === undefined ? {} : { partyId })}
          parties={parties}
          entities={entities}
          colleagues={colleagues}
          reportingCurrency={reportingCurrency}
          taxDefaults={taxDefaults}
          onClose={() => {
            setRaising(false);
          }}
        />
      )}
      {mapping !== null && (
        <MapDialog
          advance={mapping}
          onClose={() => {
            setMapping(null);
          }}
          onMapped={async () => {
            setMapping(null);
            await changed();
          }}
        />
      )}
      {ending !== null && (
        <EndDialog
          advance={ending.advance}
          allocation={ending.allocation}
          onClose={() => {
            setEnding(null);
          }}
          onEnded={async () => {
            setEnding(null);
            await changed();
          }}
        />
      )}
    </Card>
  );
}

/** What is left to adjust, per currency: never added across currencies. */
function leftByCurrency(rows: readonly AdhocAdvance[]): { currency: string; amount: string }[] {
  const by = new Map<string, string[]>();
  for (const a of rows) {
    if (a.status !== "open" || a.unmapped === null) continue;
    by.set(a.currency, [...(by.get(a.currency) ?? []), a.unmapped]);
  }
  return [...by]
    .sort(([x], [y]) => x.localeCompare(y))
    .flatMap(([currency, amounts]) => {
      const amount = addDecimals(amounts);
      return amount === null ? [] : [{ currency, amount }];
    });
}

function paidWords(a: AdhocAdvance): string {
  switch (a.paidState) {
    case "paid":
      return "Paid";
    case "part_paid":
      return "Part paid";
    case "unpaid":
      return "Not paid yet";
    default:
      return a.invoice.status === "cancelled" ? "Cancelled" : "Draft, not issued";
  }
}

function paidTone(a: AdhocAdvance): PillTone {
  if (a.paidState === "paid") return "ok";
  if (a.paidState === "part_paid" || a.paidState === "unpaid") return "warn";
  return a.invoice.status === "cancelled" ? "danger" : "neutral";
}

function targetWords(t: AdhocAllocation["target"]): string {
  if (t.kind === "letter") return `All services of ${t.letterRef}`;
  const job = t.job === null ? "" : `, ${t.job.label ?? "one job"}`;
  return `${t.serviceName}${job} (${t.letterRef})`;
}

/** Each mapping: where to, how much, what bills took, whose revenue; ended
 *  ones say so and what stayed. */
function Allocations({
  advance,
  mayEnd,
  onEnd,
}: {
  advance: AdhocAdvance;
  mayEnd: boolean;
  onEnd: (allocation: AdhocAllocation) => void;
}) {
  if (advance.allocations.length === 0) {
    return advance.namedOn.length === 0 ? (
      <NotSet>Not mapped</NotSet>
    ) : (
      <span className="text-ink-2">
        Named in {advance.namedOn.map((n) => n.ref).join(", ")}
        <Sub>Mapped when it is signed</Sub>
      </span>
    );
  }
  return (
    <ul className="stack-sm" data-testid="allocations">
      {advance.allocations.map((al) => {
        const finished =
          al.ended === null &&
          al.target.kind === "service" &&
          (al.target.engagementStatus === "completed" || al.target.engagementStatus === "cancelled") &&
          al.left !== null &&
          compareSigned(al.left, "0") === 1;
        return (
          <li key={al.id} data-allocation={al.id} className="cell-text" data-size="narrow">
            <span>{targetWords(al.target)}</span>
            <Sub>
              {al.effective === null ? "Hidden" : formatMoney(al.effective, advance.currency)}
              {al.taken !== null && al.taken !== "0.00" && ` · ${formatMoney(al.taken, advance.currency)} taken by bills`}
              {al.manager !== null && ` · ${billingPersonName(al.manager)}'s revenue`}
              {al.how === "letter_signed" && " · from the signed letter"}
            </Sub>
            {al.ended !== null ? (
              <Sub>
                Ended {longInstant(al.ended.at)}
                {al.ended.by === null ? "" : ` by ${billingPersonName(al.ended.by)}`}: {al.ended.reason}
              </Sub>
            ) : (
              <>
                {finished && <span className="sub tone-warn">Left on a finished service</span>}
                {mayEnd && al.left !== null && compareSigned(al.left, "0") === 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onEnd(al);
                    }}
                  >
                    End
                  </Button>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Raise ───────────────────────────────────────────────────────────────────

function RaiseAdvanceDialog({
  partyId,
  parties,
  entities,
  colleagues,
  reportingCurrency,
  taxDefaults,
  onClose,
}: {
  partyId?: string;
  parties: readonly AdvanceClient[];
  entities: readonly { id: string; displayName: string }[];
  colleagues: readonly Colleague[];
  reportingCurrency: string;
  taxDefaults: readonly TaxDefault[];
  onClose: () => void;
}) {
  const router = useRouter();
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [billTo, setBillTo] = useState(partyId ?? "");
  const [chargedBy, setChargedBy] = useState("");
  const [currency, setCurrency] = useState(reportingCurrency);
  const [manager, setManager] = useState("");
  const [fx, setFx] = useState<{ code: string; s: FxSuggestion | null } | null>(null);
  const today = browserDay();
  const code = currency.trim().toUpperCase();
  const foreign = code.length === 3 && code !== reportingCurrency;
  const suggested = foreign && fx?.code === code ? fx.s : null;
  // "18", not the API's "18.0000": the box shows what a person would type.
  const defaultTax = formatCount(taxDefaults.find((t) => t.entityPartyId === chargedBy)?.taxPercent ?? "");

  useEffect(() => {
    if (!foreign) return;
    void fxSuggestion(code, browserDay()).then((s) => {
      setFx({ code, s });
    });
  }, [foreign, code]);

  async function raise(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const rate = foreign ? cleanAmount(String(form.get("fxRate") ?? "")) : "";
    const rateDate = foreign ? String(form.get("fxRateDate") ?? "") : "";
    const tax = cleanAmount(String(form.get("taxPercent") ?? ""));
    const note = String(form.get("note") ?? "").trim();
    const result = await api.POST("/api/v1/advances", {
      params: { query: { asOf: browserDay() } },
      body: {
        partyId: billTo,
        entityPartyId: chargedBy,
        currency: code,
        amount: cleanAmount(String(form.get("amount") ?? "")),
        ...(tax === "" ? {} : { taxPercent: tax }),
        ...(rate === "" ? {} : { fxRate: rate }),
        ...(rateDate === "" ? {} : { fxRateDate: rateDate }),
        ...(manager === "" ? {} : { managerUserId: manager }),
        ...(note === "" ? {} : { note }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/invoices/${result.data.invoiceId}` as Route);
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Raise an advance"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Raise the advance
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) =>
          keepTyped(event, (form) => {
            void raise(form);
          })
        }
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">A draft tax invoice. Once issued, map it to the services it pays for.</p>
          <FieldRow>
            <Field label="Client">
              <Select
                name="partyId"
                required
                value={billTo}
                disabled={partyId !== undefined}
                onChange={(e) => {
                  setBillTo(e.target.value);
                }}
              >
                <option value="">Choose the client…</option>
                {parties
                  .filter((p) => !p.isOwnCompany && !entities.some((e) => e.id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Charged by" hint="The company whose bills it will come off.">
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
            <Field label="Currency">
              <CurrencySelect
                name="currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                }}
                required
              />
            </Field>
            {foreign && (
              <>
                <Field
                  label={`${reportingCurrency} for one ${code}`}
                  hint={suggested === null ? undefined : `${suggested.source} rate, ${longDay(suggested.on)}.`}
                >
                  <AmountInput
                    key={suggested?.rate ?? "typed"}
                    decimals={10}
                    name="fxRate"
                    required
                    placeholder="e.g. 22.75"
                    defaultValue={suggested?.rate ?? ""}
                  />
                </Field>
                <Field label="Rate on">
                  <Input key={suggested?.on ?? "today"} name="fxRateDate" type="date" defaultValue={suggested?.on ?? today} required />
                </Field>
              </>
            )}
          </FieldRow>
          <FieldRow>
            <Field label="Amount before tax">
              <AmountInput name="amount" required placeholder="e.g. 50,000" />
            </Field>
            <Field label="Tax rate (%)" hint={defaultTax === "" ? "This company has no default rate." : "The company's default rate."}>
              <AmountInput key={`${chargedBy}-${defaultTax}`} decimals={4} name="taxPercent" required placeholder="e.g. 18" defaultValue={defaultTax} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Manager" optional hint="Blank: the client's Key Manager.">
              <Select
                value={manager}
                onChange={(e) => {
                  setManager(e.target.value);
                }}
              >
                <option value="">The client&apos;s Key Manager</option>
                {colleagues.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {colleagueLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <Field label="Note" optional>
            <Textarea name="note" maxLength={500} rows={2} placeholder="e.g. For the company incorporation, letter to follow" />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────────

function MapDialog({
  advance,
  onClose,
  onMapped,
}: {
  advance: AdhocAdvance;
  onClose: () => void;
  onMapped: () => Promise<void>;
}) {
  const formId = useId();
  const [services, setServices] = useState<AdvanceTarget[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await api.GET("/api/v1/advances/{advanceId}/targets", {
        params: { path: { advanceId: advance.id } },
      });
      if (result.error) {
        setError(apiError(result.error).message);
        setServices([]);
        return;
      }
      setServices(result.data.services);
    })();
  }, [advance.id]);

  const picked = useMemo(
    () =>
      Object.entries(amounts)
        .map(([engagementId, typed]) => ({ engagementId, amount: cleanAmount(typed) }))
        .filter((t) => t.amount !== ""),
    [amounts],
  );
  const total = addDecimals(picked.map((p) => p.amount));
  const over =
    total !== null && advance.unmapped !== null && compareSigned(total, advance.unmapped) === 1;

  async function map(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/advances/{advanceId}/allocations", {
      params: { path: { advanceId: advance.id } },
      body: {
        targets: picked.map((p) => ({
          engagementId: p.engagementId,
          amount: p.amount,
          ...((jobs[p.engagementId] ?? "") === "" ? {} : { jobId: jobs[p.engagementId] }),
        })),
        reason: String(form.get("reason") ?? "").trim(),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onMapped();
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={`Map ${advance.invoice.number ?? "the advance"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={picked.length === 0}>
            Map it
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) =>
          keepTyped(event, (form) => {
            void map(form);
          })
        }
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">
            {advance.party.displayName}: {advance.unmapped === null ? "" : formatMoney(advance.unmapped, advance.currency)} left
            to map. Each part comes off that service&apos;s earliest bills, before tax.
          </p>
          {services === null ? (
            <Loading label="Loading services" />
          ) : services.length === 0 ? (
            <Notice tone="warn">This client has no services yet. Map it once a letter is signed.</Notice>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Service</Th>
                    <Th>Job</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.engagementId} data-service={s.engagementId}>
                      <Td>
                        <span className="cell-text">{s.serviceName}</span>
                        <Sub>
                          {s.letterRef} · {s.currency}
                        </Sub>
                        {s.refusal !== null && <span className="sub tone-warn">{s.refusal}</span>}
                      </Td>
                      <Td>
                        <Select
                          variant="quiet"
                          aria-label={`Job of ${s.serviceName}`}
                          disabled={s.refusal !== null || s.jobs.length === 0}
                          value={jobs[s.engagementId] ?? ""}
                          onChange={(e) => {
                            setJobs((j) => ({ ...j, [s.engagementId]: e.target.value }));
                          }}
                        >
                          <option value="">Whole service</option>
                          {s.jobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.label ?? "The job"}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td align="right">
                        <AmountInput
                          aria-label={`Amount for ${s.serviceName}`}
                          disabled={s.refusal !== null}
                          placeholder="e.g. 20,000"
                          value={amounts[s.engagementId] ?? ""}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setAmounts((a) => ({ ...a, [s.engagementId]: value }));
                          }}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          {total !== null && picked.length > 0 && (
            <p className={over ? "tone-danger" : "text-ink-2"} data-testid="map-total">
              Mapping {formatMoney(total, advance.currency)}
              {over && advance.unmapped !== null && `, more than the ${formatMoney(advance.unmapped, advance.currency)} left`}
            </p>
          )}
          <Field label="Why">
            <Textarea name="reason" required maxLength={500} rows={2} placeholder="e.g. As agreed with the client on the call" />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── End ─────────────────────────────────────────────────────────────────────

function EndDialog({
  advance,
  allocation,
  onClose,
  onEnded,
}: {
  advance: AdhocAdvance;
  allocation: AdhocAllocation;
  onClose: () => void;
  onEnded: () => Promise<void>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function end(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/advances/{advanceId}/allocations/{allocationId}/end", {
      params: { path: { advanceId: advance.id, allocationId: allocation.id } },
      body: { reason: String(form.get("reason") ?? "").trim() },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onEnded();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`End the mapping to ${targetWords(allocation.target)}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            End the mapping
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) =>
          keepTyped(event, (form) => {
            void end(form);
          })
        }
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">
            {allocation.left === null
              ? "What its bills have not taken goes back to the advance."
              : `${formatMoney(allocation.left, advance.currency)} goes back to the advance; what bills took stays.`}
          </p>
          <Field label="Why">
            <Textarea name="reason" required maxLength={500} rows={2} placeholder="e.g. Moving it to the incorporation" />
          </Field>
        </FieldStack>
      </form>
    </Dialog>
  );
}
