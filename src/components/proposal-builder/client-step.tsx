"use client";

import { fxSuggestion, type FxSuggestion } from "@/lib/fx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError, CONTACT_ROLE_OPTIONS, formatCount, LEAD_SOURCES } from "@/lib/api/client";
import type { ContactRole, LeadSource, ProposalRecord } from "@/lib/api/client";
import { Card } from "@/components/tw";
import {
  Button,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  LinkButton,
  Notice,
  Select,
  AmountInput,
} from "@/components/ui";
import { useSession } from "@/components/layout";
import { CountrySelect } from "@/components/country-select";
import { EntityKindSelect } from "@/components/entity-kind-select";
import { YearEndField } from "@/components/year-end-field";
import { PhoneInput } from "@/components/phone-input";
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
  readonly kind: "organization" | "person";
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
    // Nothing preselected (F13): it defaulted to Referral.
    source: "" as LeadSource | "",
  });
  /** Adding a person at an existing client or lead from inside the wizard
   *  (CA#43): it used to say "Nobody recorded at the client yet" and stop. */
  const [newPerson, setNewPerson] = useState({ name: "", role: "" as ContactRole | "" });
  const [addingPerson, setAddingPerson] = useState(false);
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
      : formatCount(draft.proposal.fxRate),
  );
  const [datePick, setDatePick] = useState<string | null>(draft?.proposal.fxRateDate ?? null);
  const [rateOpen, setRateOpen] = useState(false);
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
        // THE FIRM'S OWN COMPANIES ARE NOT CLIENTS: the API refuses a
        // proposal to one (CLIENT_IS_OWN_COMPANY), and the firm sorts above
        // every client in an alphabetical list.
        const own = new Set(entities.entities.map((e) => e.partyId));
        setBook(
          parties.data.parties
            .filter((p) => !p.isOwnCompany && !own.has(p.id))
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
          if (r !== null && !known.has(c)) known.set(c, { rate: formatCount(r), on: d, ref });
        }
        setRates(known);
      }
      setLoaded(true);
    })();
    // Read once. The prefills below run after this has answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Read a client's registration and its people, and fill in what follows. */
  async function choose(
    id: string,
    name: string,
    leadCountry: string | null,
    prefilled = false,
  ): Promise<void> {
    setError(null);
    const [profile, structure] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId: id } } }),
      api.GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: id } } }),
    ]);
    if (profile.error) {
      setError(apiError(profile.error).message);
      return;
    }
    // A link that named one of the firm's own companies: not chosen, and said
    // in the API's own words, since Next would be refused.
    if (prefilled && profile.data.party.isOwnCompany) {
      setError(
        `${profile.data.party.displayName} is one of your own companies, so it cannot be the ` +
          `client on a proposal. Choose the client the quote is for.`,
      );
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
      kind: profile.data.party.kind,
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
        await choose(prefillClientId, "", null, true);
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
  // A NEW proposal's rate (0345): the feed's for today first, then the
  // firm's last one. A draft keeps the rate saved on it.
  const [feedRate, setFeedRate] = useState<{ code: string; s: FxSuggestion | null } | null>(null);
  const wantFeed = draft === null && foreign;
  useEffect(() => {
    if (!wantFeed) return;
    void fxSuggestion(currency, browserDay()).then((s) => {
      setFeedRate({ code: currency, s });
    });
  }, [wantFeed, currency]);
  const fromFeed = wantFeed && feedRate?.code === currency ? feedRate.s : null;
  const lastUsed = rates.get(currency);
  const known =
    fromFeed === null ? lastUsed : { rate: fromFeed.rate, on: fromFeed.on, ref: fromFeed.source, feed: true as const };
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
  // Held only by services priced IN it (0344): ones in another rated
  // currency do not stop the main currency moving.
  const currencyLocked = draft !== null && draft.lines.some((l) => l.currency === draft.proposal.currency);
  const issuerChanged = draft !== null && issuerId !== draft.proposal.issuingEntityPartyId;
  const moneyChanged =
    draft !== null &&
    (currency !== draft.proposal.currency ||
      (foreign && fxRate !== formatCount(draft.proposal.fxRate ?? "")) ||
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

  /** A chosen company with no country or kind on file: registered on Next. */
  const unregistered =
    draft === null && who === "existing" && client?.kind === "organization" && client.registeredIn === null;
  /** Opened from a lead, and still on that lead's company (CA#43). */
  const fromLead = draft === null && prefillLeadId !== null && leadId !== null;
  /** Recording a person at the client takes party:write. */
  const canAddPeople = session?.permissions.includes("party:write") === true;
  /** "+ Add a person" picked in Prepared for: a small dialog, so adding the
   *  addressee never spreads a form across the step (CA#43, 2026-10-10). */
  const [personOpen, setPersonOpen] = useState(false);
  const personName = useRef<HTMLInputElement>(null);
  // A native dialog focuses its first control, the close button; the name is
  // what the reader came to type.
  useEffect(() => {
    if (personOpen) requestAnimationFrame(() => personName.current?.focus());
  }, [personOpen]);

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

  /** Record a person at the chosen client, in a contact's role, and name them
   *  on the cover (CA#43). The same two writes the client page makes. */
  async function addPerson(): Promise<void> {
    if (client === null) return;
    const name = newPerson.name.trim();
    if (name === "" || newPerson.role === "") {
      setError("Give the person's name and their role at the client.");
      return;
    }
    setAddingPerson(true);
    setError(null);
    const person = await api.POST("/api/v1/parties/persons", { body: { fullName: name } });
    if (person.error) {
      setAddingPerson(false);
      setError(apiError(person.error).message);
      return;
    }
    const tie = await api.POST("/api/v1/parties/relationships", {
      body: {
        fromPartyId: person.data.partyId,
        toPartyId: client.id,
        type: newPerson.role,
        // Yesterday, as above: "today" is not yet today for every reader.
        validFrom: dayBefore(browserDay()),
      },
    });
    setAddingPerson(false);
    if (tie.error) {
      setError(apiError(tie.error).message);
      return;
    }
    const added = { id: person.data.partyId, name };
    setClient({ ...client, people: [...client.people, added] });
    setAddresseeId(added.id);
    setNewPerson({ name: "", role: "" });
    setPersonOpen(false);
  }

  /**
   * A company is quoted only once its country and kind are on file (Q076), and
   * a lead records neither. So the step registers it here, from the fields
   * beside the name, rather than sending the reader to the client page.
   */
  async function ensureRegistered(partyId: string, form: FormData): Promise<boolean> {
    const profile = await api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId } } });
    if (profile.error) {
      setError(apiError(profile.error).message);
      return false;
    }
    if (profile.data.party.kind !== "organization" || profile.data.legalEntities.length > 0) return true;
    const entityType = String(form.get("entityType") ?? "").trim();
    const financialYearEnd = String(form.get("financialYearEnd") ?? "").trim();
    if (whereKey === null || entityType === "") {
      setError(`Choose the country ${profile.data.party.displayName} is registered in and its kind of company.`);
      return false;
    }
    const registered = await api.POST("/api/v1/parties/organizations/{partyId}/legal-entities", {
      params: { path: { partyId } },
      body: {
        jurisdiction: whereKey,
        entityType,
        ...(financialYearEnd === "" ? {} : { financialYearEnd }),
      },
    });
    if (registered.error) {
      setError(apiError(registered.error).message);
      return false;
    }
    if (client?.id === partyId) setClient({ ...client, registeredIn: whereKey });
    return true;
  }

  async function captureLead(): Promise<{ id: string; partyId: string; matched: string | null } | null> {
    if (prospect.source === "") {
      setError("Choose how they came to you.");
      return null;
    }
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

  async function next(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
      if (!(await ensureRegistered(partyId, form))) return;

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

      {/* ONE FORM, ONE CARD (2026-10-10): who it is for, who issues it and
          the cover, without a card and a heading each, so step 1 fits a
          laptop's screen without a scroll. */}
      <Card className="form-card hints-on-focus">
        <div className="flex flex-col gap-5">
        {draft !== null ? (
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">{draft.party.displayName}</p>
            {/* A draft stays with the client it was started for. */}
            <p className="text-sm text-muted">
              Wrong client? <Link href="/proposals/new">Start a new proposal</Link>.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">Existing client or new prospect</legend>
              {/* Opened from a LEAD, the company is the lead's prospect, not
                  somebody "already in your client list" (CA#43). */}
              <Choice
                name="who"
                checked={who === "existing"}
                onChange={() => {
                  setWho("existing");
                  setCountry(client?.registeredIn ?? "");
                }}
                title={fromLead ? "From your pipeline" : "Existing client"}
                note={fromLead ? "The lead you started from." : "Already in your client list."}
              />
              <Choice
                name="who"
                checked={who === "prospect"}
                onChange={() => {
                  setWho("prospect");
                  setCountry("");
                }}
                title="New prospect"
                note="Quoting for the first time. Becomes a lead."
              />
            </fieldset>

            {who === "existing" ? (
              /* ONE BOX (2026-10-10): the chosen client's name sits in the
                 picker itself, and a click on it lists the others. There was
                 a summary panel with a Change button. */
              <Field label="Client" hint="Type a name to find them in your clients.">
                <ClientPicker
                  clients={book}
                  selected={client?.name}
                  autoFocus={client === null && prefillClientId === null && prefillLeadId === null}
                  onPick={(c) => {
                    if (client !== null && c.id !== client.id) setLeadId(null);
                    void choose(c.id, c.name, null);
                  }}
                />
              </Field>
            ) : (
              <FieldStack>
                <FieldRow>
                  <Field label="Company" hint="Their registered company name.">
                    <Input
                      value={prospect.company}
                      required
                      autoFocus
                      placeholder="e.g. Kaveri Foods Pvt Ltd"
                      onChange={(e) => {
                        editProspect({ company: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Country" hint="Where their company is registered.">
                    <CountrySelect
                      value={country}
                      required
                      onChange={(e) => {
                        setCountry(e.target.value);
                      }}
                    />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Company type">
                    <EntityKindSelect name="entityType" required />
                  </Field>
                  <YearEndField country={country} />
                </FieldRow>
                <FieldRow>
                  <Field label="Contact person" hint="Who you deal with at the company.">
                    <Input
                      value={prospect.contact}
                      required
                      placeholder="e.g. Asha Verma"
                      onChange={(e) => {
                        editProspect({ contact: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Designation" optional hint="Their role at the company.">
                    <Input
                      value={prospect.designation}
                      placeholder="e.g. Finance Director"
                      onChange={(e) => {
                        editProspect({ designation: e.target.value });
                      }}
                    />
                  </Field>
                </FieldRow>
                <FieldRow>
                  <Field label="Email" hint="The proposal is emailed here.">
                    <Input
                      type="email"
                      value={prospect.email}
                      required
                      placeholder="e.g. asha@kaverifoods.in"
                      onChange={(e) => {
                        editProspect({ email: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="Phone" optional hint="For calls and WhatsApp.">
                    <PhoneInput
                      value={prospect.phone}
                      country={whereKey}
                      placeholder="e.g. 98100 12345"
                      onChange={(phone) => {
                        editProspect({ phone });
                      }}
                    />
                  </Field>
                  <Field label="How they came to you" hint="Shows you which channels bring in work.">
                    <Select
                      value={prospect.source}
                      required
                      onChange={(e) => {
                        const s = LEAD_SOURCES.find((x) => x === e.target.value);
                        if (s !== undefined) editProspect({ source: s });
                      }}
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {LEAD_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_WORDS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </FieldRow>
                {/* A known email or phone reuses the lead they already have (the
                    Notice below says so when it happens). */}
                <p className="text-sm text-muted">They join your pipeline as a new lead.</p>
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

          </div>
        )}

        {/* Where the client is, who offers it, and in what money: one row,
            since the first decides the other two. */}
        <div>
          <FieldStack>
            <FieldRow>
            {who === "existing" && client !== null && (
              <Field label="Where the client is" hint="Decides which of your companies sends it.">
                <CountrySelect
                  value={country}
                  required={unregistered}
                  onChange={(e) => {
                    setCountry(e.target.value);
                  }}
                />
              </Field>
            )}
            {unregistered && (
              <>
                <Field label="Company type">
                  <EntityKindSelect name="entityType" required />
                </Field>
                <YearEndField country={country} />
              </>
            )}
              <Field
                label="Your company"
                hint={
                  draft !== null
                    ? issuerChanged
                      ? "Its standard wording comes in when you click Next."
                      : "Sends the proposal and sets its standard wording."
                    : issuerPick !== null
                      ? "You picked this one."
                      : whereKey !== null && firm?.routes.has(whereKey) === true
                        ? `Your usual company for ${countryName(whereKey)}.`
                        : "Your usual company for other countries."
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
                    ? `Locked to ${currency} while services are priced in it.`
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

            {/* ONE LINE WHEN THE RATE IS KNOWN (2026-10-12): the feed's or the
                last one used fills it, so the two boxes open only on Change. */}
            {foreign && fxRate !== "" && !rateOpen && (
              <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm">
                <span className="text-ink-2">
                  1 {currency} = <span className="tabular-nums">{shortRate(fxRate)}</span> {reporting}
                </span>
                <span className="text-muted">· {longDay(fxRateDate)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRateOpen(true);
                  }}
                >
                  Change rate
                </Button>
              </p>
            )}
            {foreign && (fxRate === "" || rateOpen) && (
              <FieldRow>
                <Field
                  label={`1 ${currency} is how many ${reporting}`}
                  hint={
                    draft !== null && !moneyChanged
                      ? "The rate this proposal was quoted at."
                      : known === undefined
                        ? `Your books are kept in ${reporting}.`
                        : "feed" in known
                          ? `${known.ref} rate, ${longDay(known.on)}.`
                          : `Your last rate, on ${known.ref} (${longDay(known.on)}).`
                  }
                >
                  <AmountInput decimals={10}
                    value={fxRate}
                    required
                    placeholder="e.g. 22.75"
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

        {/* The cover. */}
        <div>
          <FieldStack>
            <FieldRow>
              <Field label="Title" hint="The heading on the proposal's cover.">
                <Input
                  value={title}
                  required
                  maxLength={300}
                  placeholder="e.g. Monthly books and GST"
                  onChange={(e) => {
                    setTitlePick(e.target.value);
                  }}
                />
              </Field>
              <Field
                label="Prepared for"
                hint={
                  who === "prospect" && draft === null
                    ? "The contact you typed above."
                    : people.length === 0
                      ? canAddPeople
                        ? "Nobody on file yet. Add someone from the list."
                        : "Nobody on file, so the cover shows the company name."
                      : "Named on the cover and emailed."
                }
              >
                {who === "prospect" && draft === null ? (
                  <Input value={prospect.contact} readOnly tabIndex={-1} />
                ) : (
                  <Select
                    value={addresseeId}
                    onChange={(e) => {
                      if (e.target.value === ADD_PERSON) {
                        setPersonOpen(true);
                        return;
                      }
                      setAddresseeId(e.target.value);
                    }}
                  >
                    <option value="">Nobody named (the company)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {canAddPeople && client !== null && <option value={ADD_PERSON}>+ Add a person…</option>}
                  </Select>
                )}
              </Field>
              <Field label="Valid until" optional hint="Leave empty if the offer does not expire.">
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
              Prepared by{" "}
              <span className="font-semibold text-ink">
                {session?.displayName === null || session?.displayName === undefined
                  ? "you"
                  : `${session.displayName} (you)`}
              </span>
            </p>
          </FieldStack>
        </div>
        </div>
      </Card>

      {client !== null && (
        <Dialog
          open={personOpen}
          onClose={() => {
            setPersonOpen(false);
          }}
          title={`Add a person at ${client.name}`}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPersonOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="button" loading={addingPerson} onClick={() => void addPerson()}>
                Add
              </Button>
            </>
          }
        >
          <FieldRow>
            <Field label="Name">
              <Input
                ref={personName}
                value={newPerson.name}
                placeholder="e.g. Ravi Kumar"
                onChange={(e) => {
                  setNewPerson({ ...newPerson, name: e.target.value });
                }}
              />
            </Field>
            <Field label="Their role">
              <Select
                value={newPerson.role}
                onChange={(e) => {
                  setNewPerson({ ...newPerson, role: e.target.value as ContactRole });
                }}
              >
                <option value="">Choose…</option>
                {CONTACT_ROLE_OPTIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>
          {personOpen && <ErrorNotice error={error} />}
        </Dialog>
      )}

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

/** The "Prepared for" option that opens the add-a-person dialog. */
const ADD_PERSON = "__add_person";

/** One of two choices, a real radio underneath. */
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
    /* A compact choice (2026-10-10): the title on a pill, what it means in
       its tooltip. It was a large card with a sentence under each title. */
    <label
      title={note}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
        checked ? "border-ink bg-surface-sunk font-semibold text-ink" : "border-line text-ink-2 hover:bg-surface-hover",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>{title}</span>
    </label>
  );
}

/** The calendar day before a `YYYY-MM-DD`, done on the string's own parts. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split("-").map((n) => Number.parseInt(n, 10));
  const utc = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
  return utc.toISOString().slice(0, 10);
}

/** A rate for reading: four places at most, trailing zeros dropped. Split as
 *  a string, so nothing is rounded through a float. */
function shortRate(rate: string): string {
  const [whole, frac = ""] = rate.split(".");
  const cut = frac.slice(0, 4).replace(/0+$/, "");
  return cut === "" ? (whole ?? rate) : `${whole ?? ""}.${cut}`;
}
