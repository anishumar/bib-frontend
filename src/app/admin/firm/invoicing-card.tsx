"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { api, apiError } from "@/lib/api/client";
import type { CompanyBankAccount, CompanyInvoicing } from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  NotSet,
  Select,
  Sub,
  Switch,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { countryName } from "@/lib/country";
import { longDay } from "@/lib/day";

/**
 * WHERE A CLIENT PAYS, AND THE LUT AN EXPORT GOES UNDER (Q056, 0369): what each
 * of the firm's companies prints on its invoices.
 *
 * A bank account is written once. Adding one for a currency that already has
 * one REPLACES it (the API retires the old one in the same write), and an
 * invoice already issued keeps printing the account it went out with. An
 * invoice prints the account for its own currency, else the general one.
 *
 * An LUT is for one financial year: with one in force, an Indian company's
 * invoice to a client outside India is zero-rated and says so; without one,
 * IGST is charged. Only an Indian company is offered one.
 */
export function InvoicingCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const [companies, setCompanies] = useState<CompanyInvoicing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bankFor, setBankFor] = useState<{ company: CompanyInvoicing; replacing: CompanyBankAccount | null } | null>(
    null,
  );
  const [lutFor, setLutFor] = useState<CompanyInvoicing | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const r = await api.GET("/api/v1/invoicing/companies", {});
    if (r.error) {
      setError(apiError(r.error).message);
      return;
    }
    setCompanies(r.data.companies);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** One busy flag, the refusal word for word, a reload of this card and of
   *  the page (its readiness line). Cleared BEFORE the call. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>, done: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await load();
    await onChanged();
    setNotice(done);
    setBusy(null);
    return true;
  }

  return (
    <Card id="invoicing">
      <CardHead level={2} title="Bank details and LUT on invoices">
        <p className="muted">
          What each company prints on its invoices. An invoice prints the account for its currency, else the
          general one.
        </p>
      </CardHead>
      <ErrorNotice error={error} />
      {notice !== null && <Notice tone="ok">{notice}</Notice>}
      {companies === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="stack">
          {companies.map((c) => (
            <CompanyBlock
              key={c.entityPartyId}
              company={c}
              busy={busy}
              onAddBank={() => {
                setError(null);
                setBankFor({ company: c, replacing: null });
              }}
              onReplaceBank={(b) => {
                setError(null);
                setBankFor({ company: c, replacing: b });
              }}
              onRetireBank={(b) =>
                act(
                  `bank:${b.id}`,
                  () =>
                    api.POST("/api/v1/firm-entities/{entityPartyId}/bank-accounts/{accountId}/retire", {
                      params: { path: { entityPartyId: c.entityPartyId, accountId: b.id } },
                    }),
                  `${b.bankName} ${b.accountNumber} is no longer printed on ${c.name}'s invoices.`,
                )
              }
              onAddLut={() => {
                setError(null);
                setLutFor(c);
              }}
              onRetireLut={(l) =>
                act(
                  `lut:${l.id}`,
                  () =>
                    api.POST("/api/v1/firm-entities/{entityPartyId}/luts/{lutId}/retire", {
                      params: { path: { entityPartyId: c.entityPartyId, lutId: l.id } },
                    }),
                  `The LUT for ${l.financialYearLabel} is taken off ${c.name}. Exports from it charge IGST.`,
                )
              }
              onRoundOff={(on) =>
                act(
                  `round:${c.entityPartyId}`,
                  () =>
                    api.PUT("/api/v1/firm-entities/{entityPartyId}/round-off", {
                      params: { path: { entityPartyId: c.entityPartyId } },
                      body: { roundOff: on },
                    }),
                  on
                    ? `${c.name}'s invoices now round the total to the nearest whole unit, with a Round off line.`
                    : `${c.name}'s invoices now keep the exact total.`,
                )
              }
            />
          ))}
        </div>
      )}

      {bankFor !== null && (
        <BankDialog
          company={bankFor.company}
          replacing={bankFor.replacing}
          busy={busy === "bank"}
          error={error}
          onClose={() => setBankFor(null)}
          onSave={async (body) => {
            const ok = await act(
              "bank",
              () =>
                api.POST("/api/v1/firm-entities/{entityPartyId}/bank-accounts", {
                  params: { path: { entityPartyId: bankFor.company.entityPartyId } },
                  body,
                }),
              `${bankFor.company.name}'s invoices${body.currency == null ? "" : ` in ${body.currency}`} now print ${body.bankName} ${body.accountNumber}.`,
            );
            if (ok) setBankFor(null);
          }}
        />
      )}
      {lutFor !== null && (
        <LutDialog
          company={lutFor}
          busy={busy === "lut"}
          error={error}
          onClose={() => setLutFor(null)}
          onSave={async (body) => {
            const ok = await act(
              "lut",
              () =>
                api.POST("/api/v1/firm-entities/{entityPartyId}/luts", {
                  params: { path: { entityPartyId: lutFor.entityPartyId } },
                  body,
                }),
              `${lutFor.name}'s LUT for ${yearLabel(body.financialYear)} is recorded. Its exports that year are zero-rated.`,
            );
            if (ok) setLutFor(null);
          }}
        />
      )}
    </Card>
  );
}

