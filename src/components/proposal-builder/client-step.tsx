"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError, LEAD_SOURCES } from "@/lib/api/client";
import type { LeadSource, ProposalRecord } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/tw";
import {
  Button,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  LinkButton,
  Notice,
  Select,
} from "@/components/ui";
import { useSession } from "@/components/layout";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { browserDay, longDay } from "@/lib/day";
import { cn } from "@/lib/cn";
import { ClientPicker } from "./client-picker";
import type { PickableClient } from "./client-picker";
import { StickyFooter } from "./frame";
import { issuerFor, loadFirmEntities } from "./data";
import type { FirmEntities, FirmEntity } from "./data";

/** How a new prospect came to the firm, in words (the lead's `source`). */
const SOURCE_WORDS: Readonly<Record<LeadSource, string>> = {
  referral: "A referral",
  inbound: "They came to us",
  outbound: "We reached out",
  event: "An event",
  partner: "A partner firm",
  other: "Something else",
};

interface Contact {
  readonly id: string;
  readonly name: string;
}

/** What the builder knows about the chosen client. */
interface ChosenClient {
  readonly id: string;
  readonly name: string;
  /** Where the client is registered, when its page records it. */
  readonly registeredIn: string | null;
  readonly people: readonly Contact[];
}

/** The last rate this firm struck for a currency, from its own proposals. */
interface KnownRate {
  readonly rate: string;
  readonly on: string;
  readonly ref: string;
}

/** Once a new prospect has become a lead and a contact, a retry after a failed
 *  draft must not capture them twice. */
interface Captured {
  readonly leadId: string;
  readonly partyId: string;
  readonly contactId: string;
}

type Who = "existing" | "prospect";

/**
 * STEP 1: who the proposal is for, which of the firm's companies offers it, in
 * what currency, and what the cover says.
 *
 * Every box that can be answered from what the firm already holds is answered
 * before anybody presses: the client from the page it was opened on, the
 * issuing company from the firm's own country rule (D4), the currency from
 * that company's country (D1), the title from the client's name, and the
 * person it is prepared for from the client's own page. So for an existing
 * client the whole step can be one press of Next.
 *
 * `draft` is the proposal when this step is reopened on one. The client of a
 * draft is fixed: a quote re-pointed at a different company would carry the
 * first one's wording. Its issuer can change, which replaces its prose with the
 * new company's standard set after asking when any of it was written for this
 * client (D9), and its currency can change while nothing on it is priced.
 */
