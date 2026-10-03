"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError, codeLabel, formatCount } from "@/lib/api/client";
import type {
  AdvancePolicy,
  BillingSettings,
  ConfigEntry,
  FirmEntity,
  FirmEntityPreference,
  Readiness,
  StaffGrade,
  TaxDefault,
} from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Menu,
  MenuItem,
  Meta,
  MetaItem,
  Notice,
  NotSet,
  Select,
  Sub,
  Switch,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  AmountInput,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { longDay } from "@/lib/day";
import { ReadinessCard } from "@/lib/ui/readiness";
import { cleanAmount } from "@/lib/money";

/**
 * YOUR FIRM: the firm on paper, on one page (the Wave 4 brief, 2026-09-28).
 * It was two, "The firm itself" and "Our companies", and the first carried a
 * card for the fallback company that repeated the second. The user asked for
 * them merged: *"agr ye dono pages merge hojaye or simplified hojaye woh jada
 * better hai"*.
 *
 * Four things every firm sets once, and until these screens existed each was
 * reachable only through the API:
 *
 *   1. COMPANIES (T6.18): the firm's own legal entities, and which one quotes
 *      clients from which country. A new proposal's issuer defaults from that
 *      table and can be changed before sending (D4). Adding a company is ONE
 *      call (`POST /firm-entities`): the company, its country and its row in
 *      the table, in one transaction. A company's country does not move once
 *      recorded (JURISDICTION_FIXED), so Change offers it only to a company
 *      with none. A company stays the firm's with no country routed to it
 *      (0313), so any row can be given to any company.
 *   2. SIGNING: one signatory for the whole firm, printed on every letter.
 *      Nobody named means no letter can be sent.
 *   3. DEADLINES: from which day deadlines count (`missedFromOn`) and when the
 *      financial year starts. A firm onboarding four hundred clients would
 *      otherwise open to hundreds of MISSED rows on its first morning, and
 *      quarterly and annual services spawn nothing until the month is set.
 *      Published in the same act: a draft floor governs nothing.
 *   4. THE DISCOUNT LIMIT, moved here from the Catalogue: what anybody may
 *      take off without `proposal:approve`. The API reads it LIVE and a firm
 *      with no PUBLISHED limit has a limit of ZERO, so it is published in the
 *      same act too. (The Catalogue's card saved a draft and left it, so a
 *      limit set there never took effect.)
 *
 * The reasoning lives here and in CLAUDE.md, not on the screen: each section
 * says what is set and offers the change, in as few words as it can.
 */

interface Signatory {
  readonly userId: string;
  readonly displayName: string | null;
  readonly title: string;
}

interface Colleague {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
}

interface Policy {
  readonly version: number;
  readonly missedFromOn: string | null;
  readonly fiscalYearStartMonth: number | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The published entry `key` off a registry list, or null when the firm has
 *  never published one, which is a real state, not an error. */
function published(entries: readonly ConfigEntry[], key: string): ConfigEntry | null {
  const entry = entries.find((e) => e.entry.key === key);
  return entry === undefined || entry.published === null ? null : entry;
}

function policyOf(entries: readonly ConfigEntry[]): Policy | null {
  const entry = published(entries, "default");
  if (entry?.published == null) return null;
  const body = entry.published.body as Record<string, unknown>;
  const floor = body["missedFromOn"];
  const month = body["fiscalYearStartMonth"];
  return {
    version: entry.published.version,
    missedFromOn: typeof floor === "string" ? floor : null,
    fiscalYearStartMonth: typeof month === "number" ? month : null,
  };
}

/** Define-then-publish on a firm that has no entry, or draft-then-publish the
 *  next version on one that has. Both registry rows here (the compliance
 *  policy and the discount limit) only govern once PUBLISHED, so a screen
 *  that stopped at the draft would look set while nothing read it. */
async function publishConfig(
  kind: "compliance_policy" | "policy",
  key: string,
  exists: boolean,
  body: Record<string, unknown>,
): Promise<{ error?: unknown }> {
  if (!exists) {
    const defined = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind } },
      body: { key, body },
    });
    if (defined.error) return defined;
    return api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind, key, version: 1 } },
    });
  }
  const drafted = await api.POST("/api/v1/config/{kind}/{key}/versions", {
    params: { path: { kind, key } },
    body: { body },
  });
  const version = drafted.data?.version;
  if (drafted.error || version === undefined) return drafted;
  return api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
    params: { path: { kind, key, version } },
  });
}

