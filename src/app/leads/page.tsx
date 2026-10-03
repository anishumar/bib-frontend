"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  apiError,
  codeLabel,
  LEAD_SOURCES,
  LEAD_STAGES,
  colleagueLabel,
  CONTACT_ROLE_OPTIONS,
  formatMoney,
  recordsLostReason,
  TERMINAL_STAGES,
} from "@/lib/api/client";
import type { Colleague, ContactRole, LeadRecord, LeadStage } from "@/lib/api/client";
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
  NotSet,
  Pill,
  RowChevron,
  RowLink,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  ThChevron,
  Tr,
  AmountInput,
} from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";
import { browserDay, longInstant } from "@/lib/day";
import { CountrySelect } from "@/components/country-select";
import { PhoneInput } from "@/components/phone-input";
import { countryName } from "@/lib/country";
import { cleanAmount, fromMinorUnits, previewAmount, toMinorUnits } from "@/lib/money";
import { MissingMoney, useSeesFees } from "@/components/fees";

/**
 * A value box in the filter: blank is "no bound", a plain amount is a bound,
 * and anything else is said to be wrong rather than silently ignored — a
 * filter that quietly drops a bound shows a list that looks filtered and is
 * not.
 */
function valueBound(raw: string): { units: bigint | null; bad: boolean } {
  const cleaned = cleanAmount(raw);
  if (cleaned === "") return { units: null, bad: false };
  const units = toMinorUnits(cleaned);
  return units === null ? { units: null, bad: true } : { units, bad: false };
}

/** The currency most of the pipeline's values are in, or null when none has
 *  one. What the value filter compares in when the books currency is not
 *  known (B47). */