export function ClientStep({
  draft,
  prefillClientId,
  prefillLeadId,
  onSaved,
}: {
  draft: ProposalRecord | null;
  prefillClientId: string | null;
  prefillLeadId: string | null;
  /** A draft saved here: the builder holds the record the API answered with,
   *  so step 2 opens on the new issuer and currency. The page does not reload
   *  between steps, so without it step 2 drew the proposal as it was. */
  onSaved?: (record: ProposalRecord) => void;
}) {
  const router = useRouter();
  const session = useSession();

  const [firm, setFirm] = useState<FirmEntities | null>(null);
  const [book, setBook] = useState<PickableClient[]>([]);
  const [rates, setRates] = useState<ReadonlyMap<string, KnownRate>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [who, setWho] = useState<Who>("existing");
  const [client, setClient] = useState<ChosenClient | null>(null);
  const [leadId, setLeadId] = useState<string | null>(draft?.proposal.leadId ?? prefillLeadId);
  const [country, setCountry] = useState("");
  const [prospect, setProspect] = useState({
    company: "",
    contact: "",
    designation: "",
    email: "",
    phone: "",
    source: "referral" as LeadSource,
  });
  const [captured, setCaptured] = useState<Captured | null>(null);
  /**
   * The lead the capture landed on, kept so a second press does not capture
   * again. `matched` is the name of a company ALREADY on file that the email or
   * phone belongs to, when it is not the name that was typed: the pipeline's
   * dedup put this proposal on that company, and the reader is told so and
   * presses Next again before anything else is written.
   */
  const [landed, setLanded] = useState<{ id: string; partyId: string; matched: string | null } | null>(
    null,
  );

  // What somebody CHOSE. Null means "not touched", and the value shown is then
  // derived from what it depends on (below), so it keeps following the client
  // until the moment somebody overrides it.
  const [issuerPick, setIssuerPick] = useState<string | null>(
    draft?.proposal.issuingEntityPartyId ?? null,
  );
  const [currencyPick, setCurrencyPick] = useState<string | null>(draft?.proposal.currency ?? null);
  const [ratePick, setRatePick] = useState<string | null>(
    draft?.proposal.fxRate === undefined || draft.proposal.fxRate === null
      ? null
      : trimRate(draft.proposal.fxRate),
  );
  const [datePick, setDatePick] = useState<string | null>(draft?.proposal.fxRateDate ?? null);
  const [titlePick, setTitlePick] = useState<string | null>(draft?.proposal.title ?? null);
  const [addresseeId, setAddresseeId] = useState<string>(draft?.proposal.addressedToPartyId ?? "");
  const [validUntil, setValidUntil] = useState<string>(draft?.proposal.validUntil ?? "");
  /** A draft's issuer is changing and its prose was written or edited for this
   *  client: the reader is asked before it is replaced (D9). */
  const [askReplace, setAskReplace] = useState(false);

  // ── Reads ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      const [entities, parties, proposals] = await Promise.all([
        loadFirmEntities(),
        draft === null ? api.GET("/api/v1/parties", {}) : Promise.resolve(null),
        api.GET("/api/v1/proposals", {}),
      ]);
      if (parties?.response.status === 401 || proposals.response.status === 401) {
        router.push("/login");
        return;
      }
      if ("error" in entities) {
        setError(apiError(entities.error).message);
        setLoaded(true);
        return;
      }
      setFirm(entities);
      if (parties?.data) {
        // THE FIRM'S OWN COMPANIES ARE NOT CLIENTS. A proposal from the firm
        // to itself is a valid write the API has no reason to refuse, and the
        // firm sorts above every client in an alphabetical list.
        const own = new Set(entities.entities.map((e) => e.partyId));
        setBook(
          parties.data.parties
            .filter((p) => !own.has(p.id))
            .map((p) => ({ id: p.id, name: p.displayName, kind: p.kind })),
        );
      }
      if (proposals.data) {
        // The newest rate the firm has struck per currency, so a second AED
        // quote this month does not ask for the rate from scratch.
        const known = new Map<string, KnownRate>();
        const sorted = [...proposals.data.proposals].sort((a, b) =>
          b.proposal.fxRateDate.localeCompare(a.proposal.fxRateDate),
        );
        for (const p of sorted) {
          const { currency: c, fxRate: r, fxRateDate: d, ref } = p.proposal;
          if (r !== null && !known.has(c)) known.set(c, { rate: trimRate(r), on: d, ref });
        }
        setRates(known);
      }
      setLoaded(true);
    })();
    // Read once. The prefills below run after this has answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Read a client's registration and its people, and fill in what follows. */
  async function choose(id: string, name: string, leadCountry: string | null): Promise<void> {
    setError(null);
    const [profile, structure] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId: id } } }),
      api.GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: id } } }),
    ]);
    if (profile.error) {
      setError(apiError(profile.error).message);
      return;
    }
    const registered =
      profile.data.legalEntities.find((l) => l.status === "active")?.jurisdiction ??
      profile.data.legalEntities[0]?.jurisdiction ??
      null;
    const people = (structure.data?.people ?? []).map((p) => ({ id: p.id, name: p.displayName }));
    const chosen: ChosenClient = {
      id,
      name: profile.data.party.displayName || name,
      registeredIn: registered === null ? null : registered.toUpperCase(),
      people,
    };
    setClient(chosen);
    if (draft === null) {
      const where = chosen.registeredIn ?? leadCountry;
      setCountry(where ?? "");
      // Prepared for: the client's person. The first one when there are
      // several, visible in the box before anybody presses Next.
      setAddresseeId(people[0]?.id ?? "");
    }
  }

  // Prefill: a draft's own client, a lead's prospect, or the client page's.
  useEffect(() => {
    if (!loaded || firm === null) return;
    void (async () => {
      if (draft !== null) {
        await choose(draft.party.id, draft.party.displayName, null);
        return;
      }
      if (prefillLeadId !== null) {
        const lead = await api.GET("/api/v1/leads/{leadId}", {
          params: { path: { leadId: prefillLeadId } },
        });
        if (lead.data) {
          setLeadId(lead.data.lead.id);
          await choose(lead.data.party.id, lead.data.party.displayName, lead.data.lead.jurisdiction);
          return;
        }
      }
      if (prefillClientId !== null) {
        await choose(prefillClientId, "", null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, firm]);

  // ── What follows from what ───────────────────────────────────────────────

  const clientName =
    who === "prospect" && draft === null
      ? (landed?.matched ?? prospect.company.trim())
      : (client?.name ?? "");
  const whereKey = country === "" ? null : country;

  // The issuer follows the client's country until somebody picks one (D4); the
  // currency follows the issuer (D1); the title follows the client's name; the
  // rate is the firm's own last one for that currency, and is asked for only
  // when the currency is not the one the firm keeps its books in.
  const suggested: FirmEntity | null = firm === null ? null : issuerFor(firm, whereKey);
  const issuerId = issuerPick ?? suggested?.partyId ?? "";
  const issuer = firm?.entities.find((e) => e.partyId === issuerId) ?? null;
  const currency = currencyPick ?? issuer?.defaultCurrency ?? "";
  const title = titlePick ?? (clientName === "" ? "" : `Proposal for ${clientName}`);
  // Until the firm's companies have been read there is no rate to ask for.
  const reporting = firm?.reportingCurrency ?? currency;
  const foreign = currency !== "" && currency !== reporting;
  const known = rates.get(currency);
  const fxRate = foreign ? (ratePick ?? known?.rate ?? "") : "1";
  // A rate carried over from an earlier proposal is as of THAT proposal's day;
  // a rate somebody types now is as of today.
  const fxRateDate =
    datePick ?? (foreign && ratePick === null && known !== undefined ? known.on : browserDay());

  // ── On a draft (T6.18 item 3) ────────────────────────────────────────────
  // The issuer can change, and its standard prose replaces the draft's. The
  // currency can change only while no service is on it: every line is priced
  // in it. A rate or its date can always be corrected.
  const lineCount = draft?.lines.length ?? 0;
  const currencyLocked = draft !== null && lineCount > 0;
  const issuerChanged = draft !== null && issuerId !== draft.proposal.issuingEntityPartyId;
  const moneyChanged =
    draft !== null &&
    (currency !== draft.proposal.currency ||
      (foreign && fxRate !== trimRate(draft.proposal.fxRate ?? "")) ||
      fxRateDate !== draft.proposal.fxRateDate);
  /** Lines this proposal says in its own words: reworded from the standard
   *  set, or written for this client. All of them go when the issuer changes. */
  const ownProse = (draft?.blocks ?? []).filter((x) => x.isEdited || x.sourceId === null).length;

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const e of firm?.entities ?? []) set.add(e.defaultCurrency);
    set.add(reporting);
    if (currency !== "") set.add(currency);
    return [...set].sort();
  }, [firm, reporting, currency]);

  const people: readonly Contact[] =
    who === "prospect" && draft === null
      ? prospect.contact.trim() === ""
        ? []
        : [{ id: "prospect", name: prospect.contact.trim() }]
      : (client?.people ?? []);

  // ── Next ──────────────────────────────────────────────────────────────────

  /** Typing new details for the prospect starts the capture again. */
  function editProspect(change: Partial<typeof prospect>): void {
    setProspect({ ...prospect, ...change });
    setLanded(null);
    setCaptured(null);
  }

  async function capture(): Promise<Captured | null> {
    if (captured !== null) return captured;
    if (landed === null) {
      const got = await captureLead();
      if (got === null) return null;
      setLanded(got);
      // STOP HERE when the details belong to a company already on file under
      // another name: the proposal would otherwise go to them silently.
      if (got.matched !== null) return null;
      return addContact(got);
    }
    return addContact(landed);
  }

  async function captureLead(): Promise<{ id: string; partyId: string; matched: string | null } | null> {
    const identifiers = [
      ...(prospect.email.trim() === "" ? [] : [{ type: "email" as const, value: prospect.email.trim() }]),
      ...(prospect.phone.trim() === "" ? [] : [{ type: "phone" as const, value: prospect.phone.trim() }]),
    ];
    // THE LEAD CARRIES THE EMAIL AND PHONE, so the pipeline's dedup keeps
    // working (D12): the next enquiry from this address lands on this
    // opportunity. The contact person is recorded under the company without
    // them, because the same address on two parties makes every later capture
    // of it ambiguous, and the API refuses an ambiguous one.
    const lead = await api.POST("/api/v1/leads", {
      body: {
        source: prospect.source,
        kind: "organization",
        name: prospect.company.trim(),
        title: title.trim() === "" ? `Proposal for ${prospect.company.trim()}` : title.trim(),
        identifiers,
        ...(session?.userId === undefined ? {} : { ownerUserId: session.userId }),
        ...(whereKey === null ? {} : { jurisdiction: whereKey }),
      },
    });
    if (lead.error) {
      setError(apiError(lead.error).message);
      return null;
    }
    let matched: string | null = null;
    if (lead.data.matchedExistingParty) {
      const view = await api.GET("/api/v1/leads/{leadId}", {
        params: { path: { leadId: lead.data.lead.id } },
      });
      const name = view.data?.party.displayName ?? null;
      if (name !== null && name.trim().toLowerCase() !== prospect.company.trim().toLowerCase()) {
        matched = name;
      }
    }
    return { id: lead.data.lead.id, partyId: lead.data.lead.partyId, matched };
  }

  async function addContact(got: { id: string; partyId: string }): Promise<Captured | null> {
    const partyId = got.partyId;
    const contactName = prospect.contact.trim();
    // A prospect the firm already knew may already have this person on file.
    const structure = await api.GET("/api/v1/parties/{partyId}/structure", {
      params: { path: { partyId } },
    });
    let contactId =
      structure.data?.people.find((p) => p.displayName.toLowerCase() === contactName.toLowerCase())?.id ??
      null;
    if (contactId === null) {
      const person = await api.POST("/api/v1/parties/persons", { body: { fullName: contactName } });
      if (person.error) {
        setError(apiError(person.error).message);
        return null;
      }
      const tie = await api.POST("/api/v1/parties/relationships", {
        body: {
          fromPartyId: person.data.partyId,
          toPartyId: partyId,
          type: "employee_of",
          // Yesterday: a relationship starting "today" is left out of the
          // client's people by any reader whose day has not turned yet.
          validFrom: dayBefore(browserDay()),
          ...(prospect.designation.trim() === ""
            ? {}
            : { attributes: { designation: prospect.designation.trim() } }),
        },
      });
      if (tie.error) {
        setError(apiError(tie.error).message);
        return null;
      }
      contactId = person.data.partyId;
    }
    const done = { leadId: got.id, partyId, contactId };
    setCaptured(done);
    return done;
  }

  /** A draft's step 1, saved in one call: the cover, and the issuer and the
   *  money when they changed. */
  async function save(replaceEditedProse: boolean): Promise<void> {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    const where = client?.registeredIn ?? null;
    const saved = await api.PATCH("/api/v1/proposals/{proposalId}", {
      params: { path: { proposalId: draft.proposal.id } },
      body: {
        title: title.trim(),
        validUntil: validUntil === "" ? null : validUntil,
        addressedToPartyId: addresseeId === "" ? null : addresseeId,
        ...(issuerChanged
          ? {
              issuingEntityPartyId: issuerId,
              // Which country's standard lines the new wording takes: the
              // client's, as when a proposal is first drafted.
              ...(where === null ? {} : { clientJurisdiction: where }),
              ...(replaceEditedProse ? { replaceEditedProse: true } : {}),
            }
          : {}),
        ...(moneyChanged ? { currency, fxRate: foreign ? fxRate.trim() : "1", fxRateDate } : {}),
      },
    });
    setBusy(false);
    if (saved.error) {
      // Somebody edited a line since this page was read: ask now.
      if (apiError(saved.error).reason === "PROSE_EDITED") {
        setAskReplace(true);
        return;
      }
      setError(apiError(saved.error).message);
      return;
    }
    onSaved?.(saved.data);
    router.push(`/proposals/${draft.proposal.id}/build?step=services` as Route);
  }

  async function next(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (draft !== null) {
        // D9: ask before the wording written for this client is replaced.
        if (issuerChanged && ownProse > 0) {
          setAskReplace(true);
          return;
        }
        await save(false);
        return;
      }

      let partyId: string;
      let lead: string | null = leadId;
      let addressee: string | null = addresseeId === "" ? null : addresseeId;
      if (who === "prospect") {
        const got = await capture();
        if (got === null) return;
        partyId = got.partyId;
        lead = got.leadId;
        addressee = got.contactId;
      } else {
        if (client === null) {
          setError("Choose the client this proposal is for.");
          return;
        }
        partyId = client.id;
      }

      const drafted = await api.POST("/api/v1/proposals", {
        body: {
          partyId,
          ...(lead === null ? {} : { leadId: lead }),
          ...(issuerId === "" ? {} : { issuingEntityPartyId: issuerId }),
          ...(whereKey === null ? {} : { clientJurisdiction: whereKey }),
          title: title.trim(),
          currency,
          fxRate: foreign ? fxRate.trim() : "1",
          fxRateDate,
          ...(validUntil === "" ? {} : { validUntil }),
          ...(addressee === null ? {} : { addressedToPartyId: addressee }),
        },
      });
      if (drafted.error) {
        setError(apiError(drafted.error).message);
        return;
      }
      router.push(`/proposals/${drafted.data.id}/build?step=services` as Route);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <form
      onSubmit={(e) => {
        void next(e);
      }}
      className="flex flex-col gap-6"
    >
      <ErrorNotice error={error} />

      {/* ── Who it is for ─────────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Who is it for?</CardTitle>
        {draft !== null ? (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-lg font-semibold">{draft.party.displayName}</p>
            <p className="text-sm text-muted">
              A draft stays with the client it was started for. For somebody else,{" "}
              <Link href="/proposals/new">start a new proposal</Link>.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
              <legend className="sr-only">Existing client or new prospect</legend>
              <Choice
                name="who"
                checked={who === "existing"}
                onChange={() => {
                  setWho("existing");
                  setCountry(client?.registeredIn ?? "");
                }}
                title="Existing client"
                note="Somebody already in your client list."
              />
              <Choice
                name="who"
                checked={who === "prospect"}
                onChange={() => {
                  setWho("prospect");
                  setCountry("");
                }}
                title="New prospect"
                note="A company you are quoting for the first time. It becomes a lead."
              />
            </fieldset>

            {who === "existing" ? (
              client === null ? (
                <Field label="Client">
                  <ClientPicker
                    clients={book}
                    autoFocus={prefillClientId === null && prefillLeadId === null}
                    onPick={(c) => {
                      void choose(c.id, c.name, null);
                    }}
                  />
                </Field>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunk px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-sm text-muted">
                      {client.registeredIn === null
                        ? "No registration recorded on the client's page."
                        : `Registered in ${countryName(client.registeredIn)}.`}{" "}
                      {client.people.length === 0
                        ? "Nobody recorded at the client yet."
                        : `${String(client.people.length)} ${client.people.length === 1 ? "person" : "people"} on file.`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setClient(null);
                      setLeadId(null);
                      setAddresseeId("");
                    }}
                  >
                    Change
                  </Button>
                </div>
              )
            ) : (
              <FieldStack>
                <FieldRow>
                  <Field label="Company">
                    <Input
                      value={prospect.company}
                      required
                      autoFocus
                      onChange={(e) => {
                        editProspect({ company: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Country">
                    <CountrySelect
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                      }}
                    />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Contact person">
                    <Input
                      value={prospect.contact}
                      required
                      onChange={(e) => {
                        editProspect({ contact: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Designation" optional>
                    <Input
                      value={prospect.designation}
                      placeholder="Finance Director"
                      onChange={(e) => {
                        editProspect({ designation: e.target.value });
                      }}
                    />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={prospect.email}
                      required
                      onChange={(e) => {
                        editProspect({ email: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Phone" optional>
                    <Input
                      type="tel"
                      value={prospect.phone}
                      placeholder="+91 98100 12345"
                      onChange={(e) => {
                        editProspect({ phone: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="How they came to you">
                    <Select
                      value={prospect.source}
                      onChange={(e) => {
                        const s = LEAD_SOURCES.find((x) => x === e.target.value);
                        if (s !== undefined) editProspect({ source: s });
                      }}
                    >
                      {LEAD_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_WORDS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FieldRow>
                <p className="text-sm text-muted">
                  Next adds them to your pipeline as a lead, with this proposal linked to it. If the
                  email or phone is already on file, the lead they already have is used.
                </p>
                {who === "prospect" && landed?.matched !== null && landed !== null && (
                  <Notice tone="warn" eyebrow="Already on file">
                    <p>
                      The email or phone you typed belongs to <strong>{landed.matched}</strong>, which is
                      already in your records. Next continues with them: the proposal is for{" "}
                      {landed.matched}, on their lead, and {prospect.contact.trim() || "the contact"} is added
                      to their people. To quote a different company, change the email and phone.
                    </p>
                  </Notice>
                )}
              </FieldStack>
            )}

            {who === "existing" && client !== null && (
              <Field
                label="Where the client is"
                hint={
                  client.registeredIn === null
                    ? "Decides which of your companies issues it, and which country's standard wording it carries."
                    : "From the client's registration. Decides which of your companies issues it."
                }
              >
                <CountrySelect
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                  }}
                />
              </Field>
            )}
          </div>
        )}
      </Card>

      {/* ── Who offers it, and in what money ─────────────────────────── */}
      <Card>
        <CardTitle level={2}>Issued by</CardTitle>
        <div className="mt-3">
          <FieldStack>
            <FieldRow>
              <Field
                label="Your company"
                hint={
                  draft !== null
                    ? issuerChanged
                      ? "Next replaces this proposal's exclusions, commercials and team with this company's standard set."
                      : "Changing it gives the proposal that company's standard wording."
                    : issuerPick !== null
                      ? "Chosen by you."
                      : whereKey !== null && firm?.routes.has(whereKey) === true
                        ? `Your rule for clients in ${countryName(whereKey)}.`
                        : "Your rule for every other country."
                }
              >
                <Select
                  value={issuerId}
                  onChange={(e) => {
                    setIssuerPick(e.target.value);
                    setAskReplace(false);
                    // D1: choosing the company chooses its currency, while
                    // nothing on the proposal is priced yet.
                    if (!currencyLocked) {
                      setCurrencyPick(null);
                      setRatePick(null);
                      setDatePick(null);
                    }
                  }}
                >
                  {(firm?.entities ?? []).map((e) => (
                    <option key={e.partyId} value={e.partyId}>
                      {e.name}
                      {e.jurisdiction === null ? "" : `, ${countryName(e.jurisdiction)}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Currency"
                hint={
                  currencyLocked
                    ? `Every service on it is priced in ${currency}. Remove them to quote in another currency.`
                    : issuer === null
                      ? undefined
                      : currency === issuer.defaultCurrency
                        ? `${issuer.name} quotes in ${issuer.defaultCurrency}.`
                        : `${issuer.name} usually quotes in ${issuer.defaultCurrency}.`
                }
              >
                <Select
                  value={currency}
                  disabled={currencyLocked}
                  onChange={(e) => {
                    setCurrencyPick(e.target.value);
                    setRatePick(null);
                    setDatePick(null);
                  }}
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>

            {foreign && (
              <FieldRow>
                <Field
                  label={`1 ${currency} is how many ${reporting}`}
                  hint={
                    draft !== null && !moneyChanged
                      ? "The rate this proposal was quoted at. Correct it here if it was wrong."
                      : known === undefined
                        ? `Your books are in ${reporting}, so a ${currency} proposal records the rate it was quoted at.`
                        : `Your last ${currency} rate, from ${known.ref} (${longDay(known.on)}). Change it if it has moved.`
                  }
                >
                  <Input
                    inputMode="decimal"
                    value={fxRate}
                    required
                    placeholder="22.75"
                    onChange={(e) => {
                      setRatePick(e.target.value.replace(/[,\s]/g, ""));
                    }}
                  />
                </Field>
                <Field label="Rate as of">
                  <Input
                    type="date"
                    value={fxRateDate}
                    required
                    onChange={(e) => {
                      setDatePick(e.target.value);
                    }}
                  />
                </Field>
              </FieldRow>
            )}

            {askReplace && issuerChanged && (
              <Notice tone="warn" eyebrow="Replace this proposal's wording?">
                <p>
                  {ownProse} {ownProse === 1 ? "line" : "lines"} of its exclusions, commercials or
                  team {ownProse === 1 ? "was" : "were"} written or edited for this client. Changing
                  the issuer replaces all of its wording with the standard set of{" "}
                  {issuer?.name ?? "the new company"}, and those lines are lost.
                </p>
                <div className="cluster mt-2">
                  <Button
                    type="button"
                    variant="destructive-quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void save(true);
                    }}
                  >
                    {ownProse === 1 ? "Replace it and continue" : "Replace them and continue"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIssuerPick(draft?.proposal.issuingEntityPartyId ?? null);
                      setAskReplace(false);
                    }}
                  >
                    Keep {draft?.issuingEntity.displayName ?? "the issuer"}
                  </Button>
                </div>
              </Notice>
            )}
          </FieldStack>
        </div>
      </Card>

      {/* ── The cover ─────────────────────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>The proposal</CardTitle>
        <div className="mt-3">
          <FieldStack>
            <Field label="Title">
              <Input
                value={title}
                required
                maxLength={300}
                onChange={(e) => {
                  setTitlePick(e.target.value);
                }}
              />
            </Field>
            <FieldRow>
              <Field
                label="Prepared for"
                hint={
                  who === "prospect" && draft === null
                    ? "The contact person above."
                    : people.length === 0
                      ? "Nobody is recorded at this client yet, so the cover names the company. Add a person on the client's page to name them."
                      : "Printed on the cover, and where Send offers to email it."
                }
              >
                {who === "prospect" && draft === null ? (
                  <Input value={prospect.contact} readOnly tabIndex={-1} />
                ) : (
                  <Select
                    value={addresseeId}
                    onChange={(e) => {
                      setAddresseeId(e.target.value);
                    }}
                  >
                    <option value="">Nobody named (the company)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Valid until" optional hint="Leave it empty if the offer has no end date.">
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => {
                    setValidUntil(e.target.value);
                  }}
                />
              </Field>
            </FieldRow>
            <p className="text-sm text-muted">
              Prepared by you
              {session?.displayName === null || session?.displayName === undefined
                ? ""
                : `, ${session.displayName}`}
              .
            </p>
          </FieldStack>
        </div>
      </Card>

      <StickyFooter
        summary={
          clientName === "" ? (
            <span className="text-muted">Choose who it is for.</span>
          ) : (
            <span>
              <strong>{clientName}</strong>
              {issuer !== null && <span className="text-muted"> · issued by {issuer.name}</span>}
              {currency !== "" && <span className="text-muted"> · {currency}</span>}
            </span>
          )
        }
      >
        <LinkButton
          variant="ghost"
          href={(draft === null ? "/proposals" : `/proposals/${draft.proposal.id}`) as Route}
        >
          {draft === null ? "Cancel" : "Back to the proposal"}
        </LinkButton>
        <Button
          type="submit"
          loading={busy}
          disabled={busy || (draft === null && who === "existing" && client === null)}
        >
          {who === "prospect" && landed?.matched !== null && landed !== null
            ? `Next: continue with ${landed.matched}`
            : "Next: Services"}
        </Button>
      </StickyFooter>
    </form>
  );
}

/** One of two large choices, a real radio underneath. */
function Choice({
  name,
  checked,
  onChange,
  title,
  note,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  note: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
        checked ? "border-ring bg-surface-sunk" : "border-line hover:bg-surface-hover",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-sm text-muted">{note}</span>
      </span>
    </label>
  );
}

/** "1.0000000000" as a person writes it. */
function trimRate(rate: string): string {
  return rate.includes(".") ? rate.replace(/\.?0+$/, "") : rate;
}

/** The calendar day before a `YYYY-MM-DD`, done on the string's own parts. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map((n) => Number.parseInt(n, 10));
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
  return utc.toISOString().slice(0, 10);
}
