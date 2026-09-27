"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { FirmEntity, FirmEntityPreference } from "@/lib/api/client";
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
  NotStated,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";

/**
 * OUR COMPANIES (T6.18): the firm's own legal entities, the ones its proposals,
 * engagement letters and invoices are issued from.
 *
 * 10x Global has four (India, UAE, Singapore, US), and until this screen a
 * second one could only be made by a script: three calls to three routes, any
 * of which a browser could stop half way, leaving an organization with no
 * country sitting in the CLIENT list. Adding one is now ONE form and ONE call
 * (`POST /firm-entities`), which creates the company, registers it in its
 * country and makes it the company for clients there, in one transaction.
 *
 * THE ROUTING TABLE IS THE SECOND HALF, and it is the question a partner
 * actually asks: "who quotes a client in Singapore?". It is the firm's
 * `firm_entity_preference` rule, one row per country plus the fallback row
 * (`*`, "Everywhere else"). A new proposal's issuer defaults from it and can
 * always be changed before sending (D4). There is no delete behind it, so the
 * screen offers none: a country is pointed at another company instead.
 *
 * A company's COUNTRY DOES NOT MOVE once recorded (the API refuses with
 * JURISDICTION_FIXED): its documents, governing law and currency follow from
 * it. So the edit dialog offers the country only to a company that has none,
 * which is every firm's seeded company until somebody records it.
 */
