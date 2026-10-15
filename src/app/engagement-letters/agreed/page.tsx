"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { Card, CardTitle, Page, PageHeader } from "@/components/tw";
import {
  Button,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Icon,
  Input,
  LinkButton,
  Notice,
  Select,
  TabPanel,
  Tabs,
  Textarea,
} from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { ClientPicker } from "@/components/proposal-builder/client-picker";
import type { PickableClient } from "@/components/proposal-builder/client-picker";
import { StickyFooter } from "@/components/proposal-builder/frame";
import { issuerFor, loadFirmEntities, offeredIn, readCatalogue } from "@/components/proposal-builder/data";
import type { CatalogueService, FirmEntities } from "@/components/proposal-builder/data";
import { FREQUENCY_WORDS } from "@/components/proposal-document/words";
import { CountrySelect } from "@/components/country-select";
import { EntityKindSelect } from "@/components/entity-kind-select";
import { YearEndField } from "@/components/year-end-field";
import { CHANNELS } from "@/components/record-acceptance";
import type { Channel } from "@/components/record-acceptance";
import { AgreedServices } from "@/components/agreed-letter/services";
import type { AgreedRow } from "@/components/agreed-letter/services";
import { defaultTitle } from "@/components/letter-builder/data";
import { useSession } from "@/components/layout/app-shell";
import { useSeesFees } from "@/components/fees";
import { countryName } from "@/lib/country";
import { browserDay, longDay } from "@/lib/day";
import { fxSuggestion } from "@/lib/fx";

/**
 * THE SHORT LETTER (2026-10-15): the client already agreed to the services and
 * fees by email or on a call, so nothing is sent for signature. One page: the
 * client (on the books, or added here), the services at the fees agreed, and
 * the client's yes with the email or screenshots behind it. Record writes an
 * ordinary draft, its lines and the files through the builder's own routes,
 * then `/agreed` signs it, so the jobs, filings and billing start exactly as
 * for a signed letter.
 *
 * A failure part-way keeps what was written (the client, the draft, its lines,
 * the files), and pressing Record again carries on from there.
 */
export default function AgreedLetterPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AgreedLetter />
    </Suspense>
  );
}

interface Client {
  readonly id: string;
  readonly name: string;
  /** Where it is registered, when its page records it. */
  readonly registeredIn: string | null;
  readonly companies: readonly { id: string; name: string }[];
  readonly firstPerson: string | null;
}

type Mode = "existing" | "new";
type Kind = "organization" | "person";

