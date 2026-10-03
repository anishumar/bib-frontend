"use client";

import { useState } from "react";
import { api, apiError } from "@/lib/api/client";
import { browserDay, longDay } from "@/lib/day";
import { Button, ErrorNotice, Field, FieldRow, Input } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { CountrySelect } from "@/components/country-select";
import { EntityKindSelect } from "@/components/entity-kind-select";

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
        action={(form) => {
          void save(form);
        }}
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

/** Correct a registered company's country or kind. */
export function CorrectEntity({
  partyId,
  current,
  onSaved,
}: {
  partyId: string;
  current: { readonly jurisdiction: string; readonly entityType: string };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(form: FormData): Promise<void> {
    const jurisdiction = String(form.get("jurisdiction") ?? "");
    const entityType = String(form.get("entityType") ?? "").trim();
    const body: { jurisdiction?: string; entityType?: string } = {};
    if (jurisdiction !== current.jurisdiction) body.jurisdiction = jurisdiction;
    if (entityType !== current.entityType) body.entityType = entityType;
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
      <summary>Correct the country or kind</summary>
      <form
        className="stack"
        action={(form) => {
          void save(form);
        }}
      >
        <FieldRow>
          <Field label="Country">
            <CountrySelect name="jurisdiction" defaultValue={current.jurisdiction} />
          </Field>
          <Field label="Kind of company">
            <EntityKindSelect name="entityType" required defaultValue={current.entityType} />
          </Field>
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
