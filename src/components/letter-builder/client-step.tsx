"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError, formatCount } from "@/lib/api/client";
import type { LetterRecord } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Card, CardTitle } from "@/components/tw";
import {
  Button,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  LinkButton,
  Notice,
  Select,
  Textarea,
  AmountInput,
} from "@/components/ui";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { browserDay, longDay } from "@/lib/day";
import { ClientPicker } from "@/components/proposal-builder/client-picker";
import type { PickableClient } from "@/components/proposal-builder/client-picker";
import { StickyFooter } from "@/components/proposal-builder/frame";
import { issuerFor, loadFirmEntities } from "@/components/proposal-builder/data";
import type { FirmEntities, FirmEntity } from "@/components/proposal-builder/data";
import { defaultTitle } from "./data";

type ReviseBody = components["schemas"]["ReviseEngagementLetterRequest"];

interface Person {
  readonly id: string;
  readonly name: string;
}

interface ChosenClient {
  readonly id: string;
  readonly name: string;
  /** Where the client is registered, when its page records it. */
  readonly registeredIn: string | null;
  readonly people: readonly Person[];
}

interface KnownRate {
  readonly rate: string;
  readonly on: string;
  readonly ref: string;
}

/** A signed letter of this client that nothing has replaced yet. */
interface Replaceable {
  readonly id: string;
  readonly ref: string;
}

/**
 * STEP 1 of the letter builder (T6.18 S6): who the letter is for, the country
 * whose law it is under, which of the firm's companies issues it, the money,
 * and page one's facts.
 *
 * Every box the firm's records can answer is answered before anybody presses:
 * the client from the page it was opened on, the country from the client's
 * registration, the issuer from the firm's rule for that country (D4), the
 * currency from that company (D1), the title and the addressee from the client.
 * So for an existing client the step is one press of Next.
 *
 * On a DRAFT the client is fixed. The issuer and the country can change until
 * a term is on the letter (each term was checked against the old issuer's
 * law), and a change replaces the letter's wording with that company's
 * standard set, after asking when some was written for this client (D9). The
 * currency can change while nothing on the letter is priced.
 */