function AgreedLetter() {
  const router = useRouter();
  const search = useSearchParams();
  const session = useSession();
  const seesFees = useSeesFees() !== false;
  const today = browserDay();
  const modeTabs = useId();
  const kindTabs = useId();

  const [firm, setFirm] = useState<FirmEntities | null>(null);
  const [book, setBook] = useState<PickableClient[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueService[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ── The client ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("existing");
  const [client, setClient] = useState<Client | null>(null);
  const [kind, setKind] = useState<Kind>("organization");
  const [legalName, setLegalName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fullName, setFullName] = useState("");
  const [nationality, setNationality] = useState("");
  const newClientForm = useRef<HTMLFormElement>(null);

  // ── The letter ────────────────────────────────────────────────────────────
  const [countryPick, setCountryPick] = useState<string | null>(null);
  const [issuerPick, setIssuerPick] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [rate, setRate] = useState("");
  const [feedRate, setFeedRate] = useState<{ code: string; rate: string; on: string } | null>(null);
  const [startsOn, setStartsOn] = useState(today);
  const [rows, setRows] = useState<AgreedRow[]>([]);

  // ── The client's yes ──────────────────────────────────────────────────────
  // Nothing preselected (F13): the record is evidence.
  const [channel, setChannel] = useState<Channel | "">("");
  const [acceptedOn, setAcceptedOn] = useState(today);
  const [who, setWho] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // What a failed try already wrote, so Record again carries on.
  const [letter, setLetter] = useState<{ id: string; ref: string } | null>(null);
  const [filed, setFiled] = useState<ReadonlyMap<File, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permissions = session?.permissions ?? [];
  const allowed = permissions.includes("acceptance:record") && permissions.includes("party:write");

  useEffect(() => {
    void (async () => {
      const [entities, parties, services] = await Promise.all([
        loadFirmEntities(),
        api.GET("/api/v1/parties", {}),
        api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      ]);
      if (parties.response.status === 401) {
        router.push("/login");
        return;
      }
      if ("error" in entities) {
        setError(apiError(entities.error).message);
        setLoaded(true);
        return;
      }
      setFirm(entities);
      const own = new Set(entities.entities.map((e) => e.partyId));
      setBook(
        (parties.data?.parties ?? [])
          .filter((p) => !p.isOwnCompany && !own.has(p.id) && p.archivedAt === null)
          .map((p) => ({ id: p.id, name: p.displayName, kind: p.kind })),
      );
      if (services.data) setCatalogue(readCatalogue(services.data.entries));
      setLoaded(true);
      const asked = search.get("clientPartyId");
      if (asked !== null) await choose(asked);
    })();
    // Read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function readClient(id: string): Promise<Client | string> {
    const [profile, structure] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId: id } } }),
      api.GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: id } } }),
    ]);
    if (profile.error) return apiError(profile.error).message;
    if (structure.error) return apiError(structure.error).message;
    const registered =
      profile.data.legalEntities.find((l) => l.status === "active")?.jurisdiction ??
      profile.data.legalEntities[0]?.jurisdiction ??
      null;
    return {
      id,
      name: profile.data.party.displayName,
      registeredIn: registered === null ? null : registered.toUpperCase(),
      companies: structure.data.entities.map((e) => ({ id: e.id, name: e.displayName })),
      firstPerson: structure.data.people[0]?.id ?? null,
    };
  }

  async function choose(id: string): Promise<void> {
    setError(null);
    const read = await readClient(id);
    if (typeof read === "string") {
      setError(read);
      return;
    }
    setClient(read);
    setCountryPick(null);
    setIssuerPick(null);
    setRows([]);
  }

  // ── What follows from what ───────────────────────────────────────────────
  const clientCountry =
    mode === "new" && client === null
      ? kind === "organization"
        ? newCountry
        : nationality
      : (client?.registeredIn ?? "");
  const fallbackCountry = firm === null ? "" : (issuerFor(firm, null)?.jurisdiction ?? "");
  const country = countryPick ?? (clientCountry !== "" ? clientCountry : fallbackCountry);
  const suggested = firm === null || country === "" ? null : issuerFor(firm, country);
  const issuerId = issuerPick ?? suggested?.partyId ?? "";
  const issuer = firm?.entities.find((e) => e.partyId === issuerId) ?? null;
  const currency = issuer?.defaultCurrency ?? "";
  const reporting = firm?.reportingCurrency ?? currency;
  const foreign = currency !== "" && currency !== reporting;
  useEffect(() => {
    if (!foreign) return;
    void fxSuggestion(currency, today).then((s) => {
      setFeedRate(s === null ? null : { code: currency, rate: s.rate, on: s.on });
    });
  }, [foreign, currency, today]);
  const feed = foreign && feedRate?.code === currency ? feedRate : null;
  const offered = useMemo(() => (country === "" ? [] : offeredIn(catalogue, country)), [catalogue, country]);
  const clientKnown = client !== null || mode === "new";
  const clientName = client?.name ?? (kind === "organization" ? legalName.trim() : fullName.trim());
  // The letter's head is fixed once the draft exists, and the country and
  // issuer once a service is ticked (the list is that country's).
  const headLocked = letter !== null || busy;

  /** What is missing, said before the confirmation opens. */
  function problem(): string | null {
    if (mode === "existing" && client === null) return "Choose the client.";
    if (mode === "new" && client === null) {
      if (kind === "organization") {
        if (legalName.trim() === "") return "Enter the new client's legal name.";
        if (newCountry === "") return "Choose the country the new client is registered in.";
        if (entityType === "") return "Choose the kind of company.";
        const yearEnd = newClientForm.current === null ? "" : String(new FormData(newClientForm.current).get("financialYearEnd") ?? "");
        if (newCountry !== "IN" && yearEnd === "") return "Choose the new client's year end.";
      } else if (fullName.trim() === "") return "Enter the new client's full name.";
    }
    if (issuer === null) return "Choose which of your companies the letter is from.";
    if (foreign && (feed?.rate ?? rate).replace(/[,\s]/g, "") === "") {
      return `Enter the rate: what 1 ${currency} is in ${reporting}.`;
    }
    if (startsOn === "") return "Choose the day the work starts.";
    if (rows.length === 0) return "Tick at least one service the client agreed to.";
    for (const r of rows) {
      if (r.lineId !== null) continue;
      if (client !== null && client.companies.length > 1 && r.entityId === "") {
        return `Choose which company ${r.service.name} is for.`;
      }
      if (seesFees && r.fee.replace(/[,\s]/g, "") === "") return `Enter the fee agreed for ${r.service.name}.`;
      if (r.frequency === "") return `Choose how often ${r.service.name} is billed.`;
    }
    if (channel === "") return "Choose how the client agreed.";
    if (acceptedOn === "" || acceptedOn > today) return "Choose the day the client agreed, today or earlier.";
    if (who.trim() === "") return "Say who at the client agreed.";
    if (note.trim() === "") return "Add a note: what the client agreed to, and where.";
    if (files.length === 0) return "Attach the client's email or a screenshot of it.";
    return null;
  }

  async function createClient(): Promise<Client> {
    const yearEnd = newClientForm.current === null ? "" : String(new FormData(newClientForm.current).get("financialYearEnd") ?? "");
    const created =
      kind === "organization"
        ? await api.POST("/api/v1/parties/organizations", {
            body: {
              legalName: legalName.trim(),
              jurisdiction: newCountry,
              entityType,
              // India's year end is fixed at 31 March and not sent (Q076).
              ...(newCountry === "IN" || yearEnd === "" ? {} : { financialYearEnd: yearEnd }),
            },
          })
        : await api.POST("/api/v1/parties/persons", {
            body: { fullName: fullName.trim(), ...(nationality === "" ? {} : { nationality }) },
          });
    if (created.error) throw new Error(apiError(created.error).message);
    const read = await readClient(created.data.partyId);
    if (typeof read === "string") throw new Error(read);
    return read;
  }

  async function record(): Promise<void> {
    if (issuer === null) return;
    setBusy(true);
    setError(null);
    try {
      // 1. The client, added once: a retry finds it chosen.
      let party = client;
      if (party === null) {
        setStage("Adding the client…");
        party = await createClient();
        setClient(party);
        setMode("existing");
        setCountryPick(country);
        setBook((b) => [...b, { id: party?.id ?? "", name: party?.name ?? "", kind }]);
      }
      const only = party.companies.length === 1 ? (party.companies[0]?.id ?? "") : "";
      let current = rows.map((r) => (r.entityId === "" ? { ...r, entityId: only } : r));

      // 2. The draft.
      let draft = letter;
      if (draft === null) {
        setStage("Saving the letter…");
        const fxRate = foreign ? (feed?.rate ?? rate).replace(/[,\s]/g, "") : "1";
        const drafted = await api.POST("/api/v1/engagement-letters", {
          body: {
            partyId: party.id,
            jurisdiction: country,
            issuingEntityPartyId: issuer.partyId,
            title: defaultTitle(party.name),
            currency,
            fxRate,
            fxRateDate: foreign && feed !== null && rate === "" ? feed.on : today,
            advanceRequired: false,
            effectiveFrom: startsOn,
            ...(party.firstPerson === null ? {} : { addressedToPartyId: party.firstPerson }),
          },
        });
        if (drafted.error) throw new Error(apiError(drafted.error).message);
        draft = { id: drafted.data.id, ref: drafted.data.ref };
        setLetter(draft);
      }

      // 3. The services, one line each.
      setStage("Adding the services…");
      for (const r of current) {
        if (r.lineId !== null) continue;
        const fee = r.fee.replace(/[,\s]/g, "");
        const added = await api.POST("/api/v1/engagement-letters/{letterId}/lines", {
          params: { path: { letterId: draft.id } },
          body: {
            entityPartyId: r.entityId,
            serviceVersionId: r.service.versionId,
            description: r.service.name,
            quantity: "1",
            discountPercent: "0",
            jurisdiction: country,
            ...(r.frequency === "" ? {} : { billingFrequency: r.frequency }),
            // A login that cannot see fees sends none: the API quotes the list price (B09).
            ...(seesFees ? { currency, unitAmount: fee } : {}),
          },
        });
        if (added.error) throw new Error(`${r.service.name}: ${apiError(added.error).message}`);
        const lineId = added.data.id;
        current = current.map((x) => (x.key === r.key ? { ...x, lineId } : x));
        setRows(current);
      }

      // 4. The client's email, every file filed against the letter.
      setStage("Filing the client's email…");
      const ids: string[] = [];
      const kept = new Map(filed);
      for (const [i, file] of files.entries()) {
        const known = kept.get(file);
        if (known !== undefined) {
          ids.push(known);
          continue;
        }
        const payload = new FormData();
        payload.set("file", file);
        payload.set("title", `Agreement from ${who.trim()}, ${longDay(acceptedOn)}${files.length > 1 ? ` (${String(i + 1)})` : ""}`);
        payload.set("kind", "correspondence");
        payload.set("subjectKind", "engagement_letter");
        payload.set("subjectRef", draft.id);
        payload.set("role", "acceptance_evidence");
        payload.set("partyId", party.id);
        const uploaded = await api.POST("/api/v1/documents", {
          body: payload as unknown as never,
          bodySerializer: (b: unknown) => b as FormData,
        });
        if (uploaded.error) throw new Error(`${file.name}: ${apiError(uploaded.error).message}`);
        kept.set(file, uploaded.data.id);
        setFiled(new Map(kept));
        ids.push(uploaded.data.id);
      }

      // 5. Signed as agreed: the work starts.
      setStage("Starting the work…");
      const done = await api.POST("/api/v1/engagement-letters/{letterId}/agreed", {
        params: { path: { letterId: draft.id }, query: { asOf: today } },
        body: {
          channel: channel as Channel,
          acceptedOn,
          acceptedByName: who.trim(),
          ...(role.trim() === "" ? {} : { acceptedByTitle: role.trim() }),
          note: note.trim(),
          evidenceDocumentId: ids[0] ?? "",
        },
      });
      if (done.error) throw new Error(apiError(done.error).message);
      router.push(`/engagement-letters/${draft.id}` as Route);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  if (!loaded || session === null) return <p className="muted">Loading…</p>;

  if (!allowed) {
    return (
      <Page>
        <title>Agreed by email</title>
        <PageHeader title="Agreed by email" />
        <Notice tone="warn">
          Only a partner can record work the client agreed to outside bib, because it starts the
          work and the billing. Ask a partner, or send the client a letter to sign with{" "}
          <Link href="/engagement-letters/new">New engagement letter</Link>.
        </Notice>
      </Page>
    );
  }

  const pending = rows.filter((r) => r.lineId === null).length;
  const summary =
    stage ??
    (rows.length === 0
      ? "No services ticked yet."
      : `${String(rows.length)} service${rows.length === 1 ? "" : "s"} agreed · work starts ${longDay(startsOn)}`);

  return (
    <Page>
      <title>Agreed by email</title>
      <PageHeader
        title="Agreed by email"
        lede="For work the client has already agreed to by email or on a call. Nothing is sent for signature: their email is the proof, and the work starts when you record it."
      />

      {letter !== null && !busy && (
        <Notice tone="neutral">
          Saved so far as draft {letter.ref}. Press Record again to carry on, or{" "}
          <Link href={`/engagement-letters/${letter.id}/build` as Route}>open the draft</Link> to finish it there.
        </Notice>
      )}

      <div className="flex flex-col gap-6">
        <Card>
          <CardTitle level={2}>1. Client</CardTitle>
          <div className="mt-3 flex flex-col gap-4">
            {client !== null ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunk px-4 py-3">
                <div className="min-w-0">
                  <p className="m-0 font-semibold">{client.name}</p>
                  <p className="m-0 text-sm text-muted">
                    {client.registeredIn === null
                      ? "No registration on file."
                      : `Registered in ${countryName(client.registeredIn)}.`}
                  </p>
                </div>
                {letter === null && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setClient(null);
                      setRows([]);
                      setCountryPick(null);
                      setIssuerPick(null);
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Tabs
                  id={modeTabs}
                  label="Which client"
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setRows([]);
                    setCountryPick(null);
                    setIssuerPick(null);
                  }}
                  tabs={[
                    { value: "existing", label: "Existing client" },
                    { value: "new", label: "New client" },
                  ]}
                />
                <TabPanel tabsId={modeTabs} value="existing">
                  {mode === "existing" && (
                    <Field label="Client">
                      <ClientPicker
                        clients={book}
                        notFound="No client by that name. Choose New client to add them."
                        onPick={(c) => {
                          void choose(c.id);
                        }}
                      />
                    </Field>
                  )}
                </TabPanel>
                <TabPanel tabsId={modeTabs} value="new">
                  {mode === "new" && (
                    <form
                      ref={newClientForm}
                      onSubmit={(e) => {
                        e.preventDefault();
                      }}
                    >
                      <FieldStack>
                        <Tabs
                          id={kindTabs}
                          label="What kind of client"
                          value={kind}
                          onChange={setKind}
                          tabs={[
                            { value: "organization", label: "Company" },
                            { value: "person", label: "Person" },
                          ]}
                        />
                        <TabPanel tabsId={kindTabs} value={kind}>
                          {kind === "organization" ? (
                            <FieldStack>
                              <Field label="Legal name">
                                <Input
                                  value={legalName}
                                  placeholder="e.g. Kaveri Foods Pvt Ltd"
                                  onChange={(e) => {
                                    setLegalName(e.target.value);
                                  }}
                                />
                              </Field>
                              <FieldRow>
                                <Field label="Country">
                                  <CountrySelect
                                    blankLabel="Choose a country"
                                    value={newCountry}
                                    onChange={(e) => {
                                      setNewCountry(e.target.value);
                                      setRows([]);
                                      setCountryPick(null);
                                      setIssuerPick(null);
                                    }}
                                  />
                                </Field>
                                <Field label="Kind of company">
                                  <EntityKindSelect
                                    value={entityType}
                                    onChange={(e) => {
                                      setEntityType(e.target.value);
                                    }}
                                  />
                                </Field>
                                <YearEndField country={newCountry} />
                              </FieldRow>
                            </FieldStack>
                          ) : (
                            <FieldRow>
                              <Field label="Full name">
                                <Input
                                  value={fullName}
                                  placeholder="e.g. Asha Verma"
                                  onChange={(e) => {
                                    setFullName(e.target.value);
                                  }}
                                />
                              </Field>
                              <Field label="Nationality" optional>
                                <CountrySelect
                                  value={nationality}
                                  onChange={(e) => {
                                    setNationality(e.target.value);
                                    setRows([]);
                                    setCountryPick(null);
                                    setIssuerPick(null);
                                  }}
                                />
                              </Field>
                            </FieldRow>
                          )}
                        </TabPanel>
                        <p className="m-0 text-sm text-muted">
                          The client is added when you record. Their other details can be filled in on their page later.
                        </p>
                      </FieldStack>
                    </form>
                  )}
                </TabPanel>
              </>
            )}

            {clientKnown && firm !== null && (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                {changing && !headLocked && rows.length === 0 ? (
                  <FieldRow>
                    <Field label="Under the law of">
                      <CountrySelect
                        value={country}
                        onChange={(e) => {
                          setCountryPick(e.target.value);
                          setIssuerPick(null);
                        }}
                      />
                    </Field>
                    <Field label="Issued by">
                      <Select
                        value={issuerId}
                        onChange={(e) => {
                          setIssuerPick(e.target.value);
                        }}
                      >
                        {firm.entities.map((e) => (
                          <option key={e.partyId} value={e.partyId}>
                            {e.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </FieldRow>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="m-0 text-md">
                      {issuer === null ? (
                        "Choose which of your companies the letter is from."
                      ) : (
                        <>
                          From <strong>{issuer.name}</strong>
                          {country === "" ? "" : `, under ${countryName(country)} law`}, fees in {currency}.
                        </>
                      )}
                    </p>
                    {!headLocked && (
                      <Button
                        variant="link"
                        size="sm"
                        disabled={rows.length > 0}
                        onClick={() => {
                          setChanging(true);
                        }}
                      >
                        {rows.length > 0 ? "Untick the services to change this" : "Change"}
                      </Button>
                    )}
                  </div>
                )}
                {foreign && (
                  <Field
                    label={`1 ${currency} in ${reporting}`}
                    hint={
                      feed === null
                        ? "No published rate today: enter the one you agreed."
                        : `Today's published rate is ${feed.rate}. Change it only if you agreed another.`
                    }
                  >
                    <Input
                      inputMode="decimal"
                      value={rate === "" ? (feed?.rate ?? "") : rate}
                      disabled={headLocked}
                      onChange={(e) => {
                        setRate(e.target.value);
                      }}
                    />
                  </Field>
                )}
                <Field label="Work starts on" hint="Jobs and billing count from this day. It can be in the past.">
                  <Input
                    type="date"
                    value={startsOn}
                    disabled={headLocked}
                    onChange={(e) => {
                      setStartsOn(e.target.value);
                    }}
                  />
                </Field>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle level={2}>2. Services agreed</CardTitle>
          <div className="mt-3">
            {!clientKnown || issuer === null ? (
              <p className="m-0 text-muted">Choose the client first.</p>
            ) : (
              <AgreedServices
                catalogue={offered}
                rows={rows}
                onRows={setRows}
                currency={currency}
                companies={client?.companies ?? []}
                seesFees={seesFees}
                locked={busy}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardTitle level={2}>3. The client&apos;s yes</CardTitle>
          <div className="mt-3">
            <FieldStack>
              <FieldRow>
                <Field label="How they agreed">
                  <Select
                    value={channel}
                    disabled={busy}
                    onChange={(e) => {
                      setChannel(e.target.value as Channel);
                    }}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="On">
                  <Input
                    type="date"
                    value={acceptedOn}
                    max={today}
                    disabled={busy}
                    onChange={(e) => {
                      setAcceptedOn(e.target.value);
                    }}
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Who at the client">
                  <Input
                    value={who}
                    maxLength={200}
                    placeholder="e.g. Priya Menon"
                    disabled={busy}
                    onChange={(e) => {
                      setWho(e.target.value);
                    }}
                  />
                </Field>
                <Field label="Their role" optional>
                  <Input
                    value={role}
                    maxLength={200}
                    placeholder="e.g. Director"
                    disabled={busy}
                    onChange={(e) => {
                      setRole(e.target.value);
                    }}
                  />
                </Field>
              </FieldRow>
              <Field label="Note" hint="What they agreed to, and where the email can be found.">
                <Textarea
                  rows={2}
                  value={note}
                  maxLength={2000}
                  placeholder="e.g. Replied 'go ahead' to our fee email on 14 Oct."
                  disabled={busy}
                  onChange={(e) => {
                    setNote(e.target.value);
                  }}
                />
              </Field>
              <Field
                label="The email or screenshots"
                hint="At least one: a screenshot of the email or chat, or the email saved as PDF."
              >
                <Input
                  type="file"
                  multiple
                  accept=".pdf,.eml,.msg,.png,.jpg,.jpeg,.webp"
                  disabled={busy}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setFiles((f) => [...f, ...picked.filter((p) => !f.some((x) => x.name === p.name && x.size === p.size))]);
                    e.target.value = "";
                  }}
                />
              </Field>
              {files.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Files to attach">
                  {files.map((f) => (
                    <li key={`${f.name}-${String(f.size)}`} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                      <span className="min-w-0 break-words">
                        {f.name}
                        {filed.has(f) && <span className="ml-2 text-sm text-muted">filed</span>}
                      </span>
                      {!filed.has(f) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Remove ${f.name}`}
                          icon={<Icon name="close" size={16} />}
                          onClick={() => {
                            setFiles((all) => all.filter((x) => x !== f));
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </FieldStack>
          </div>
        </Card>

        <ErrorNotice error={error} />

        <StickyFooter summary={summary}>
          <LinkButton href="/engagement-letters" variant="secondary">
            Cancel
          </LinkButton>
          <ConfirmAction
            variant="primary"
            loading={busy}
            disabled={busy}
            beforeOpen={() => {
              const p = problem();
              setError(p);
              return p === null;
            }}
            title={`Record the work ${clientName === "" ? "the client" : clientName} agreed to?`}
            confirmLabel="Record and start work"
            consequence={
              <div className="stack tight">
                <p>
                  A signed engagement letter is recorded with {rows.length === 1 ? "this service" : "these services"}, and
                  the jobs and billing start from {longDay(startsOn)}. Nothing is sent to the client. This cannot be undone.
                </p>
                <ul className="m-0 pl-5">
                  {rows.map((r) => {
                    const fee = r.fee.replace(/[,\s]/g, "");
                    return (
                      <li key={r.key}>
                        {r.service.name}
                        {seesFees && fee !== "" ? `: ${formatMoney(fee, currency)}` : ""}
                        {r.frequency === "" ? "" : ` ${FREQUENCY_WORDS[r.frequency]}`}
                      </li>
                    );
                  })}
                </ul>
                {mode === "new" && client === null && <p>{clientName} is added as a new client.</p>}
              </div>
            }
            onConfirm={() => {
              void record();
            }}
          >
            {letter !== null && pending === 0 ? "Finish recording" : "Record and start work"}
          </ConfirmAction>
        </StickyFooter>
      </div>
    </Page>
  );
}