function CompanyBlock({
  company,
  busy,
  onAddBank,
  onReplaceBank,
  onRetireBank,
  onAddLut,
  onRetireLut,
  onRoundOff,
}: {
  company: CompanyInvoicing;
  busy: string | null;
  onAddBank: () => void;
  onReplaceBank: (b: CompanyBankAccount) => void;
  onRetireBank: (b: CompanyBankAccount) => void;
  onAddLut: () => void;
  onRetireLut: (l: CompanyInvoicing["luts"][number]) => void;
  /** Q087: round each invoice's total to the whole unit, or stop. */
  onRoundOff: (on: boolean) => void;
}) {
  const india = company.country === "IN";
  const roundHint = `round-hint-${company.entityPartyId}`;
  return (
    <section className="stack" aria-label={company.name} data-company={company.entityPartyId}>
      <div className="cluster" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{company.name}</strong>
          <Sub>
            {company.country === null ? "No country" : countryName(company.country)}
            {india && (
              <>
                {" · "}
                {company.gstin === null ? "No GSTIN: its invoices carry no GST until one is added" : `GSTIN ${company.gstin}`}
              </>
            )}
          </Sub>
        </div>
        <div className="cluster">
          <Button variant="secondary" size="sm" onClick={onAddBank} aria-label={`Add a bank account for ${company.name}`}>
            Add a bank account
          </Button>
          {india && (
            <Button variant="secondary" size="sm" onClick={onAddLut} aria-label={`Record an LUT for ${company.name}`}>
              Record an LUT
            </Button>
          )}
        </div>
      </div>
      {/* Q087 (10x, 2026-10-05: "round off"). Drafts follow at once; an
          issued invoice keeps what it did. */}
      <div>
        <Switch
          label={company.roundOff ? "Round off the total: on" : "Round off the total: off"}
          aria-label={`Round off the total on ${company.name}'s invoices`}
          aria-describedby={roundHint}
          checked={company.roundOff}
          disabled={busy === `round:${company.entityPartyId}`}
          onChange={(e) => {
            onRoundOff(e.target.checked);
          }}
        />
        <p className="field-hint" id={roundHint}>
          Rounds each invoice&rsquo;s total to the nearest whole unit and prints the difference as Round off.
          Invoices already issued keep their total. On from the start for a company registered in India.
        </p>
      </div>
      {company.bankAccounts.length === 0 ? (
        <p className="muted">No bank account yet: its invoices print no payment details.</p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>For invoices in</Th>
                <Th>Bank</Th>
                <Th>Account</Th>
                <Th>Codes</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {company.bankAccounts.map((b) => (
                <tr key={b.id}>
                  <Td>{b.currency ?? "Any currency"}</Td>
                  <Td>
                    {b.bankName}
                    {b.branch !== null && <Sub>{b.branch}</Sub>}
                  </Td>
                  <Td>
                    {b.accountNumber}
                    <Sub>{b.accountName}</Sub>
                  </Td>
                  <Td>
                    {[b.ifsc === null ? null : `IFSC ${b.ifsc}`, b.swift === null ? null : `SWIFT ${b.swift}`, b.iban === null ? null : `IBAN ${b.iban}`]
                      .filter((x): x is string => x !== null)
                      .join(" · ") || <NotSet />}
                  </Td>
                  <Td align="right">
                    <div className="cluster" style={{ justifyContent: "flex-end" }}>
                      <Button variant="secondary" size="sm" onClick={() => onReplaceBank(b)} aria-label={`Replace ${b.bankName} ${b.accountNumber}`}>
                        Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `bank:${b.id}`}
                        onClick={() => onRetireBank(b)}
                        aria-label={`Take off ${b.bankName} ${b.accountNumber}`}
                      >
                        Take off
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      {india &&
        (company.luts.length === 0 ? (
          <p className="muted">No LUT recorded: an export from this company charges IGST.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>LUT for year</Th>
                  <Th>ARN</Th>
                  <Th>Filed on</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {company.luts.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.financialYearLabel}</Td>
                    <Td>{l.reference}</Td>
                    <Td>{l.filedOn === null ? <NotSet /> : longDay(l.filedOn)}</Td>
                    <Td align="right">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `lut:${l.id}`}
                        onClick={() => onRetireLut(l)}
                        aria-label={`Take off the LUT for ${l.financialYearLabel}`}
                      >
                        Take off
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ))}
    </section>
  );
}

/** "2026-27": a financial year as it starts in April. */
function yearLabel(start: number): string {
  return `${String(start)}-${String((start + 1) % 100).padStart(2, "0")}`;
}

const CURRENCIES = ["INR", "USD", "AED", "SGD", "EUR", "GBP"];

interface BankBody {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch?: string | null;
  ifsc?: string | null;
  swift?: string | null;
  iban?: string | null;
  currency?: string | null;
}

function BankDialog({
  company,
  replacing,
  busy,
  error,
  onClose,
  onSave,
}: {
  company: CompanyInvoicing;
  replacing: CompanyBankAccount | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: BankBody) => Promise<void>;
}) {
  const formId = useId();
  const india = company.country === "IN";
  const [currency, setCurrency] = useState<string>(replacing?.currency ?? "");
  const existing = company.bankAccounts.find((b) => (b.currency ?? "") === currency) ?? null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string): string | null => {
      const v = String(form.get(name) ?? "").trim();
      return v === "" ? null : v;
    };
    void onSave({
      accountName: text("accountName") ?? "",
      accountNumber: text("accountNumber") ?? "",
      bankName: text("bankName") ?? "",
      branch: text("branch"),
      ifsc: text("ifsc"),
      swift: text("swift"),
      iban: text("iban"),
      currency: currency === "" ? null : currency,
    });
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={replacing === null ? `Add a bank account for ${company.name}` : `Replace ${replacing.bankName} ${replacing.accountNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {existing !== null ? "Replace it" : "Add it"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <FieldStack>
          <ErrorNotice error={error} />
          <FieldRow>
            <Field label="Name on the account" hint="As the bank holds it.">
              <Input name="accountName" required maxLength={200} defaultValue={replacing?.accountName ?? company.name} autoFocus />
            </Field>
            <Field label="Account number">
              <Input name="accountNumber" required maxLength={40} autoComplete="off" defaultValue={replacing?.accountNumber ?? ""} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Bank">
              <Input name="bankName" required maxLength={200} defaultValue={replacing?.bankName ?? ""} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="Branch" optional>
              <Input name="branch" maxLength={200} defaultValue={replacing?.branch ?? ""} />
            </Field>
            <Field label="For invoices in" hint="An invoice prints the account for its currency, else the general one.">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">Any currency (the general account)</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="IFSC" optional={!india} hint="11 characters, e.g. HDFC0001234.">
              <Input name="ifsc" maxLength={11} autoComplete="off" defaultValue={replacing?.ifsc ?? ""} style={{ textTransform: "uppercase" }} />
            </Field>
            <Field label="SWIFT" optional hint="For clients abroad.">
              <Input name="swift" maxLength={11} autoComplete="off" defaultValue={replacing?.swift ?? ""} style={{ textTransform: "uppercase" }} />
            </Field>
            <Field label="IBAN" optional>
              <Input name="iban" maxLength={40} autoComplete="off" defaultValue={replacing?.iban ?? ""} style={{ textTransform: "uppercase" }} />
            </Field>
          </FieldRow>
          {existing !== null && (
            <Notice tone="warn">
              <p>
                This replaces {existing.bankName} {existing.accountNumber}
                {existing.currency === null ? " (the general account)" : ` for ${existing.currency}`}. Invoices already
                issued keep printing it.
              </p>
            </Notice>
          )}
        </FieldStack>
      </form>
    </Dialog>
  );
}

function LutDialog({
  company,
  busy,
  error,
  onClose,
  onSave,
}: {
  company: CompanyInvoicing;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: { financialYear: number; reference: string; filedOn: string | null }) => Promise<void>;
}) {
  const formId = useId();
  // The year in progress (April to March) and the ones either side.
  const today = new Date();
  const current = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  const [year, setYear] = useState(current);
  const existing = company.luts.find((l) => l.financialYear === year) ?? null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const filed = String(form.get("filedOn") ?? "").trim();
    void onSave({
      financialYear: year,
      reference: String(form.get("reference") ?? "").trim(),
      filedOn: filed === "" ? null : filed,
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Record an LUT for ${company.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {existing !== null ? "Replace it" : "Record it"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="muted">
            With an LUT for the year, an invoice to a client outside India is zero-rated and prints &ldquo;Supply meant
            for export under LUT without payment of IGST&rdquo;.
          </p>
          <FieldRow>
            <Field label="Financial year">
              <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
                {[current - 1, current, current + 1].map((y) => (
                  <option key={y} value={y}>
                    {yearLabel(y)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ARN" hint="As the GST portal acknowledged it.">
              <Input name="reference" required maxLength={30} autoComplete="off" autoFocus style={{ textTransform: "uppercase" }} placeholder="e.g. AD2704260012345" />
            </Field>
            <Field label="Filed on" optional>
              <Input name="filedOn" type="date" />
            </Field>
          </FieldRow>
          {existing !== null && (
            <Notice tone="warn">
              <p>This replaces the LUT {existing.reference} for {existing.financialYearLabel}.</p>
            </Notice>
          )}
        </FieldStack>
      </form>
    </Dialog>
  );
}