export default function FirmPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<FirmEntity[]>([]);
  const [preferences, setPreferences] = useState<FirmEntityPreference[]>([]);
  const [signatory, setSignatory] = useState<Signatory | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyExists, setPolicyExists] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [limitExists, setLimitExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FirmEntity | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  /** The firm's billing settings (0318; 0322); null when the read was refused. */
  const [billing, setBilling] = useState<BillingSettings | null>(null);
  /** The firm's grades, for which one counts as the partner (0322). */
  const [grades, setGrades] = useState<StaffGrade[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const [list, prefs, sig, roster, compliance, policies, ready, billed, ladder] = await Promise.all([
      api.GET("/api/v1/firm-entities", {}),
      api.GET("/api/v1/firm-entities/preferences", {}),
      api.GET("/api/v1/tenancy/firm-signatory", {}),
      api.GET("/api/v1/tenancy/members", {}),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "compliance_policy" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "policy" } } }),
      // Setup readiness (V2.6), read with the rest so a save here that fixes a
      // gap turns its line done in the same reload.
      api.GET("/api/v1/tenancy/readiness", {}),
      api.GET("/api/v1/billing/settings", {}),
      api.GET("/api/v1/tenancy/grades", {}),
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
    setEntities(list.data.entities);
    setPreferences(prefs.data?.preferences ?? []);
    setSignatory(sig.data?.signatory ?? null);
    setColleagues(
      (roster.data?.members ?? [])
        .filter((m) => m.membership.audience === "STAFF" && m.membership.isActive)
        .map((m) => ({ userId: m.membership.userId, displayName: m.displayName, email: m.email })),
    );
    const complianceEntries = compliance.data?.entries ?? [];
    setPolicy(policyOf(complianceEntries));
    setPolicyExists(complianceEntries.some((e) => e.entry.key === "default"));
    const policyEntries = policies.data?.entries ?? [];
    const discount = published(policyEntries, "discount");
    const max = discount?.published?.body["maxDiscountPercent"];
    setLimit(max === undefined || max === null ? null : String(max));
    setLimitExists(policyEntries.some((e) => e.entry.key === "discount"));
    setReadiness(ready.data ?? null);
    setBilling(billed.data ?? null);
    setGrades(ladder.data?.grades ?? []);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write goes through here: one busy flag, the API's refusal shown
   *  word for word, and a reload so every section agrees. Cleared BEFORE the
   *  call, so a second press says what IT did. */
  async function act(
    key: string,
    call: () => Promise<{ error?: unknown }>,
    done: string,
  ): Promise<boolean> {
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
    setNotice(done);
    setBusy(null);
    return true;
  }

  if (!loaded) return <Loading label="Loading your firm" />;

  return (
    <Page>
      <PageHeader title="Your firm" />
      <ErrorNotice error={error} />
      {notice !== null && <Notice tone="ok">{notice}</Notice>}

      {readiness !== null && <ReadinessCard readiness={readiness} />}

      <Card id="companies">
        <CardHead
          level={2}
          title="Companies"
          aside={
            <Button
              onClick={() => {
                setError(null);
                setNotice(null);
                setAdding(true);
              }}
            >
              Add a company
            </Button>
          }
        />
        <CompanyTable
          entities={entities}
          onEdit={(e) => {
            setError(null);
            setNotice(null);
            setEditing(e);
          }}
        />
        <Routing
          entities={entities}
          preferences={preferences}
          busy={busy}
          onSet={(country, entity) =>
            act(
              `route:${country}`,
              () =>
                api.POST("/api/v1/firm-entities/preferences", {
                  body: { clientJurisdiction: country, firmEntityPartyId: entity.partyId },
                }),
              country === "*"
                ? `Every other country is now quoted by ${entity.name}.`
                : `Clients in ${countryName(country)} are now quoted by ${entity.name}.`,
            )
          }
        />
      </Card>

      <SigningCard
        signatory={signatory}
        colleagues={colleagues}
        busy={busy === "signatory"}
        onName={(userId, title) =>
          act(
            "signatory",
            () => api.PUT("/api/v1/tenancy/firm-signatory", { body: { userId, title } }),
            "Signatory saved. New letters carry this name.",
          )
        }
      />

      <DeadlinesCard
        policy={policy}
        busy={busy === "policy"}
        onSave={(body) =>
          act(
            "policy",
            () => publishConfig("compliance_policy", "default", policyExists, body),
            "Deadlines saved.",
          )
        }
      />

      {billing !== null && (
        <BillingCard
          settings={billing}
          entities={entities}
          grades={grades}
          busy={busy}
          onSet={(on) =>
            act(
              "billing",
              () => api.PUT("/api/v1/billing/settings", { body: { autoBilling: on } }),
              on
                ? "Automatic billing is on. Bills appear under Invoices, To raise."
                : "Automatic billing is off. No new bills are made.",
            )
          }
          onPolicy={(advancePolicy) =>
            act(
              "advance-policy",
              () => api.PUT("/api/v1/billing/settings", { body: { advancePolicy } }),
              "Advance reminders saved.",
            )
          }
          onTaxRates={(taxDefaults) =>
            act(
              "tax-rates",
              () => api.PUT("/api/v1/billing/settings", { body: { taxDefaults } }),
              "Tax rates saved. New advance drafts use them.",
            )
          }
          onDueDays={(invoiceDueDays) =>
            act(
              "due-days",
              () => api.PUT("/api/v1/billing/settings", { body: { invoiceDueDays } }),
              invoiceDueDays === null
                ? "Payment terms cleared. An invoice gets a due date only when one is typed."
                : `Payment terms saved. An invoice issued with no due date is due ${dueDaysWords(invoiceDueDays)}.`,
            )
          }
        />
      )}

      <DiscountCard
        limit={limit}
        busy={busy === "discount"}
        onSave={(max) =>
          act(
            "discount",
            () => publishConfig("policy", "discount", limitExists, { maxDiscountPercent: max }),
            `Discounts up to ${max}% no longer need sign-off.`,
          )
        }
      />

      {adding && (
        <AddCompany
          entities={entities}
          busy={busy === "add"}
          onClose={() => setAdding(false)}
          onAdd={async (body) => {
            const ok = await act(
              "add",
              () => api.POST("/api/v1/firm-entities", { body }),
              `${body.name} is added. New clients in ${countryName(body.jurisdiction)} are quoted by it.`,
            );
            if (ok) setAdding(false);
          }}
        />
      )}

      {editing !== null && (
        <EditCompany
          key={editing.partyId}
          entity={editing}
          busy={busy === "edit"}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await act(
              "edit",
              () =>
                api.PATCH("/api/v1/firm-entities/{entityPartyId}", {
                  params: { path: { entityPartyId: editing.partyId } },
                  body,
                }),
              `${body.name ?? editing.name} is saved.`,
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

// ── Companies ───────────────────────────────────────────────────────────────

function CompanyTable({
  entities,
  onEdit,
}: {
  entities: readonly FirmEntity[];
  onEdit: (entity: FirmEntity) => void;
}) {
  const router = useRouter();
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Registered in</Th>
            <Th>Documents in</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => (
            <tr key={e.partyId}>
              <Td>
                <strong>{e.name}</strong>
                {/* The firm's own words for it, as typed ("Private Limited"). */}
                {e.entityType !== null && <Sub>{codeLabel(e.entityType)}</Sub>}
              </Td>
              <Td>{e.jurisdiction === null ? <NotSet /> : countryName(e.jurisdiction)}</Td>
              {/* The currency a document this company issues STARTS in (D1),
                  from the API's one copy of that table. */}
              <Td>{e.defaultCurrency}</Td>
              <Td align="right">
                <div className="cluster" style={{ justifyContent: "flex-end" }}>
                  <Button variant="secondary" size="sm" aria-label={`Change ${e.name}`} onClick={() => onEdit(e)}>
                    Change
                  </Button>
                  {/* The company's own logo and wording live on their own
                      screens; these jump straight to its part of each. */}
                  <Menu
                    trigger={
                      <span className="btn" data-variant="ghost" data-size="sm" aria-label={`More for ${e.name}`}>
                        More
                      </span>
                    }
                  >
                    <MenuItem onClick={() => router.push(`/admin/brand#brand-entity-${e.partyId}`)}>
                      Logo and signature
                    </MenuItem>
                    <MenuItem onClick={() => router.push(`/admin/document-blocks?company=${e.partyId}`)}>
                      Standard wording
                    </MenuItem>
                  </Menu>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** The address as the firm typed it: one printed line per row, blank rows
 *  dropped. Stored now, not printed yet (D15). */
function linesOf(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

interface NewCompany {
  name: string;
  jurisdiction: string;
  entityType: string;
  registeredAddress?: { lines: string[] };
}

function AddCompany({
  entities,
  busy,
  onClose,
  onAdd,
}: {
  entities: readonly FirmEntity[];
  busy: boolean;
  onClose: () => void;
  onAdd: (body: NewCompany) => Promise<void>;
}) {
  const formId = useId();
  const [country, setCountry] = useState("");
  // Said BEFORE the press, not after the refusal: each country has one company
  // here, and adding a second would move every future client there without
  // anybody deciding it (COUNTRY_ALREADY_SERVED).
  const served =
    country === "" ? null : (entities.find((e) => e.routedCountries.includes(country)) ?? null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = linesOf(form.get("address"));
    void onAdd({
      name: String(form.get("name") ?? "").trim(),
      jurisdiction: country,
      entityType: String(form.get("entityType") ?? "").trim(),
      ...(lines.length === 0 ? {} : { registeredAddress: { lines } }),
    });
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Add a company"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={served !== null}>
            Add the company
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <FieldStack>
          <FieldRow>
            <Field label="Legal name" hint="As it prints on a document.">
              <Input name="name" required maxLength={300} autoComplete="off" autoFocus placeholder="e.g. 10x Global FZCO" />
            </Field>
            <Field label="Registered in">
              <CountrySelect
                name="jurisdiction"
                blankLabel="Choose a country"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </Field>
            <Field label="Kind of company">
              <Input name="entityType" required maxLength={100} autoComplete="off" placeholder="e.g. Private Limited, FZE, Inc." />
            </Field>
          </FieldRow>
          <Field label="Registered address" optional hint="One line per row. Not printed on documents yet.">
            <Textarea name="address" rows={3} placeholder="e.g. Office 12, Dubai Silicon Oasis" />
          </Field>
          {served !== null && (
            <Notice tone="warn">
              <p>
                {served.name} already quotes clients from {countryName(country)}. To change that,
                pick another company for {countryName(country)} in the country table.
              </p>
            </Notice>
          )}
        </FieldStack>
      </form>
    </Dialog>
  );
}

interface CompanyChange {
  name?: string;
  entityType?: string;
  jurisdiction?: string;
  registeredAddress?: { lines: string[] } | null;
}

function EditCompany({
  entity,
  busy,
  onClose,
  onSave,
}: {
  entity: FirmEntity;
  busy: boolean;
  onClose: () => void;
  onSave: (body: CompanyChange) => Promise<void>;
}) {
  const formId = useId();
  // Only a company with NO country recorded may be given one; a recorded one
  // does not move. Until a country is chosen the API takes no type and no
  // address either, so those two wait for it rather than failing on Save.
  const needsCountry = entity.jurisdiction === null;
  const [country, setCountry] = useState("");
  const waiting = needsCountry && country === "";
  const [unchanged, setUnchanged] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const entityType = String(form.get("entityType") ?? "").trim();
    const lines = linesOf(form.get("address"));
    const before = entity.registeredAddress?.lines ?? [];

    // Only what CHANGED is sent. Sending all three every time would record an
    // edit on the company's history that changed nothing.
    const body: CompanyChange = {};
    if (name !== entity.name) body.name = name;
    if (needsCountry) {
      if (country !== "") {
        body.jurisdiction = country;
        body.entityType = entityType;
        if (lines.length > 0) body.registeredAddress = { lines };
      }
    } else {
      if (entityType !== (entity.entityType ?? "")) body.entityType = entityType;
      if (lines.join("\n") !== before.join("\n")) {
        body.registeredAddress = lines.length === 0 ? null : { lines };
      }
    }
    if (Object.keys(body).length === 0) {
      setUnchanged(true);
      return;
    }
    void onSave(body);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change ${entity.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} onChange={() => setUnchanged(false)}>
        <FieldStack>
          <Field label="Legal name">
            <Input name="name" required maxLength={300} defaultValue={entity.name} />
          </Field>
          {needsCountry ? (
            <Field label="Registered in" hint="Set once. It cannot be changed later.">
              <CountrySelect
                name="jurisdiction"
                blankLabel="Not recorded yet"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </Field>
          ) : (
            <Meta layout="list">
              <MetaItem label="Registered in">{countryName(entity.jurisdiction ?? "")}</MetaItem>
            </Meta>
          )}
          <Field label="Kind of company" hint={waiting ? "Choose the country first." : undefined}>
            <Input
              name="entityType"
              maxLength={100}
              required={!waiting}
              disabled={waiting}
              defaultValue={entity.entityType ?? ""}
              placeholder="e.g. Private Limited"
            />
          </Field>
          <Field label="Registered address" optional hint="One line per row. Clear it to remove it.">
            <Textarea
              name="address"
              rows={4}
              disabled={waiting}
              defaultValue={(entity.registeredAddress?.lines ?? []).join("\n")}
            />
          </Field>
          {unchanged && (
            <p className="field-hint" role="status">
              Nothing has changed yet.
            </p>
          )}
        </FieldStack>
      </form>
    </Dialog>
  );
}

// ── Which company quotes which country ─────────────────────────────────────

function Routing({
  entities,
  preferences,
  busy,
  onSet,
}: {
  entities: readonly FirmEntity[];
  preferences: readonly FirmEntityPreference[];
  busy: string | null;
  onSet: (country: string, entity: FirmEntity) => Promise<boolean>;
}) {
  const [newCountry, setNewCountry] = useState("");
  const [newCompany, setNewCompany] = useState("");
  // Focus goes back to the select that changed once the reload has landed:
  // it is disabled while the write runs, and a disabled control loses focus.
  const restoreTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (busy !== null) return;
    const node = restoreTo.current;
    restoreTo.current = null;
    node?.focus();
  }, [busy]);

  // Countries by NAME, and "Everywhere else" last: it answers for whatever
  // the rows above it do not.
  const rows = [...preferences].sort((a, b) => {
    if (a.clientJurisdiction === "*") return 1;
    if (b.clientJurisdiction === "*") return -1;
    return countryName(a.clientJurisdiction).localeCompare(countryName(b.clientJurisdiction));
  });
  const byId = (id: string): FirmEntity | undefined => entities.find((e) => e.partyId === id);
  const already = rows.find((r) => r.clientJurisdiction === newCountry) ?? null;

  return (
    <>
      <CardTitle className="card-part">Who quotes which country</CardTitle>
      {/* A pick SAVES: the row's select reads as its value, and choosing
          another company is the act. There is no delete behind this table, so
          none is offered: a country is pointed at another company instead. */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Clients from</Th>
              <Th>Quoted by</Th>
              <Th>Documents in</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const country = r.clientJurisdiction;
              const label = country === "*" ? "Everywhere else" : countryName(country);
              return (
                <tr key={r.id}>
                  <Td>
                    {country === "*" ? (
                      <>
                        <strong>Everywhere else</strong>
                        <Sub>Any country not listed</Sub>
                      </>
                    ) : (
                      label
                    )}
                  </Td>
                  <Td>
                    <Select
                      variant="quiet"
                      aria-label={`Company that quotes clients from ${label}`}
                      value={r.firmEntityPartyId}
                      disabled={busy !== null}
                      onChange={(e) => {
                        const entity = byId(e.target.value);
                        if (entity === undefined) return;
                        restoreTo.current = e.currentTarget;
                        void onSet(country, entity);
                      }}
                    >
                      {entities.map((e) => (
                        <option key={e.partyId} value={e.partyId}>
                          {e.name}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>{byId(r.firmEntityPartyId)?.defaultCurrency ?? <NotSet />}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      <form
        className="card-part"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const entity = byId(newCompany);
            if (newCountry === "" || entity === undefined) return;
            const ok = await onSet(newCountry, entity);
            if (ok) {
              setNewCountry("");
              setNewCompany("");
            }
          })();
        }}
      >
        <fieldset className="fieldset" aria-label="Add a country">
          <FieldRow>
            <Field label="Add a country">
              <CountrySelect
                name="clientJurisdiction"
                blankLabel="Choose a country"
                required
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
              />
            </Field>
            <Field label="Quoted by">
              <Select
                name="firmEntityPartyId"
                required
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
              >
                <option value="" disabled>
                  Choose a company
                </option>
                {entities.map((e) => (
                  <option key={e.partyId} value={e.partyId}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="field-action">
              <Button type="submit" variant="secondary" loading={busy === `route:${newCountry}`}>
                Add
              </Button>
            </div>
          </FieldRow>
          {already !== null && (
            <p className="field-hint" role="status">
              Already listed. Adding it again moves it to the company you pick.
            </p>
          )}
        </fieldset>
      </form>
    </>
  );
}

// ── Signing ─────────────────────────────────────────────────────────────────

/** A section whose value is set once and changed rarely. Set: the value,
 *  and a Change that swaps it for the form (with a Cancel). Not set: the form
 *  straight away, because there is nothing to read, only something to do,
 *  and a "Not set" line over an empty form says the same thing twice. */
function SetOnce({
  id,
  title,
  isSet,
  view,
  form,
  nested = false,
}: {
  /** An anchor another screen can link to (`/admin/firm#deadlines`). */
  id?: string;
  title: string;
  isSet: boolean;
  view: ReactNode;
  form: (close: (() => void) | null) => ReactNode;
  /** A part of another card (a rule above, an h3), not a card of its own. */
  nested?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const changing = isSet && open;
  const head = (
    <CardHead
      level={nested ? 3 : 2}
      title={title}
      aside={
        isSet && !open ? (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-label={`Change ${title.toLowerCase()}`}>
            Change
          </Button>
        ) : undefined
      }
    />
  );
  const body = isSet && !open ? view : form(changing ? () => setOpen(false) : null);
  if (nested) {
    return (
      <div className="card-foot" {...(id === undefined ? {} : { id })}>
        {head}
        {body}
      </div>
    );
  }
  return (
    <Card {...(id === undefined ? {} : { id })}>
      {head}
      {body}
    </Card>
  );
}

/** The form's buttons: Save, and Cancel while changing a value that is set. */
function SaveCancel({ busy, close }: { busy: boolean; close: (() => void) | null }) {
  return (
    <div className="field-action cluster">
      <Button type="submit" variant="secondary" loading={busy}>
        Save
      </Button>
      {close !== null && (
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      )}
    </div>
  );
}

function SigningCard({
  signatory,
  colleagues,
  busy,
  onName,
}: {
  signatory: Signatory | null;
  colleagues: readonly Colleague[];
  busy: boolean;
  onName: (userId: string, title: string) => Promise<boolean>;
}) {
  const current = signatory === null ? null : (colleagues.find((c) => c.userId === signatory.userId) ?? null);
  return (
    <SetOnce
      title="Signing"
      isSet={signatory !== null}
      view={
        <Meta layout="list">
          <MetaItem label="Signs your letters">
            {signatory === null ? (
              <NotSet />
            ) : (
              `${signatory.displayName ?? current?.email ?? signatory.userId}, ${signatory.title}`
            )}
          </MetaItem>
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void (async () => {
              const ok = await onName(String(form.get("userId") ?? ""), String(form.get("title") ?? "").trim());
              if (ok) close?.();
            })();
          }}
        >
          <FieldRow>
            <Field label="Who" hint={signatory === null ? "No letter can be sent until someone is named." : undefined}>
              <Select name="userId" required defaultValue={signatory?.userId ?? ""}>
                <option value="" disabled>
                  Choose a colleague
                </option>
                {colleagues.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.displayName ?? c.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Signs as" hint="Printed under the signature.">
              <Input name="title" required defaultValue={signatory?.title ?? ""} placeholder="e.g. Managing Partner" />
            </Field>
            <SaveCancel busy={busy} close={close} />
          </FieldRow>
        </form>
      )}
    />
  );
}

// ── Deadlines ───────────────────────────────────────────────────────────────

function DeadlinesCard({
  policy,
  busy,
  onSave,
}: {
  policy: Policy | null;
  busy: boolean;
  onSave: (body: { missedFromOn: string | null; fiscalYearStartMonth: number | null }) => Promise<boolean>;
}) {
  const isSet = policy !== null && (policy.missedFromOn !== null || policy.fiscalYearStartMonth !== null);
  return (
    <SetOnce
      id="deadlines"
      title="Deadlines"
      isSet={isSet}
      view={
        <Meta>
          <MetaItem label="Count from">
            {policy?.missedFromOn == null ? <NotSet /> : longDay(policy.missedFromOn)}
          </MetaItem>
          <MetaItem label="Financial year starts">
            {policy?.fiscalYearStartMonth == null ? <NotSet /> : MONTHS[policy.fiscalYearStartMonth - 1]}
          </MetaItem>
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const floor = String(form.get("missedFromOn") ?? "").trim();
            const month = Number(form.get("fiscalYearStartMonth") ?? 0);
            void (async () => {
              const ok = await onSave({
                missedFromOn: floor === "" ? null : floor,
                fiscalYearStartMonth: month >= 1 && month <= 12 ? month : null,
              });
              if (ok) close?.();
            })();
          }}
        >
          <FieldRow>
            <Field label="Count from" optional hint="The day you started on BiB. Older deadlines are skipped.">
              <Input name="missedFromOn" type="date" defaultValue={policy?.missedFromOn ?? ""} />
            </Field>
            <Field label="Financial year starts" hint="April for an Indian firm.">
              <Select name="fiscalYearStartMonth" defaultValue={String(policy?.fiscalYearStartMonth ?? 0)}>
                <option value="0">Not set</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <SaveCancel busy={busy} close={close} />
          </FieldRow>
        </form>
      )}
    />
  );
}

// ── Automatic billing ──────────────────────────────────────────────────────

/**
 * THE FIRM'S BILLING SWITCH (auto-invoice, 0318). On, the daily sweep writes a
 * bill for every period that has fallen due on an engagement with billing set
 * up; the manager raises the invoice from it under Invoices, To raise. Off (the
 * default), nothing is written. There is no firm-wide go-live date (Ashish,
 * 2026-10-01): each engagement starts from its own "Bill from", so turning this
 * on bills no old month nobody chose. It saves as it is switched, like the
 * country table above; a quarter or a year needs the financial year, set in
 * Deadlines.
 *
 * And, since 0322, how ADVANCES are chased and taxed. Signing drafts the
 * advance invoice and starts the work (Ashish, 2026-10-02); the SPOC, the Key
 * Manager and the partner above them are reminded on My day, and the admins get
 * a weekly summary. Every number is the firm's own (the first firm's answers
 * are the defaults): when a draft and an unpaid advance turn Overdue, which
 * grade counts as the partner, and the summary's day and hour in the firm's
 * zone. An automatic draft needs a tax rate: the last rate on that work, else
 * the issuing company's default below; with neither, no draft is made and the
 * advance waits under To raise. Both blocks save with a partial PUT, so one
 * never overwrites the other.
 */
function BillingCard({
  settings,
  entities,
  grades,
  busy,
  onSet,
  onPolicy,
  onTaxRates,
  onDueDays,
}: {
  settings: BillingSettings;
  entities: readonly FirmEntity[];
  grades: readonly StaffGrade[];
  busy: string | null;
  onSet: (on: boolean) => Promise<boolean>;
  onPolicy: (policy: AdvancePolicy) => Promise<boolean>;
  onTaxRates: (rates: TaxDefault[]) => Promise<boolean>;
  onDueDays: (days: number | null) => Promise<boolean>;
}) {
  return (
    <Card id="billing">
      <CardHead level={2} title="Automatic billing" />
      <Switch
        label="Make a bill when each period falls due"
        checked={settings.autoBilling}
        disabled={busy === "billing"}
        onChange={(event) => {
          void onSet(event.target.checked);
        }}
      />
      <p className="text-sm text-ink-2">
        Only for services with billing set up.{" "}
        <Link href={"/invoices?tab=setup" as Route}>See which are not</Link>
      </p>
      <AdvanceReminders
        policy={settings.advancePolicy}
        grades={grades}
        busy={busy === "advance-policy"}
        onSave={onPolicy}
      />
      <TaxRates
        rates={settings.taxDefaults}
        entities={entities}
        busy={busy === "tax-rates"}
        onSave={onTaxRates}
      />
      <PaymentTerms days={settings.invoiceDueDays} busy={busy === "due-days"} onSave={onDueDays} />
    </Card>
  );
}

/** "15 days after its date", "on the day it is issued". */
function dueDaysWords(days: number): string {
  if (days === 0) return "on the day it is issued";
  return `${String(days)} day${days === 1 ? "" : "s"} after its date`;
}

/**
 * THE FIRM'S OWN PAYMENT TERMS (B20, 0327). An invoice issued with no due
 * date is due this many days after its date; one typed on the invoice is
 * kept. No default, on purpose: 7, 15 or 30 days is the firm's commercial
 * fact, and an invoice with no due date is never chased by client reminders.
 */
function PaymentTerms({
  days,
  busy,
  onSave,
}: {
  days: number | null;
  busy: boolean;
  onSave: (days: number | null) => Promise<boolean>;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <SetOnce
      nested
      id="payment-terms"
      title="Payment terms"
      isSet={days !== null}
      view={
        <Meta layout="list">
          <MetaItem label="An invoice with no due date">
            {days === null ? <NotSet>Gets none, so it is never chased</NotSet> : `Is due ${dueDaysWords(days)}`}
          </MetaItem>
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const typed = String(new FormData(event.currentTarget).get("dueDays") ?? "").trim();
            if (typed !== "" && !/^\d{1,3}$/.test(typed)) {
              setProblem("Type a whole number of days, from 0 (due on receipt) to 365, or leave it empty.");
              return;
            }
            const next = typed === "" ? null : Number.parseInt(typed, 10);
            if (next !== null && next > 365) {
              setProblem("Payment terms can be at most 365 days.");
              return;
            }
            setProblem(null);
            void (async () => {
              const ok = await onSave(next);
              if (ok) close?.();
            })();
          }}
        >
          <FieldStack>
            <ErrorNotice error={problem} />
            <FieldRow>
              <Field
                label="Days from the invoice date"
                optional
                hint="Used when an invoice is issued with no due date. 0 means due on receipt. Leave empty for none."
              >
                <Input name="dueDays" inputMode="numeric" defaultValue={days === null ? "" : String(days)} placeholder="e.g. 15" />
              </Field>
              <SaveCancel busy={busy} close={close} />
            </FieldRow>
          </FieldStack>
        </form>
      )}
    />
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "10:00", "09:00": the summary's hour as a clock reads it. */
function hourWords(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** The firm's grades by rank, one option per rank ("Director / Partner" when
 *  two rungs share one), most senior last, retired rungs left out. */
function rankOptions(grades: readonly StaffGrade[]): { rank: number; label: string }[] {
  const byRank = new Map<number, string[]>();
  for (const g of grades) {
    if (!g.isActive) continue;
    byRank.set(g.rank, [...(byRank.get(g.rank) ?? []), g.name]);
  }
  return [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, names]) => ({ rank, label: names.join(" / ") }));
}

function AdvanceReminders({
  policy,
  grades,
  busy,
  onSave,
}: {
  policy: AdvancePolicy;
  grades: readonly StaffGrade[];
  busy: boolean;
  onSave: (policy: AdvancePolicy) => Promise<boolean>;
}) {
  const ranks = rankOptions(grades);
  const partner = ranks.find((r) => r.rank === policy.partnerMinRank);
  // A rank no active rung holds any more (the ladder changed): still shown, so
  // the select never silently reads as another grade.
  const options = partner === undefined ? [...ranks, { rank: policy.partnerMinRank, label: `Rank ${String(policy.partnerMinRank)}` }] : ranks;
  const days = (n: number): string => (n === 1 ? "1 day" : `${String(n)} days`);
  return (
    <SetOnce
      nested
      id="advance-reminders"
      title="Advance reminders"
      isSet
      view={
        <Meta>
          <MetaItem label="Draft overdue after">{days(policy.draftOverdueDays)}</MetaItem>
          <MetaItem label="Unpaid overdue after">{`${days(policy.unpaidOverdueDays)} from issue`}</MetaItem>
          <MetaItem label="Partner reminded">{`${partner?.label ?? `Rank ${String(policy.partnerMinRank)}`} or above`}</MetaItem>
          <MetaItem label="Weekly summary to admins">
            {`${WEEKDAYS[policy.digestWeekday - 1] ?? "Monday"}, ${hourWords(policy.digestHour)}`}
          </MetaItem>
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const whole = (name: string): number => Number(cleanAmount(String(form.get(name) ?? "")));
            void (async () => {
              const ok = await onSave({
                draftOverdueDays: whole("draftOverdueDays"),
                unpaidOverdueDays: whole("unpaidOverdueDays"),
                partnerMinRank: Number(form.get("partnerMinRank")),
                digestWeekday: Number(form.get("digestWeekday")),
                digestHour: Number(form.get("digestHour")),
              });
              if (ok) close?.();
            })();
          }}
        >
          <FieldStack>
            <FieldRow>
              <Field label="Draft overdue after (days)" hint="Counted from signing.">
                <AmountInput decimals={0} name="draftOverdueDays" required defaultValue={String(policy.draftOverdueDays)} />
              </Field>
              <Field label="Unpaid overdue after (days)" hint="Counted from issue.">
                <AmountInput decimals={0} name="unpaidOverdueDays" required defaultValue={String(policy.unpaidOverdueDays)} />
              </Field>
              <Field label="Partner reminded" hint="First one above the Key Manager at this grade or higher.">
                <Select name="partnerMinRank" defaultValue={String(policy.partnerMinRank)}>
                  {options.map((r) => (
                    <option key={r.rank} value={String(r.rank)}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Weekly summary on" hint="To every admin, in your firm's time zone.">
                <Select name="digestWeekday" defaultValue={String(policy.digestWeekday)}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={String(i + 1)}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="At">
                <Select name="digestHour" defaultValue={String(policy.digestHour)}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>
                      {hourWords(h)}
                    </option>
                  ))}
                </Select>
              </Field>
              <SaveCancel busy={busy} close={close} />
            </FieldRow>
          </FieldStack>
        </form>
      )}
    />
  );
}