export function LetterClientStep({
  draft,
  prefillClientId,
  onSaved,
}: {
  draft: LetterRecord | null;
  prefillClientId: string | null;
  onSaved?: (record: LetterRecord) => void;
}) {
  const router = useRouter();
  const [firm, setFirm] = useState<FirmEntities | null>(null);
  const [book, setBook] = useState<PickableClient[]>([]);
  const [rates, setRates] = useState<ReadonlyMap<string, KnownRate>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [client, setClient] = useState<ChosenClient | null>(null);
  const [replaceable, setReplaceable] = useState<readonly Replaceable[]>([]);
  const [country, setCountry] = useState(draft?.letter.jurisdiction ?? "");
  const [issuerPick, setIssuerPick] = useState<string | null>(draft?.letter.issuingEntityPartyId ?? null);
  const [currencyPick, setCurrencyPick] = useState<string | null>(draft?.letter.currency ?? null);
  const [ratePick, setRatePick] = useState<string | null>(
    draft?.letter.fxRate == null ? null : formatCount(draft.letter.fxRate),
  );
  const [datePick, setDatePick] = useState<string | null>(draft?.letter.fxRateDate ?? null);
  const [titlePick, setTitlePick] = useState<string | null>(draft?.letter.title ?? null);
  const [addresseeId, setAddresseeId] = useState(draft?.letter.addressedToPartyId ?? "");
  const [background, setBackground] = useState(draft?.letter.background ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(draft?.letter.effectiveFrom ?? "");
  const [advance, setAdvance] = useState(draft?.letter.advanceRequired ?? false);
  const [advanceAmount, setAdvanceAmount] = useState(
    draft?.letter.advanceAmount == null ? "" : formatCount(draft.letter.advanceAmount),
  );
  const [supersedesId, setSupersedesId] = useState("");
  const [askReplace, setAskReplace] = useState(false);

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
        // The firm's own companies are not clients (the API refuses a letter
        // to one: CLIENT_IS_OWN_COMPANY).
        const own = new Set(entities.entities.map((e) => e.partyId));
        setBook(
          parties.data.parties
            .filter((p) => !p.isOwnCompany && !own.has(p.id))
            .map((p) => ({ id: p.id, name: p.displayName, kind: p.kind })),
        );
      }
      if (proposals.data) {
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
    // Read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The client's registration, its people and its signed letters. */
  async function choose(id: string, name: string, prefilled = false): Promise<void> {
    setError(null);
    const [profile, structure, letters] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId: id } } }),
      api.GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: id } } }),
      draft === null
        ? api.GET("/api/v1/engagement-letters", { params: { query: { partyId: id } } })
        : Promise.resolve(null),
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
          `client on an engagement letter. Choose the client the letter is for.`,
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
      people,
    };
    setClient(chosen);
    if (letters?.data) {
      const all = letters.data.letters;
      const replaced = new Set(
        all
          .filter((l) => l.letter.status !== "withdrawn")
          .map((l) => l.letter.supersedesId)
          .filter((x): x is string => x !== null),
      );
      setReplaceable(
        all
          .filter((l) => l.letter.status === "signed" && !replaced.has(l.letter.id))
          .map((l) => ({ id: l.letter.id, ref: l.letter.ref })),
      );
    }
    if (draft === null) {
      setCountry(chosen.registeredIn ?? "");
      setAddresseeId(people[0]?.id ?? "");
    }
  }

  useEffect(() => {
    if (!loaded || firm === null) return;
    void (async () => {
      if (draft !== null) await choose(draft.party.id, draft.party.displayName);
      else if (prefillClientId !== null) await choose(prefillClientId, "", true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, firm]);

  // ── What follows from what ───────────────────────────────────────────────
  const whereKey = country === "" ? null : country;
  const suggested: FirmEntity | null = firm === null ? null : issuerFor(firm, whereKey);
  const issuerId = issuerPick ?? suggested?.partyId ?? "";
  const issuer = firm?.entities.find((e) => e.partyId === issuerId) ?? null;
  const currency = currencyPick ?? issuer?.defaultCurrency ?? "";
  const clientName = client?.name ?? draft?.party.displayName ?? "";
  const title = titlePick ?? defaultTitle(clientName);
  const reporting = firm?.reportingCurrency ?? currency;
  const foreign = currency !== "" && currency !== reporting;
  const known = rates.get(currency);
  const fxRate = foreign ? (ratePick ?? known?.rate ?? "") : "1";
  const fxRateDate =
    datePick ?? (foreign && ratePick === null && known !== undefined ? known.on : browserDay());

  // ── On a draft ────────────────────────────────────────────────────────────
  const priced = draft !== null && (draft.lines.length > 0 || draft.feeGroups.length > 0);
  const termsOn = draft?.clauses.length ?? 0;
  const issuerChanged = draft !== null && issuerId !== draft.letter.issuingEntityPartyId;
  const countryChanged = draft !== null && country !== draft.letter.jurisdiction;
  const moneyChanged =
    draft !== null &&
    (currency !== draft.letter.currency ||
      (foreign && fxRate !== formatCount(draft.letter.fxRate ?? "")) ||
      fxRateDate !== draft.letter.fxRateDate);
  const ownProse = (draft?.blocks ?? []).filter((b) => b.isEdited || b.sourceId === null).length;

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const e of firm?.entities ?? []) set.add(e.defaultCurrency);
    set.add(reporting);
    if (currency !== "") set.add(currency);
    return [...set].sort();
  }, [firm, reporting, currency]);

  const people = client?.people ?? [];

  async function save(replaceEditedProse: boolean): Promise<void> {
    if (draft === null) return;
    const letter = draft.letter;
    // Only what changed: absent means "leave it", null clears.
    const body: ReviseBody = {};
    if (title.trim() !== letter.title) body.title = title.trim();
    if ((addresseeId || null) !== letter.addressedToPartyId) body.addressedToPartyId = addresseeId || null;
    if ((background.trim() || null) !== letter.background) body.background = background.trim() || null;
    if ((effectiveFrom || null) !== letter.effectiveFrom) body.effectiveFrom = effectiveFrom || null;
    const amount = advance ? advanceAmount.replace(/[,\s]/g, "") : "";
    if (advance !== letter.advanceRequired || (advance && formatCount(letter.advanceAmount ?? "") !== amount)) {
      body.advanceRequired = advance;
      body.advanceAmount = advance ? amount : null;
    }
    if (countryChanged) body.jurisdiction = country;
    if (issuerChanged) body.issuingEntityPartyId = issuerId;
    if ((countryChanged || issuerChanged) && replaceEditedProse) body.replaceEditedProse = true;
    if (moneyChanged) {
      body.currency = currency;
      body.fxRate = foreign ? fxRate.trim() : "1";
      body.fxRateDate = fxRateDate;
    }
    const next = `/engagement-letters/${letter.id}/build?step=services` as Route;
    if (Object.keys(body).length === 0) {
      router.push(next);
      return;
    }
    setBusy(true);
    setError(null);
    const saved = await api.PATCH("/api/v1/engagement-letters/{letterId}", {
      params: { path: { letterId: letter.id } },
      body,
    });
    setBusy(false);
    if (saved.error) {
      if (apiError(saved.error).reason === "PROSE_EDITED") {
        setAskReplace(true);
        return;
      }
      setError(apiError(saved.error).message);
      return;
    }
    onSaved?.(saved.data);
    router.push(next);
  }

  async function next(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (draft !== null) {
      if ((issuerChanged || countryChanged) && ownProse > 0) {
        setAskReplace(true);
        return;
      }
      await save(false);
      return;
    }
    if (client === null) {
      setError("Choose the client this letter is for.");
      return;
    }
    setBusy(true);
    setError(null);
    const amount = advanceAmount.replace(/[,\s]/g, "");
    const drafted = await api.POST("/api/v1/engagement-letters", {
      body: {
        partyId: client.id,
        jurisdiction: country,
        ...(issuerId === "" ? {} : { issuingEntityPartyId: issuerId }),
        title: title.trim(),
        currency,
        fxRate: foreign ? fxRate.trim() : "1",
        fxRateDate,
        advanceRequired: advance,
        ...(advance && amount !== "" ? { advanceAmount: amount } : {}),
        ...(background.trim() === "" ? {} : { background: background.trim() }),
        ...(addresseeId === "" ? {} : { addressedToPartyId: addresseeId }),
        ...(effectiveFrom === "" ? {} : { effectiveFrom }),
        ...(supersedesId === "" ? {} : { supersedesId }),
      },
    });
    setBusy(false);
    if (drafted.error) {
      setError(apiError(drafted.error).message);
      return;
    }
    router.push(`/engagement-letters/${drafted.data.id}/build?step=services` as Route);
  }

  if (!loaded) return <p className="text-muted">Loading…</p>;

  const lockedCountry = termsOn > 0;

  return (
    <form
      onSubmit={(e) => {
        void next(e);
      }}
      className="flex flex-col gap-6"
    >
      <ErrorNotice error={error} />

      <Card>
        <CardTitle level={2}>Client</CardTitle>
        <div className="mt-3 flex flex-col gap-4">
          {draft !== null ? (
            <p className="text-lg font-semibold">{draft.party.displayName}</p>
          ) : client === null ? (
            <Field label="Client">
              <ClientPicker
                clients={book}
                autoFocus={prefillClientId === null}
                onPick={(c) => {
                  void choose(c.id, c.name);
                }}
              />
            </Field>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunk px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{client.name}</p>
                <p className="text-sm text-muted">
                  {client.registeredIn === null
                    ? "No registration on file."
                    : `Registered in ${countryName(client.registeredIn)}.`}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setClient(null);
                  setAddresseeId("");
                  setReplaceable([]);
                  setSupersedesId("");
                }}
              >
                Change
              </Button>
            </div>
          )}
          {(client !== null || draft !== null) && (
            <Field
              label="Country"
              hint={
                lockedCountry
                  ? "Terms are on this letter, so its country stays."
                  : "Decides the terms and which company issues it."
              }
            >
              <CountrySelect
                value={country}
                required
                blankLabel="Choose the country"
                disabled={lockedCountry}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setAskReplace(false);
                }}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle level={2}>Issued by</CardTitle>
        <div className="mt-3">
          <FieldStack>
            <FieldRow>
              <Field
                label="Your company"
                hint={
                  lockedCountry
                    ? "Terms are on this letter, so its issuer stays."
                    : issuerPick !== null
                      ? undefined
                      : whereKey !== null && firm?.routes.has(whereKey) === true
                        ? `Your company for ${countryName(whereKey)}.`
                        : "Your company for every other country."
                }
              >
                <Select
                  value={issuerId}
                  disabled={lockedCountry}
                  onChange={(e) => {
                    setIssuerPick(e.target.value);
                    setAskReplace(false);
                    if (!priced) {
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
                hint={priced ? `Services are priced in ${currency} already.` : undefined}
              >
                <Select
                  value={currency}
                  disabled={priced}
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
                  hint={known === undefined ? undefined : `Last used on ${known.ref}, ${longDay(known.on)}.`}
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
            {askReplace && (
              <Notice tone="warn" eyebrow="Replace the letter's wording?">
                <p>
                  {ownProse} {ownProse === 1 ? "line was" : "lines were"} written or edited for this
                  client. The change puts {issuer?.name ?? "the new company"}&apos;s standard wording in
                  their place.
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
                    Replace and continue
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIssuerPick(draft?.letter.issuingEntityPartyId ?? null);
                      setCountry(draft?.letter.jurisdiction ?? country);
                      setAskReplace(false);
                    }}
                  >
                    Keep it as it is
                  </Button>
                </div>
              </Notice>
            )}
          </FieldStack>
        </div>
      </Card>

      <Card>
        <CardTitle level={2}>The letter</CardTitle>
        <div className="mt-3">
          <FieldStack>
            <Field label="Subject">
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
                label="Addressed to"
                hint={people.length === 0 ? "Nobody on file at this client yet." : undefined}
              >
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
              </Field>
              <Field label="Work begins" optional hint="Leave empty for the day it is signed.">
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => {
                    setEffectiveFrom(e.target.value);
                  }}
                />
              </Field>
            </FieldRow>
            <Field label="Background" optional>
              <Textarea
                rows={3}
                value={background}
                placeholder="e.g. Acme is a Delhi manufacturer moving its books to Zoho."
                onChange={(e) => {
                  setBackground(e.target.value);
                }}
              />
            </Field>
            <Checkbox
              label="Hold the work until an advance is paid"
              checked={advance}
              onChange={(e) => {
                setAdvance(e.target.checked);
              }}
            />
            {advance && (
              <FieldRow>
                <Field label={`Advance (${currency || "amount"})`}>
                  <AmountInput
                    value={advanceAmount}
                    required
                    placeholder="e.g. 25,000"
                    onChange={(e) => {
                      setAdvanceAmount(e.target.value);
                    }}
                  />
                </Field>
              </FieldRow>
            )}
            {draft === null && replaceable.length > 0 && (
              <Field label="Replaces" optional hint="A signed letter this one takes over from.">
                <Select
                  value={supersedesId}
                  onChange={(e) => {
                    setSupersedesId(e.target.value);
                  }}
                >
                  <option value="">Nothing, this is a new agreement</option>
                  {replaceable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.ref}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {draft?.supersedes != null && (
              <p className="text-sm text-muted">
                Replaces{" "}
                <Link href={`/engagement-letters/${draft.supersedes.id}` as Route}>{draft.supersedes.ref}</Link>.
              </p>
            )}
          </FieldStack>
        </div>
      </Card>

      <StickyFooter
        summary={
          clientName === "" ? (
            <span className="text-muted">Choose the client.</span>
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
          href={(draft === null ? "/engagement-letters" : `/engagement-letters/${draft.letter.id}`) as Route}
        >
          {draft === null ? "Cancel" : "Back to the letter"}
        </LinkButton>
        <Button type="submit" loading={busy} disabled={busy || (draft === null && client === null)}>
          Next: Services
        </Button>
      </StickyFooter>
    </form>
  );
}