function mostCommonCurrency(leads: readonly LeadRecord[]): string | null {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const c = l.lead.estimatedValue?.currency;
    if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [c, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = c;
  return best;
}

/** The stage filter: every stage, all open, all closed, or exactly one. */
type StageFilter = "" | "open" | "closed" | LeadStage;

/** A lead's country, for a table cell: the name, with the code on hover. */
function CountryCell({ code }: { code: string | null }) {
  return code === null ? <NotSet /> : <span title={code}>{countryName(code)}</span>;
}

/** A lead's estimate, for a table cell — right-aligned with tabular figures,
 *  in lakhs for INR whatever the browser is set to (`formatMoney`). */
function ValueCell({
  value,
  seesFees,
}: {
  value: LeadRecord["lead"]["estimatedValue"];
  seesFees: boolean | null;
}) {
  return (
    <Td align="right" className="nowrap">
      {value === null ? <MissingMoney seesFees={seesFees} /> : formatMoney(value.amount, value.currency)}
    </Td>
  );
}

/** Which pill a closed stage wears: converted is done, the two unwon closes
 *  are the red ones. The open stages are neutral: none of them is good or bad. */
function stageTone(stage: LeadStage): "ok" | "danger" | "neutral" {
  if (stage === "converted") return "ok";
  return recordsLostReason(stage) ? "danger" : "neutral";
}

/**
 * The pipeline.
 *
 * The thing worth understanding here: A LEAD IS A PARTY. Capture does not make
 * a second copy of a prospect — it resolves the party by identifier FIRST
 * (phone, PAN, email, normalised), and if that party already has an open lead
 * the capture APPENDS to it rather than starting a rival. So submitting the
 * same company twice answers 200 and not 201, and this screen says which
 * happened, because "we already had them" is the useful part.
 *
 * At most one open lead per party is a database constraint, not a convention.
 * Two live opportunities for one prospect means two people ringing them and two
 * forecasts counting it.
 *
 * CLOSING IS TWO STEPS, AND THAT IS THE POINT. `lost` and `abandoned` are not
 * shades of each other — chose a competitor is a PRICING problem, went quiet is
 * a FOLLOW-UP problem — and a firm that cannot tell them apart cannot tell
 * which of its two fixable failures it has. Both take a reason, in the closer's
 * own words, because a dropdown of five reasons produces five reasons and the
 * useful one is always the sixth. The API REQUIRES one on those two stages and
 * REFUSES one on every other, so the box appears on exactly those two.
 *
 * THE WAVE 4 SHAPE (2026-09-28, the approved mockup): one primary action at
 * the top (Capture a lead, in a dialog, so the page is the pipeline and not a
 * form under it), each table's count and total in its own header line, words
 * for codes, and the stage and owner as selects that read as their value
 * rather than a bordered box in every row. The whole row opens the lead.
 */
export default function LeadsPage() {
  const router = useRouter();
  // THE FEE AXIS (B33/F02): the API nulls every value for a login that cannot
  // see fees, and refuses one it sends. Its Value column says Hidden, and the
  // total, the value filters and Could be worth are not offered.
  const seesFees = useSeesFees();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [staff, setStaff] = useState<Colleague[]>([]);
  // The firm's books currency: what a captured value is in, said under the box.
  const [currency, setCurrency] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The close in progress. Picking `lost` or `abandoned` does not post — it
  // opens the reason box and posts BOTH in one call, because the API refuses a
  // close without a reason and a screen that fired the request first would
  // report an error the user could not have avoided.
  const [closing, setClosing] = useState<{ leadId: string; stage: LeadStage } | null>(null);
  // THE FILTERS. Applied here, to the list the API already returned whole,
  // rather than as query parameters: the pipeline comes back in one read (see
  // MAX_LIST_ROWS on the API), so filtering is instant and a partner can try
  // three bounds in a row without three round trips.
  const [stageFilter, setStageFilter] = useState<StageFilter>("");
  const [countryFilter, setCountryFilter] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  // The capture dialog, its own refusal (shown inside it, where the reader is),
  // and what its value box says, for the preview under it.
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureValue, setCaptureValue] = useState("");
  // The capture form's Country, so the phone's calling code follows it.
  const [captureCountry, setCaptureCountry] = useState<string | null>(null);
  const captureForm = useId();

  const load = useCallback(async (): Promise<void> => {
    const [pipeline, roster, companies] = await Promise.all([
      api.GET("/api/v1/leads", {}),
      // The colleagues PICKER, not the roster (G3.2's gap, closed as on the work
      // board): names and rungs of active staff on `party:read`, no emails. The
      // roster is `tenant:admin`, so until 2026-09-25 nobody below
      // administrator was shown this picker at all.
      api.GET("/api/v1/tenancy/colleagues", {}),
      api.GET("/api/v1/firm-entities", {}),
    ]);
    if (pipeline.response.status === 401) {
      router.push("/login");
      return;
    }
    if (pipeline.error) {
      setError(apiError(pipeline.error).message);
      setLoaded(true);
      return;
    }
    setLeads(pipeline.data.leads);
    setStaff(roster.data ? [...roster.data.colleagues] : []);
    setCurrency(companies.data?.reportingCurrency ?? null);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNote(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await load();
    setBusy(null);
    return true;
  }

  /**
   * WHERE FOCUS GOES AFTER A ROW WRITE, and why this is an EFFECT and not two
   * lines after the await.
   *
   * `disabled={busy !== null}` disables every select on the page while one
   * writes, and the browser blurs a control the moment it is disabled — so a
   * keyboard user who has just changed a stage is on `<body>` and the next Tab
   * restarts at the skip link.
   *
   * The obvious fix — check for `<body>` straight after the await — was written
   * first and MEASURED NOT WORKING, which is the whole reason this is written
   * down. `Button` restores focus to itself when it becomes pressable again and
   * nothing holds focus (see its own note; it was fixed for exactly this
   * reason), so there is a race between that and this, and the walk found a
   * `Button` holding focus and the select left behind. A child's effects run
   * before its parent's, so a PAGE-level effect is the one that runs last and
   * settles it — deterministically, rather than whichever happened to fire.
   *
   * The cost, stated: somebody who clicks a stage and then clicks something
   * else inside the ~200ms the write takes has focus pulled back to the select.
   * That is the same trade `Button` already makes in the other direction, and
   * it is smaller than the one it replaces, which lost focus on every write.
   */
  const restoreTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (busy !== null) return;
    const node = restoreTo.current;
    restoreTo.current = null;
    node?.focus();
  }, [busy]);

  /**
   * A WRITE FROM A ROW CONTROL — and it owes two things a plain `act` does not.
   *
   * It SAYS WHAT HAPPENED: changing a `<select>` in a table row wrote and
   * announced nothing, and for a screen reader the row simply goes quiet.
   * `note` is a live region on this page, so this is a sentence in it.
   *
   * It ASKS FOR FOCUS BACK, by handing the node to the effect above. The node
   * survives the reload: the rows are keyed by lead id, so React reconciles
   * rather than remounting.
   */
  async function rowAct(
    key: string,
    node: HTMLElement | null,
    said: string,
    call: () => Promise<{ error?: unknown }>,
  ): Promise<void> {
    restoreTo.current = node !== null && document.activeElement === node ? node : null;
    const ok = await act(key, call);
    if (!ok) return;
    setNote(said);
  }

  /**
   * Move a lead, with the reason when the stage is one that takes one.
   *
   * The close-out FORM passes no node deliberately: its submit button unmounts
   * by succeeding, so there is nothing to hand focus back to and the note is
   * what says the write landed.
   */
  function move(
    leadId: string,
    title: string,
    stage: LeadStage,
    node: HTMLElement | null,
    lostReason?: string,
  ): void {
    void rowAct(leadId, node, `${title} is now ${codeLabel(stage)}.`, async () => {
      const result = await api.POST("/api/v1/leads/{leadId}/stage", {
        params: { path: { leadId } },
        body: {
          stage,
          // Sent only for `lost` and `abandoned`. The API refuses it anywhere
          // else, and an empty string is not a reason.
          ...(lostReason === undefined || lostReason === "" ? {} : { lostReason }),
        },
      });
      if (!result.error) setClosing(null);
      return result;
    });
  }

  async function capture(form: FormData): Promise<void> {
    setBusy("capture");
    setCaptureError(null);
    setError(null);
    setNote(null);
    // The API deduplicates on these three, normalised. Blank ones are dropped
    // rather than sent — an empty identifier is not a fact about anybody.
    const identifiers = (["email", "phone", "pan", "gstin"] as const)
      .map((type) => ({ type, value: String(form.get(type) ?? "").trim() }))
      .filter((i) => i.value !== "");
    // The person at the company (CA#20). Named, the email and phone are
    // THEIRS and the API files them on that person, not on the company.
    const contactName = String(form.get("contactName") ?? "").trim();
    const contactRole = String(form.get("contactRole") ?? "");
    if (contactName !== "" && contactRole === "") {
      setBusy(null);
      setCaptureError("Choose the contact person's role, or clear their name.");
      return;
    }
    // Whose desk (CA#19): "auto" is the firm's own rule, as before; "none"
    // leaves it in the unassigned queue; anything else is that colleague.
    const owner = String(form.get("owner") ?? "auto");
    // Both optional, and a blank one is SENT AS ABSENT: an unknown country and
    // an unknown value are real answers at capture, never a reason to refuse.
    const jurisdiction = String(form.get("jurisdiction") ?? "");
    const estimatedValue = seesFees === true ? cleanAmount(String(form.get("estimatedValue") ?? "")) : "";

    const result = await api.POST("/api/v1/leads", {
      // The day the contact details are in force from: today where you are.
      params: { query: { asOf: browserDay() } },
      body: {
        source: String(form.get("source")) as LeadRecord["lead"]["source"],
        kind: "organization",
        name: String(form.get("name")).trim(),
        // What this opportunity is FOR. Required since G3.1, and the reason is
        // this list: a client with two live opportunities used to render as the
        // same company twice, because the party's name was all a row had.
        title: String(form.get("title")).trim(),
        identifiers,
        ...(contactName === ""
          ? {}
          : { contact: { name: contactName, role: contactRole as ContactRole } }),
        ...(owner === "auto" ? {} : { ownerUserId: owner === "none" ? null : owner }),
        ...(jurisdiction === "" ? {} : { jurisdiction }),
        ...(estimatedValue === "" ? {} : { estimatedValue }),
      },
    });
    setBusy(null);
    if (result.error) {
      // Inside the dialog, where the reader is. The page's own notice sits
      // behind the backdrop and would say it to nobody.
      setCaptureError(apiError(result.error).message);
      return;
    }
    setCaptureValue("");
    setCapturing(false);
    // 201 created something; 200 landed on what was already there. Saying so is
    // the whole point of capture answering two codes.
    setNote(
      result.data.merged
        ? // The merge is right — a firm holds one live opportunity per client —
          // but the title typed above was thrown away, and saying so is the
          // whole point of the API returning it.
          result.data.discardedTitle
          ? `We already had an open lead for them, so this was added to it. It keeps its name "${result.data.lead.title}", not "${result.data.discardedTitle}".`
          : "We already had an open lead for them, so this was added to it."
        : result.data.matchedExistingParty
          ? "They were already on record, so a new lead was opened for them."
          : "Lead captured.",
    );
    await load();
  }

  const min = valueBound(minValue);
  const max = valueBound(maxValue);
  const valueFiltered = seesFees === true && (min.units !== null || max.units !== null);
  // B47: a bound is an amount IN ONE CURRENCY, the firm's books currency, the
  // one every value is written in. A value in another currency (a firm that
  // changed its books currency) is not compared with it: 50,000 USD is not
  // "under 1,00,000". With no books currency known, the currency most values
  // are in.
  const filterCurrency = currency ?? mostCommonCurrency(leads);
  const filtering = stageFilter !== "" || countryFilter !== "" || minValue !== "" || maxValue !== "";

  function matches(l: LeadRecord): boolean {
    const isClosed = TERMINAL_STAGES.includes(l.lead.stage);
    if (stageFilter === "open" && isClosed) return false;
    if (stageFilter === "closed" && !isClosed) return false;
    if (stageFilter !== "" && stageFilter !== "open" && stageFilter !== "closed") {
      if (l.lead.stage !== stageFilter) return false;
    }
    if (countryFilter === "none" && l.lead.jurisdiction !== null) return false;
    if (countryFilter !== "" && countryFilter !== "none" && l.lead.jurisdiction !== countryFilter) {
      return false;
    }
    if (valueFiltered) {
      // A lead with no value cannot be "at least" anything, so a value bound
      // hides it — and the count line says so, so it is not a mystery.
      const value = l.lead.estimatedValue;
      if (value === null || value.currency !== filterCurrency) return false;
      const v = toMinorUnits(value.amount);
      if (v === null) return false;
      if (min.units !== null && v < min.units) return false;
      if (max.units !== null && v > max.units) return false;
    }
    return true;
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  const open = leads.filter((l) => !TERMINAL_STAGES.includes(l.lead.stage));
  const closed = leads.filter((l) => TERMINAL_STAGES.includes(l.lead.stage));
  const shownOpen = open.filter(matches);
  const shownClosed = closed.filter(matches);
  // A stage filter that can only match one card hides the other, rather than
  // leaving an empty "Open" above the lost leads somebody asked for.
  const onlyClosed =
    stageFilter === "closed" || (stageFilter !== "" && TERMINAL_STAGES.includes(stageFilter as LeadStage));
  const onlyOpen =
    stageFilter === "open" ||
    (stageFilter !== "" && stageFilter !== "closed" && !TERMINAL_STAGES.includes(stageFilter as LeadStage));

  // What the open opportunities on screen could be worth, added in exact
  // minor units and grouped by currency — one figure per currency, never a
  // sum across two.
  const openTotals = new Map<string, bigint>();
  for (const l of shownOpen) {
    const v = l.lead.estimatedValue;
    const units = v === null ? null : toMinorUnits(v.amount);
    if (v === null || units === null) continue;
    openTotals.set(v.currency, (openTotals.get(v.currency) ?? BigInt(0)) + units);
  }
  const unvaluedOpen = shownOpen.filter((l) => l.lead.estimatedValue === null).length;
  const capturedPreview =
    currency === null
      ? previewAmount(cleanAmount(captureValue))
      : previewAmount(cleanAmount(captureValue), currency) === null
        ? null
        : formatMoney(cleanAmount(captureValue), currency);

  return (
    <Page>
      <PageHeader
        title="Pipeline"
        aside={
          <Button
            onClick={() => {
              setCaptureError(null);
              setCapturing(true);
            }}
          >
            Capture a lead
          </Button>
        }
      />
      <ErrorNotice error={error} />
      {note !== null && (
        /* What a write ANSWERED: a stage, an owner, or what capture did. A live
           region, because somebody who cannot see a sentence appear is
           otherwise told nothing at all. */
        <p className="text-md" role="status" aria-live="polite">
          {note}
        </p>
      )}

      {leads.length > 0 && (
        <div className="stack tight">
          <FieldRow>
            <Field label="Stage">
              <Select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value as StageFilter);
                }}
              >
                <option value="">All stages</option>
                <option value="open">Open only</option>
                <option value="closed">Closed only</option>
                {LEAD_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {codeLabel(st)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Country">
              <CountryFilter leads={leads} value={countryFilter} onChange={setCountryFilter} />
            </Field>
            {seesFees === true && (
            <Field
              label="Value from"
              error={min.bad ? "Numbers only, e.g. 500000." : null}
              hint={
                min.units === null
                  ? filterCurrency === null ? undefined : `In ${filterCurrency}.`
                  : previewAmount(fromMinorUnits(min.units), filterCurrency ?? undefined)
              }
            >
              <AmountInput
                value={minValue}
                placeholder="e.g. 1,00,000"
                onChange={(e) => {
                  setMinValue(e.target.value);
                }}
              />
            </Field>
            )}
            {seesFees === true && (
            <Field
              label="Value up to"
              error={max.bad ? "Numbers only, e.g. 2500000." : null}
              hint={
                max.units === null
                  ? filterCurrency === null ? undefined : `In ${filterCurrency}.`
                  : previewAmount(fromMinorUnits(max.units), filterCurrency ?? undefined)
              }
            >
              <AmountInput
                value={maxValue}
                placeholder="e.g. 25,00,000"
                onChange={(e) => {
                  setMaxValue(e.target.value);
                }}
              />
            </Field>
            )}
          </FieldRow>
          {/* A live region that is always there and says something only while
              a filter is on: the count is what a filter ANSWERED. */}
          <div className="cluster">
            <p className="text-sm" role="status" aria-live="polite">
              {filtering
                ? `Showing ${String(shownOpen.length + shownClosed.length)} of ${String(leads.length)}.` +
                  (valueFiltered
                    ? filterCurrency !== null &&
                      leads.some((l) => l.lead.estimatedValue !== null && l.lead.estimatedValue.currency !== filterCurrency)
                      ? ` Leads with no value, or a value not in ${filterCurrency}, are hidden.`
                      : " Leads with no value are hidden."
                    : "")
                : ""}
            </p>
            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStageFilter("");
                  setCountryFilter("");
                  setMinValue("");
                  setMaxValue("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}

      {!onlyClosed && (
        <Card>
          <CardHead
            level={2}
            title={
              <>
                Open <Pill>{shownOpen.length}</Pill>
              </>
            }
            aside={
              seesFees === true && openTotals.size > 0 ? (
                <p className="text-md">
                  <span className="muted">Total value </span>
                  <strong className="num">
                    {[...openTotals.entries()]
                      .map(([cur, units]) => formatMoney(fromMinorUnits(units), cur))
                      .join(" + ")}
                  </strong>
                  {unvaluedOpen > 0 && (
                    <span className="muted">
                      {`, ${String(unvaluedOpen)} with no value`}
                    </span>
                  )}
                </p>
              ) : undefined
            }
          />
          {open.length === 0 ? (
            <p className="muted">No leads yet. Capture the first one with the button above.</p>
          ) : shownOpen.length === 0 ? (
            <p className="muted">No open lead matches these filters.</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Opportunity</Th>
                    <Th>Country</Th>
                    <Th align="right">Value</Th>
                    <Th>Source</Th>
                    <Th>Stage</Th>
                    <Th>Owner</Th>
                    <ThChevron />
                  </tr>
                </thead>
                <tbody>
                  {shownOpen.map((l) => {
                    const closingThis = closing?.leadId === l.lead.id ? closing : null;
                    return (
                      <Fragment key={l.lead.id}>
                        <Tr linked>
                          <Td>
                            {/* What the opportunity IS, over who it is with. The
                                title is the row's one link: the lead's own page
                                holds its notes, its quotes and its history, and
                                the client is one click on from there. */}
                            <span className="block max-w-64 whitespace-normal">
                              <RowLink href={`/leads/${l.lead.id}`}>{l.lead.title}</RowLink>
                              <Sub>{l.party.displayName}</Sub>
                            </span>
                          </Td>
                          <Td>
                            <CountryCell code={l.lead.jurisdiction} />
                          </Td>
                          <ValueCell value={l.lead.estimatedValue} seesFees={seesFees} />
                          <Td>{codeLabel(l.lead.source)}</Td>
                          <Td>
                            <Select
                              variant="pill"
                              /* A control in a table cell has no <label> over it:
                                 the column heading is not one. */
                              aria-label={`Stage of ${l.lead.title}`}
                              // While a close is being written the select shows
                              // the stage being moved TO, not the stored one.
                              value={closingThis?.stage ?? l.lead.stage}
                              disabled={busy !== null}
                              onChange={(e) => {
                                const stage = e.target.value as LeadStage;
                                if (recordsLostReason(stage)) {
                                  setClosing({ leadId: l.lead.id, stage });
                                  return;
                                }
                                setClosing(null);
                                move(l.lead.id, l.lead.title, stage, e.currentTarget);
                              }}
                            >
                              {LEAD_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {codeLabel(s)}
                                </option>
                              ))}
                            </Select>
                          </Td>
                          <Td>
                            <Select
                              variant="quiet"
                              aria-label={`Owner of ${l.lead.title}`}
                              value={l.owner?.userId ?? ""}
                              disabled={busy !== null || staff.length === 0}
                              onChange={(e) => {
                                const node = e.currentTarget;
                                const ownerId = e.target.value;
                                const found = staff.find((m) => m.userId === ownerId);
                                const who =
                                  ownerId === ""
                                    ? "unassigned"
                                    : `with ${found === undefined ? "somebody else" : colleagueLabel(found)}`;
                                void rowAct(l.lead.id, node, `${l.lead.title} is now ${who}.`, () =>
                                  api.PUT("/api/v1/leads/{leadId}/owner", {
                                    params: { path: { leadId: l.lead.id } },
                                    body: { ownerUserId: ownerId === "" ? null : ownerId },
                                  }),
                                );
                              }}
                            >
                              {/* Unassigned is a real state — it is the queue
                                  somebody works from — so it is an option. */}
                              <option value="">Unassigned</option>
                              {staff.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {colleagueLabel(m)}
                                </option>
                              ))}
                            </Select>
                          </Td>
                          <RowChevron />
                        </Tr>
                        {closingThis !== null && (
                          <tr>
                            <Td colSpan={7}>
                              <form
                                action={(form) => {
                                  move(
                                    l.lead.id,
                                    l.lead.title,
                                    closingThis.stage,
                                    // NOTHING TO HAND FOCUS BACK TO: this form's
                                    // submit unmounts by succeeding.
                                    null,
                                    String(form.get("lostReason") ?? "").trim(),
                                  );
                                }}
                              >
                                <FieldStack>
                                  <Field
                                    label={
                                      closingThis.stage === "lost"
                                        ? "Why did it go elsewhere?"
                                        : "What happened to it?"
                                    }
                                    hint="In your own words, so it is useful next quarter."
                                  >
                                    <Textarea
                                      name="lostReason"
                                      rows={2}
                                      required
                                      autoFocus
                                      placeholder={
                                        closingThis.stage === "lost"
                                          ? "e.g. Went with their existing auditor on price."
                                          : "e.g. Three calls and two emails, no reply since June."
                                      }
                                    />
                                  </Field>
                                  <div className="cluster">
                                    <Button type="submit" disabled={busy !== null}>
                                      Close as {codeLabel(closingThis.stage)}
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      disabled={busy !== null}
                                      onClick={() => {
                                        setClosing(null);
                                      }}
                                    >
                                      Keep it open
                                    </Button>
                                  </div>
                                </FieldStack>
                              </form>
                            </Td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      )}

      {closed.length > 0 && !onlyOpen && (
        <Card>
          <CardHead
            level={2}
            title={
              <>
                Closed <Pill>{shownClosed.length}</Pill>
              </>
            }
          />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Opportunity</Th>
                  <Th>Country</Th>
                  <Th align="right">Value</Th>
                  <Th>Stage</Th>
                  <Th>Reason</Th>
                  <Th>Closed on</Th>
                  <ThChevron />
                </tr>
              </thead>
              <tbody>
                {shownClosed.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="muted">
                      No closed lead matches these filters.
                    </Td>
                  </tr>
                )}
                {shownClosed.map((l) => (
                  /* FULL INK, and the pill says the state (the Wave 4 brief):
                     a closed lead was dimmed to 55%, which made its value and
                     its reason the hardest things on the page to read. */
                  <Tr key={l.lead.id} linked>
                    <Td>
                      <span className="block max-w-64 whitespace-normal">
                        <RowLink href={`/leads/${l.lead.id}`}>{l.lead.title}</RowLink>
                        <Sub>{l.party.displayName}</Sub>
                      </span>
                    </Td>
                    <Td>
                      <CountryCell code={l.lead.jurisdiction} />
                    </Td>
                    <ValueCell value={l.lead.estimatedValue} seesFees={seesFees} />
                    <Td>
                      {/* `lost` and `abandoned` render as themselves. Collapsing
                          them into one word would throw away the only signal that
                          separates a pricing problem from a follow-up one. */}
                      <Pill dot tone={stageTone(l.lead.stage)}>
                        {codeLabel(l.lead.stage)}
                      </Pill>
                    </Td>
                    {/* WHY, in the closer's own words. Null on a converted lead is
                        right and shows nothing; null on a closed-unwon one means
                        it was closed before anybody was asked. */}
                    <Td>
                      <span className="cell-text">
                        {l.lead.lostReason ?? (recordsLostReason(l.lead.stage) ? <NotSet /> : null)}
                      </span>
                    </Td>
                    {/* `closed_at` is a `timestamptz` — an INSTANT, so it is
                        PARSED and not split (the reader's own day). */}
                    <Td className="nowrap">
                      {l.lead.closedAt === null ? <NotSet /> : longInstant(l.lead.closedAt)}
                    </Td>
                    <RowChevron />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <Dialog
        open={capturing}
        size="lg"
        onClose={() => {
          setCapturing(false);
        }}
        title="Capture a lead"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCapturing(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={captureForm} disabled={busy !== null}>
              {busy === "capture" ? "Capturing…" : "Capture"}
            </Button>
          </>
        }
      >
        <form
          id={captureForm}
          action={(form) => {
            void capture(form);
          }}
        >
          <FieldStack>
            <ErrorNotice error={captureError} />
            <FieldRow>
              <Field label="Company">
                <Input name="name" required autoFocus placeholder="e.g. Acme Industries Pvt Ltd" />
              </Field>
              <Field label="Opportunity">
                <Input name="title" placeholder="e.g. FY26 statutory audit" required />
              </Field>
              {/* Nothing preselected (F13): it defaulted to Referral, so every
                  lead nobody touched this on was recorded as a referral. */}
              <Field label="Source">
                <Select name="source" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {codeLabel(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Contact person" optional>
                <Input name="contactName" autoComplete="off" placeholder="e.g. Ravi Kumar" />
              </Field>
              <Field label="Their role" optional>
                <Select name="contactRole" defaultValue="">
                  <option value="">Choose…</option>
                  {CONTACT_ROLE_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <div>
              <FieldRow>
                <Field label="Email">
                  <Input name="email" type="email" placeholder="e.g. ravi@acme.example" />
                </Field>
                <Field label="Phone">
                  <PhoneInput name="phone" country={captureCountry} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="PAN">
                  <Input name="pan" placeholder="e.g. AAACL1234M" />
                </Field>
                <Field label="GSTIN">
                  <Input name="gstin" placeholder="e.g. 27AAACL1234M1Z5" />
                </Field>
              </FieldRow>
              <p className="field-hint">
                Give at least one email, phone or PAN, so a repeat is spotted. With a contact named,
                the email and phone are theirs.
              </p>
            </div>
            <Field label="Owner">
              <Select name="owner" defaultValue="auto">
                <option value="auto">The firm&rsquo;s rule picks</option>
                {staff.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {colleagueLabel(m)}
                  </option>
                ))}
                <option value="none">Leave unassigned</option>
              </Select>
            </Field>
            <FieldRow>
              <Field label="Country" optional>
                <CountrySelect
                  name="jurisdiction"
                  defaultValue=""
                  onChange={(e) => {
                    setCaptureCountry(e.target.value === "" ? null : e.target.value);
                  }}
                />
              </Field>
              {seesFees === true && (
                <Field
                  label="Could be worth"
                  optional
                  hint={capturedPreview ?? (currency === null ? undefined : `In ${currency}.`)}
                >
                  <AmountInput
                    name="estimatedValue"
                    placeholder="e.g. 5,00,000"
                    onChange={(e) => {
                      setCaptureValue(e.target.value);
                    }}
                  />
                </Field>
              )}
            </FieldRow>
          </FieldStack>
        </form>
      </Dialog>
    </Page>
  );
}

/**
 * The country filter offers only the countries the pipeline HAS, plus "Not
 * known" when some lead has none. A list of 250 countries to filter a pipeline
 * that spans three would be mostly answers that return nothing.
 */
function CountryFilter({
  leads,
  value,
  onChange,
}: {
  leads: readonly LeadRecord[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { present, unknown } = useMemo(() => {
    const codes = new Set<string>();
    let none = false;
    for (const l of leads) {
      if (l.lead.jurisdiction === null) none = true;
      else codes.add(l.lead.jurisdiction);
    }
    return {
      present: [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b))),
      unknown: none,
    };
  }, [leads]);
  return (
    <Select
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    >
      <option value="">All countries</option>
      {present.map((code) => (
        <option key={code} value={code}>
          {countryName(code)}
        </option>
      ))}
      {unknown && <option value="none">Not known</option>}
    </Select>
  );
}