/**
 * Each company's default tax rate (0322): what an automatic advance draft
 * carries when that work was never invoiced before. One box per company; a box
 * left empty sends nothing, and the API keeps a rate it is not sent (it cannot
 * be removed, only changed), so emptying a box that had one is refused here.
 */
function TaxRates({
  rates,
  entities,
  busy,
  onSave,
}: {
  rates: readonly TaxDefault[];
  entities: readonly FirmEntity[];
  busy: boolean;
  onSave: (rates: TaxDefault[]) => Promise<boolean>;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const rateOf = (partyId: string): string | null => rates.find((r) => r.entityPartyId === partyId)?.taxPercent ?? null;
  if (entities.length === 0) return null;
  return (
    <SetOnce
      nested
      id="tax-rates"
      title="Default tax rate"
      isSet={rates.length > 0}
      view={
        <Meta>
          {entities.map((e) => {
            const rate = rateOf(e.partyId);
            return (
              <MetaItem key={e.partyId} label={e.name}>
                {rate === null ? <NotSet /> : `${formatCount(rate)}%`}
              </MetaItem>
            );
          })}
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const out: TaxDefault[] = [];
            for (const e of entities) {
              const typed = cleanAmount(String(form.get(`rate-${e.partyId}`) ?? ""));
              if (typed === "") {
                if (rateOf(e.partyId) !== null) {
                  setProblem(`${e.name} has a rate. It can be changed, not removed.`);
                  return;
                }
                continue;
              }
              out.push({ entityPartyId: e.partyId, taxPercent: typed });
            }
            setProblem(null);
            void (async () => {
              const ok = await onSave(out);
              if (ok) close?.();
            })();
          }}
        >
          <FieldStack>
            <ErrorNotice error={problem} />
            <FieldRow>
              {entities.map((e) => (
                <Field key={e.partyId} label={`${e.name} (%)`} optional={rateOf(e.partyId) === null}>
                  <AmountInput
                    decimals={4}
                    name={`rate-${e.partyId}`}
                    defaultValue={rateOf(e.partyId) === null ? "" : formatCount(rateOf(e.partyId) ?? "")}
                    placeholder="e.g. 18"
                  />
                </Field>
              ))}
              <SaveCancel busy={busy} close={close} />
            </FieldRow>
          </FieldStack>
        </form>
      )}
    />
  );
}


// ── The discount limit ─────────────────────────────────────────────────────

function DiscountCard({
  limit,
  busy,
  onSave,
}: {
  limit: string | null;
  busy: boolean;
  onSave: (max: string) => Promise<boolean>;
}) {
  return (
    <SetOnce
      title="Discount limit"
      isSet={limit !== null}
      view={
        <Meta layout="list">
          <MetaItem label="Without sign-off">
            {limit === null ? <NotSet /> : `Up to ${limit}% off`}
          </MetaItem>
        </Meta>
      }
      form={(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void (async () => {
              const ok = await onSave(cleanAmount(String(form.get("maxDiscountPercent") ?? "")));
              if (ok) close?.();
            })();
          }}
        >
          <FieldRow>
            <Field
              label="Most off without sign-off (%)"
              hint={
                limit === null
                  ? "Until this is set, every discount needs sign-off."
                  : "Above this, someone who approves proposals signs off."
              }
            >
              <AmountInput decimals={4}
                name="maxDiscountPercent"
                required
                defaultValue={limit ?? ""}
                placeholder="e.g. 15"
              />
            </Field>
            <SaveCancel busy={busy} close={close} />
          </FieldRow>
        </form>
      )}
    />
  );
}