export default function CompaniesPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<FirmEntity[]>([]);
  const [preferences, setPreferences] = useState<FirmEntityPreference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<FirmEntity | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [list, prefs] = await Promise.all([
      api.GET("/api/v1/firm-entities", {}),
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
    setEntities(list.data.entities);
    setPreferences(prefs.data?.preferences ?? []);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write goes through here: one busy flag, the API's refusal shown
   *  word for word, and a reload so the list and the table agree. Cleared
   *  BEFORE the call, so a second press says what IT did. */
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

  if (!loaded) return <Loading label="Loading your companies" />;

  const fallback = entities.find((e) => e.isFallback) ?? null;

  return (
    <Page>
      <PageHeader
        eyebrow="The firm"
        title="Our companies"
        lede="The companies your firm issues its proposals, engagement letters and invoices from.
        A client is quoted by the company for their country. You can still pick a different
        company on any proposal before it is sent."
      />
      <ErrorNotice error={error} />
      {notice !== null && <Notice tone="ok">{notice}</Notice>}

      <CompanyList
        entities={entities}
        fallback={fallback}
        onEdit={(e) => {
          setError(null);
          setNotice(null);
          setEditing(e);
        }}
      />

      <AddCompany
        entities={entities}
        busy={busy === "add"}
        onAdd={(body) =>
          act(
            "add",
            () => api.POST("/api/v1/firm-entities", { body }),
            `${body.name} is added. New clients in ${countryName(body.jurisdiction)} are quoted by it from now on.`,
          )
        }
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
              ? `Clients in every other country are now quoted by ${entity.name}.`
              : `Clients in ${countryName(country)} are now quoted by ${entity.name}.`,
          )
        }
      />

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

// ── The list ────────────────────────────────────────────────────────────────

function CompanyList({
  entities,
  fallback,
  onEdit,
}: {
  entities: readonly FirmEntity[];
  fallback: FirmEntity | null;
  onEdit: (entity: FirmEntity) => void;
}) {
  return (
    <Card>
      <CardHead
        title="Your companies"
        level={2}
        aside={<Pill tone="quiet">{entities.length}</Pill>}
      >
        <p className="lede">
          The <strong>Fallback</strong> company quotes clients from every country that has no
          company of its own in the table further down.
          {fallback === null ? " None is set yet." : ` Today that is ${fallback.name}.`}
        </p>
      </CardHead>
      {/* FOUR COLUMNS, and each second line wraps. `.table` is max-content
          wide, so every word in a cell sets the column: with "Registered in"
          as its own column, the address on one line and three links beside
          Change, the list was 150px wider than the card at 1280 and hid its
          currency and its buttons in the table's own scroll, which a
          page-level overflow probe cannot see. */}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Company</Th>
              <Th>Quotes clients from</Th>
              <Th>Documents in</Th>
              <Th>
                <span className="sr-only">Change</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => {
              const countries = e.routedCountries.filter((c) => c !== "*");
              const address = e.registeredAddress?.lines ?? [];
              return (
                <tr key={e.partyId}>
                  <Td>
                    <strong>{e.name}</strong>
                    <span className="sub">
                      {e.jurisdiction === null ? (
                        <NotStated>not registered in any country yet</NotStated>
                      ) : (
                        `${e.entityType ?? "Company"}, registered in ${countryName(e.jurisdiction)}`
                      )}
                    </span>
                    {address.length > 0 && (
                      <span className="sub" style={{ maxWidth: "44ch", whiteSpace: "normal" }}>
                        {address.join(", ")}
                      </span>
                    )}
                    <span className="sub">
                      <Link
                        href={`/admin/brand#brand-entity-${e.partyId}`}
                        aria-label={`Logo, signature and proposal cover of ${e.name}`}
                      >
                        Brand marks
                      </Link>
                      {" · "}
                      <Link
                        href={`/admin/document-blocks?company=${e.partyId}`}
                        aria-label={`Standard wording of ${e.name}`}
                      >
                        Standard wording
                      </Link>
                    </span>
                  </Td>
                  <Td>
                    {countries.length === 0 && !e.isFallback ? (
                      <NotStated>no country yet</NotStated>
                    ) : (
                      <span className="cluster" style={{ maxWidth: "32ch" }}>
                        {countries.length > 0 && (
                          <span style={{ whiteSpace: "normal" }}>
                            {countries.map(countryName).sort().join(", ")}
                          </span>
                        )}
                        {e.isFallback && <Pill tone="neutral">Fallback</Pill>}
                      </span>
                    )}
                  </Td>
                  {/* The currency a document this company issues STARTS in (D1),
                      from the API's one copy of that table. */}
                  <Td className="mono">{e.defaultCurrency}</Td>
                  <Td align="right">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Change ${e.name}`}
                      onClick={() => onEdit(e)}
                    >
                      Change
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

// ── Adding one ──────────────────────────────────────────────────────────────

interface NewCompany {
  name: string;
  jurisdiction: string;
  entityType: string;
  registeredAddress?: { lines: string[] };
}

/** The address as the firm typed it: one printed line per row, blank rows
 *  dropped. Stored now, not printed yet (D15). */
function linesOf(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

function AddCompany({
  entities,
  busy,
  onAdd,
}: {
  entities: readonly FirmEntity[];
  busy: boolean;
  onAdd: (body: NewCompany) => Promise<boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [country, setCountry] = useState("");
  const addressHint = useId();
  // Said BEFORE the press, not after the refusal: each country has one company
  // here, and adding a second would move every future client there without
  // anybody deciding it (COUNTRY_ALREADY_SERVED).
  const served =
    country === "" ? null : (entities.find((e) => e.routedCountries.includes(country)) ?? null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = linesOf(form.get("address"));
    const ok = await onAdd({
      name: String(form.get("name") ?? "").trim(),
      jurisdiction: country,
      entityType: String(form.get("entityType") ?? "").trim(),
      ...(lines.length === 0 ? {} : { registeredAddress: { lines } }),
    });
    if (ok) {
      formRef.current?.reset();
      setCountry("");
    }
  }

  return (
    <Card>
      <CardHead title="Add a company" level={2}>
        <p className="lede">
          One of your firm&rsquo;s own companies, registered in a country. It becomes the company
          that quotes new clients from that country, and it gets its own tab for standard wording
          and its own logo and signature.
        </p>
      </CardHead>
      <form ref={formRef} onSubmit={(e) => void submit(e)}>
        <FieldStack>
          <FieldRow>
            <Field
              label="Legal name"
              hint="As it prints on a document, for example 10x Global FZCO."
            >
              <Input name="name" required maxLength={300} autoComplete="off" />
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
            <Field
              label="Kind of company"
              hint="In your own words: Private Limited, FZE, Pte. Ltd., Inc."
            >
              <Input name="entityType" required maxLength={100} autoComplete="off" />
            </Field>
          </FieldRow>
          <Field label="Registered address" optional>
            <Textarea name="address" rows={3} aria-describedby={addressHint} />
          </Field>
          <p className="field-hint" id={addressHint}>
            One line per row, as it should read, up to eight lines. It is kept on file and is not
            printed on documents yet.
          </p>
          {served !== null && (
            <Notice tone="warn">
              {served.name} already quotes clients from {countryName(country)}, and each country has
              one company here. To have clients there quoted by a different company, change the
              country in the table below instead.
            </Notice>
          )}
          <div className="cluster">
            <Button type="submit" loading={busy} disabled={served !== null}>
              Add the company
            </Button>
          </div>
        </FieldStack>
      </form>
    </Card>
  );
}

// ── Which company quotes clients from which country ───────────────────────

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
  /** A row's pick before Save. Absent means "what the firm has now". */
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [newCountry, setNewCountry] = useState("");
  const [newCompany, setNewCompany] = useState("");

  // Countries by NAME, and "Everywhere else" last: it answers for whatever
  // the rows above it do not.
  const rows = [...preferences].sort((a, b) => {
    if (a.clientJurisdiction === "*") return 1;
    if (b.clientJurisdiction === "*") return -1;
    return countryName(a.clientJurisdiction).localeCompare(countryName(b.clientJurisdiction));
  });
  const byId = (id: string): FirmEntity | undefined => entities.find((e) => e.partyId === id);
  const already = rows.find((r) => r.clientJurisdiction === newCountry) ?? null;

  /**
   * THE COMPANY A CHANGE WOULD STRAND, found by walking it (2026-09-28).
   *
   * A company is "the firm's" only while a row of this table names it (or it
   * is the firm itself): that is `crm.is_firm_entity`. So giving away a
   * company's LAST country does not just re-route clients, it takes the
   * company off Our companies, Brand, the Standard prose tabs and the
   * builder's "Issued by", and it can then no longer be picked here to be
   * given a country back. Measured: Singapore moved to the Gulf company, and
   * "EPB Asia Pte Ltd" vanished from every list.
   *
   * So the move is not offered, and the reason is said before any press. The
   * firm can still have the Gulf company quote a Singapore client: it picks
   * the company on that proposal (D4).
   */
  function stranded(country: string, fromId: string, toId: string): FirmEntity | null {
    if (fromId === toId) return null;
    const from = byId(fromId);
    if (from === undefined || from.isFirmSelf) return null;
    const keeps =
      from.routedCountries.some((c) => c !== country && c !== "*") ||
      (country !== "*" && from.isFallback);
    return keeps ? null : from;
  }
  const strandedLine = (country: string, from: FirmEntity, toId: string) => {
    const to = byId(toId)?.name ?? "another company";
    const where = country === "*" ? "every other country" : countryName(country);
    return (
      <Notice tone="warn" key={`strand-${country}`}>
        {from.name} quotes clients from {where} only. Giving that to {to} would take {from.name} off
        your companies: it could no longer issue documents or be chosen on a proposal. Give{" "}
        {from.name} another country first, or keep this row and pick {to} on the proposal itself.
      </Notice>
    );
  };
  const addStrands =
    already === null || newCompany === ""
      ? null
      : stranded(newCountry, already.firmEntityPartyId, newCompany);

  async function save(country: string, partyId: string): Promise<void> {
    const entity = byId(partyId);
    if (entity === undefined) return;
    const ok = await onSet(country, entity);
    if (ok) {
      setChoice((c) => {
        const next = { ...c };
        delete next[country];
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHead title="Which company quotes clients from which country" level={2}>
        <p className="lede">
          A new proposal or engagement letter starts with the company set here for the
          client&rsquo;s country, and with that company&rsquo;s currency and standard wording. A
          country that is not listed goes to <strong>Everywhere else</strong>. Changing a row
          changes new documents only: a document already drafted keeps its company.
        </p>
      </CardHead>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Clients from</Th>
              <Th>Are quoted by</Th>
              <Th>Documents in</Th>
              <Th>
                <span className="sr-only">Save</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const country = r.clientJurisdiction;
              const label = country === "*" ? "Everywhere else" : countryName(country);
              const picked = choice[country] ?? r.firmEntityPartyId;
              const changed = picked !== r.firmEntityPartyId;
              const strands = stranded(country, r.firmEntityPartyId, picked);
              return (
                <tr key={r.id}>
                  <Td>
                    {country === "*" ? (
                      <>
                        <strong>Everywhere else</strong>
                        <div className="muted text-sm">any country not listed above</div>
                      </>
                    ) : (
                      label
                    )}
                  </Td>
                  <Td>
                    <Select
                      aria-label={`Company that quotes clients from ${label}`}
                      value={picked}
                      onChange={(e) => {
                        const value = e.target.value;
                        setChoice((c) => ({ ...c, [country]: value }));
                      }}
                    >
                      {entities.map((e) => (
                        <option key={e.partyId} value={e.partyId}>
                          {e.name}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td className="mono">{byId(picked)?.defaultCurrency ?? ""}</Td>
                  <Td align="right">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!changed || strands !== null}
                      loading={busy === `route:${country}`}
                      aria-label={`Save the company for ${label}`}
                      onClick={() => void save(country, picked)}
                    >
                      Save
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      {rows.map((r) => {
        const picked = choice[r.clientJurisdiction] ?? r.firmEntityPartyId;
        const from = stranded(r.clientJurisdiction, r.firmEntityPartyId, picked);
        return from === null ? null : strandedLine(r.clientJurisdiction, from, picked);
      })}
      <p className="field-hint">
        A country cannot be taken off this table, only given to another company. To treat a country
        like every other one, give it the same company as Everywhere else.
      </p>

      <form
        style={{ marginTop: "var(--s-4)" }}
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
        <fieldset className="fieldset" aria-label="Add a country to the table">
          <FieldStack>
            <FieldRow>
              <Field label="Clients from">
                <CountrySelect
                  name="clientJurisdiction"
                  blankLabel="Choose a country"
                  required
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                />
              </Field>
              <Field label="Are quoted by">
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
            </FieldRow>
            {already !== null &&
              addStrands !== null &&
              strandedLine(newCountry, addStrands, newCompany)}
            {already !== null && addStrands === null && (
              <p className="field-hint" role="status">
                {countryName(newCountry)} is already in the table, quoted by{" "}
                {byId(already.firmEntityPartyId)?.name ?? "another company"}. Adding it again gives
                it to the company you choose here.
              </p>
            )}
            <div className="cluster">
              <Button
                type="submit"
                variant="secondary"
                disabled={addStrands !== null}
                loading={busy === `route:${newCountry}`}
              >
                Add the country
              </Button>
            </div>
          </FieldStack>
        </fieldset>
      </form>
    </Card>
  );
}

// ── Changing one ────────────────────────────────────────────────────────────

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
  const addressHint = useId();
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
            <Field
              label="Registered in"
              hint="Not recorded yet. Once it is, it does not change: the company's documents, law and currency follow from it."
            >
              <CountrySelect
                name="jurisdiction"
                blankLabel="Not recorded yet"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </Field>
          ) : (
            <p className="muted text-md">
              Registered in {countryName(entity.jurisdiction ?? "")}. A company does not move
              country; a company registered somewhere else is added as a new company.
            </p>
          )}
          <Field
            label="Kind of company"
            hint={waiting ? "Choose where it is registered first." : undefined}
          >
            <Input
              name="entityType"
              maxLength={100}
              required={!waiting}
              disabled={waiting}
              defaultValue={entity.entityType ?? ""}
            />
          </Field>
          <Field label="Registered address" optional>
            <Textarea
              name="address"
              rows={4}
              disabled={waiting}
              aria-describedby={addressHint}
              defaultValue={(entity.registeredAddress?.lines ?? []).join("\n")}
            />
          </Field>
          <p className="field-hint" id={addressHint}>
            One line per row, up to eight lines. Clear it to remove the address. It is kept on file
            and is not printed on documents yet.
          </p>
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
