"use client";

import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import { Button, Card, CardTitle, ErrorNotice, Field, FieldRow, Input, Textarea } from "@/components/ui";
import { countryName } from "@/lib/country";
import { ConfirmAction } from "@/components/confirm-action";
import { CountrySelect } from "@/components/country-select";
import { EntityKindSelect } from "@/components/entity-kind-select";
import { YearEndField } from "@/components/year-end-field";
import { keepTyped } from "@/lib/ui/keep-typed";

/**
 * CORRECTING A CLIENT'S MASTER DATA (V2.5): the name, the company's facts and
 * an identifier typed wrong. Until this a typo in a client's name, PAN or
 * GSTIN was permanent, and a wrong PAN blocked the right one through the
 * duplicate check.
 *
 * Edit in place, behind a disclosure (Wave 4): the page reads as the record
 * until somebody asks to change it. The API names which fields changed in the
 * audit trail, never the values, and a signed letter or a filed PDF keeps the
 * name it was issued with.
 */

/** Name, trade name, industry, website: one quiet form, Save sends only what changed. */
export function EditDetails({
  partyId,
  kind,
  current,
  onSaved,
}: {
  partyId: string;
  kind: "organization" | "person";
  current: {
    readonly displayName: string;
    readonly tradeName: string | null;
    readonly industry: string | null;
    readonly website: string | null;
  };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(form: FormData): Promise<void> {
    const text = (k: string): string => String(form.get(k) ?? "").trim();
    const body: {
      displayName?: string;
      tradeName?: string | null;
      industry?: string | null;
      website?: string | null;
    } = {};
    if (text("displayName") !== current.displayName) body.displayName = text("displayName");
    if (kind === "organization") {
      for (const k of ["tradeName", "industry", "website"] as const) {
        const next = text(k) === "" ? null : text(k);
        if (next !== current[k]) body[k] = next;
      }
    }
    if (Object.keys(body).length === 0) {
      setError("Nothing changed.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.PATCH("/api/v1/parties/{partyId}", { params: { path: { partyId } }, body });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved();
  }

  return (
    <details className="disclosure">
      <summary>Edit details</summary>
      <form
        className="stack"
        onSubmit={(event) => keepTyped(event, (form) => {
          void save(form);
        })}
      >
        <FieldRow>
          <Field label="Name on screens and new documents">
            <Input name="displayName" required defaultValue={current.displayName} placeholder="e.g. Kaveri Foods" />
          </Field>
          {kind === "organization" && (
            <Field label="Trade name" optional>
              <Input name="tradeName" defaultValue={current.tradeName ?? ""} placeholder="e.g. Kaveri" />
            </Field>
          )}
        </FieldRow>
        {kind === "organization" && (
          <FieldRow>
            <Field label="Industry" optional>
              <Input name="industry" defaultValue={current.industry ?? ""} placeholder="e.g. Retail" />
            </Field>
            <Field label="Website" optional>
              <Input name="website" defaultValue={current.website ?? ""} placeholder="e.g. kaverifoods.in" />
            </Field>
          </FieldRow>
        )}
        <ErrorNotice error={error} />
        <div className="cluster">
          <Button type="submit" variant="secondary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </details>
  );
}

/** End (from today) or void one identifier, each behind the V1.3 confirm. */
export function IdentifierActions({
  partyId,
  identifier,
  word,
  onDone,
}: {
  partyId: string;
  identifier: { readonly id: string; readonly value: string; readonly validTo: string | null; readonly voidedAt: string | null };
  /** "PAN", "GSTIN": the identifier's type in words. */
  word: string;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (identifier.voidedAt !== null || identifier.validTo !== null) return null;
  const path = { params: { path: { partyId, identifierId: identifier.id } } };

  async function run(call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await call();
    setBusy(false);
    if (result.error !== undefined) {
      setError(apiError(result.error).message);
      return;
    }
    await onDone();
  }

  return (
    <div className="stack tight">
      <div className="cluster end">
        <ConfirmAction
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`End ${word} ${identifier.value}`}
          title={`End ${word} ${identifier.value}?`}
          confirmLabel="End it today"
          consequence={
            <p>
              It stops being in force from today ({longDay(browserDay())}) and no longer blocks the
              number on another client. Use this when it was cancelled, not when it was a typo.
            </p>
          }
          onConfirm={() =>
            void run(() =>
              api.POST("/api/v1/parties/{partyId}/identifiers/{identifierId}/end", {
                ...path,
                body: { validTo: browserDay() },
              }),
            )
          }
        >
          End
        </ConfirmAction>
        <ConfirmAction
          variant="destructive-quiet"
          size="sm"
          disabled={busy}
          aria-label={`Void ${word} ${identifier.value}`}
          title={`Void ${word} ${identifier.value}?`}
          confirmLabel="Void it"
          destructive
          consequence={
            <p>
              It was entered by mistake. It stays on the record as voided and cannot be used again
              here, and the number is free to add to the right client.
            </p>
          }
          onConfirm={() =>
            void run(() => api.POST("/api/v1/parties/{partyId}/identifiers/{identifierId}/void", path))
          }
        >
          Void
        </ConfirmAction>
      </div>
      <ErrorNotice error={error} />
    </div>
  );
}

/** Correct a registered company's country, kind or year end (Q076: the year
 *  end is required outside India and fixed at 31 March inside it). */
export function CorrectEntity({
  partyId,
  current,
  onSaved,
}: {
  partyId: string;
  current: { readonly jurisdiction: string; readonly entityType: string; readonly financialYearEnd: string | null };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState(current.jurisdiction);

  async function save(form: FormData): Promise<void> {
    const jurisdiction = String(form.get("jurisdiction") ?? "");
    const entityType = String(form.get("entityType") ?? "").trim();
    const yearEnd = String(form.get("financialYearEnd") ?? "");
    const body: { jurisdiction?: string; entityType?: string; financialYearEnd?: string } = {};
    if (jurisdiction !== current.jurisdiction) body.jurisdiction = jurisdiction;
    if (entityType !== current.entityType) body.entityType = entityType;
    if (jurisdiction !== "IN" && yearEnd !== "" && yearEnd !== current.financialYearEnd) body.financialYearEnd = yearEnd;
    if (Object.keys(body).length === 0) {
      setError("Nothing changed.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.PATCH("/api/v1/parties/{partyId}/legal-entity", {
      params: { path: { partyId } },
      body,
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await onSaved();
  }

  return (
    <details className="card-foot">
      <summary>Correct the country, kind or year end</summary>
      <form
        className="stack"
        onSubmit={(event) => keepTyped(event, (form) => {
          void save(form);
        })}
      >
        <FieldRow>
          <Field label="Country">
            <CountrySelect
              name="jurisdiction"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
              }}
            />
          </Field>
          <Field label="Kind of company">
            <EntityKindSelect name="entityType" required defaultValue={current.entityType} />
          </Field>
          <YearEndField country={country} defaultValue={current.financialYearEnd} />
        </FieldRow>
        <ErrorNotice error={error} />
        <div className="cluster">
          <Button type="submit" variant="secondary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </details>
  );
}

/** A client's billing address as the API holds it (0334). */
export interface BillingAddressValue {
  readonly lines: readonly string[];
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
}

/**
 * WHERE THE CLIENT IS BILLED (audit 2026-10-03, CA#22). Clients had no address
 * anywhere, so an invoice's "Billed to" printed a name and nothing else. Shown
 * as it prints, with a quiet form to change it; the next invoice issued prints
 * it, and an invoice already issued keeps the address it went out with.
 *
 * Submitted with `onSubmit`, not a form action, so a refusal leaves what was
 * typed in place.
 */
export function BillingAddressCard({
  partyId,
  current,
  canWrite,
  onSaved,
}: {
  partyId: string;
  current: BillingAddressValue | null;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(current?.country ?? "IN");
  const india = country === "IN";

  async function save(form: FormData): Promise<void> {
    const text = (k: string): string => String(form.get(k) ?? "").trim();
    const lines = text("lines")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    const empty = lines.length === 0 && text("region") === "" && text("postalCode") === "";
    const body = {
      billingAddress: empty
        ? null
        : {
            lines,
            region: text("region") === "" ? null : text("region"),
            postalCode: text("postalCode") === "" ? null : text("postalCode"),
            country: country === "" ? null : country,
          },
    };
    setBusy(true);
    setError(null);
    const result = await api.PATCH("/api/v1/parties/{partyId}", { params: { path: { partyId } }, body });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setOpen(false);
    await onSaved();
  }

  const place = current === null
    ? null
    : [[current.region, current.postalCode].filter((p): p is string => p !== null).join(" "), current.country === null ? null : countryName(current.country)]
        .filter((p): p is string => p !== null && p !== "")
        .join(", ");

  return (
    <Card>
      <CardTitle level={2}>Address for bills</CardTitle>
      {current === null ? (
        <p className="text-md text-muted">
          Not set. Invoices print the client&rsquo;s name only until it is added.
        </p>
      ) : (
        <address className="text-md not-italic">
          {current.lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
          {place !== null && place !== "" && <span className="block">{place}</span>}
        </address>
      )}
      <p className="text-sm text-muted">
        Printed under the client&rsquo;s name on invoices, with its tax number from Identifiers. An invoice
        already issued keeps the address it went out with.
      </p>
      {canWrite && (
        <details
          className="card-foot"
          open={open}
          onToggle={(e) => {
            setOpen(e.currentTarget.open);
          }}
        >
          <summary>{current === null ? "Add the address" : "Change the address"}</summary>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save(new FormData(e.currentTarget));
            }}
          >
            <Field label="Address" hint="One line per row, as it should print. Clear everything to remove it.">
              <Textarea
                name="lines"
                rows={3}
                defaultValue={(current?.lines ?? []).join("\n")}
                placeholder={"e.g. Plot 4, MIDC Bhosari\nPune"}
              />
            </Field>
            <FieldRow>
              <Field label={india ? "State" : "State or region"} optional>
                <Input name="region" maxLength={100} defaultValue={current?.region ?? ""} placeholder={india ? "e.g. Maharashtra" : "e.g. Dubai"} />
              </Field>
              <Field label={india ? "PIN code" : "Postal code"} optional>
                <Input name="postalCode" maxLength={20} defaultValue={current?.postalCode ?? ""} placeholder={india ? "e.g. 411026" : "e.g. 10001"} />
              </Field>
              <Field label="Country">
                <CountrySelect
                  name="country"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                  }}
                />
              </Field>
            </FieldRow>
            <ErrorNotice error={error} />
            <div className="cluster">
              <Button type="submit" variant="secondary" loading={busy}>
                Save the address
              </Button>
            </div>
          </form>
        </details>
      )}
    </Card>
  );
}
