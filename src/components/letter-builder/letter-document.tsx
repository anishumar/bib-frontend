"use client";

/**
 * THE ENGAGEMENT LETTER, AS A DOCUMENT (T6.18 S6, D10).
 *
 * What the client will sign, drawn in the app in the Annexure PDF's own order:
 * page one's cover letter (date, addressee, subject, the firm's paragraphs,
 * "Yours sincerely" and the firm's block, the Acceptance and the client's),
 * Annexure 1 (Background, the sections and their numbered services, the
 * Summary of Fees, the advance, the commercials, team and exclusions) and
 * Annexure 2 (the numbered terms). The sections, their letters and the fee rows
 * are the API's `document`, built by the same `planAnnexure` the PDF is drawn
 * with; nothing here re-decides which service is "B2".
 *
 * On a live draft, to a session holding `party:write`, every piece is changed
 * where it is read (the proposal document's `EditableText` and friends): the
 * head through `PATCH /engagement-letters/{id}`, a service through
 * `PATCH …/lines/{lineId}` (every line an item prints for, so four companies'
 * lines stay one item), a section through its fee-group route, and the prose
 * through the document-block routes. Each change is THIS letter's only (D7).
 * A sent or signed letter draws no controls: the database refuses them.
 */

import { useEffect, useState } from "react";
import { api, apiError, clauseApplies, lawFits, readClauseBody } from "@/lib/api/client";
import type { ConfigEntry, LetterRecord } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Button, Notice, Select, cx } from "@/components/ui";
import { useSession } from "@/components/layout";
import {
  BackToStandard,
  DocSection,
  EditableChoice,
  EditableFee,
  EditableText,
  Missing,
  NoteList,
  pdfDate,
} from "@/components/proposal-document";
import type { SaveOutcome } from "@/components/proposal-document";
import { putLetter, useLetter } from "./store";
import { LETTER_FREQUENCY, andList, letterFee, letterMoney } from "./words";

type LineChange = components["schemas"]["UpdateEngagementLetterLineRequest"];
type HeadChange = components["schemas"]["ReviseEngagementLetterRequest"];
type GroupChange = components["schemas"]["EditFeeGroupRequest"];
type StandardTerms = components["schemas"]["StandardClausesAdded"];
type Block = LetterRecord["blocks"][number];
type NoteKind = "cover" | "acceptance" | "commercial" | "team" | "exclusion";

/** Annexure 1's notes, in the order the PDF prints them. */
const NOTES: readonly { kind: "commercial" | "team" | "exclusion"; title: string; noun: string }[] = [
  { kind: "commercial", title: "Commercials", noun: "commercial" },
  { kind: "team", title: "Team deployment", noun: "team" },
  { kind: "exclusion", title: "General scope exclusions", noun: "exclusion" },
];

type TermKey = "scope" | "volumeLimits" | "clientObligations" | "exclusions";
const TERMS: readonly {
  key: TermKey;
  override: "scopeOverride" | "volumeLimitsOverride" | "clientObligationsOverride" | "exclusionsOverride";
  heading: string | null;
  noun: string;
}[] = [
  { key: "scope", override: "scopeOverride", heading: null, noun: "scope of work" },
  { key: "volumeLimits", override: "volumeLimitsOverride", heading: "Volume limits", noun: "volume limits" },
  {
    key: "clientObligations",
    override: "clientObligationsOverride",
    heading: "Client's responsibilities",
    noun: "client's responsibilities",
  },
  { key: "exclusions", override: "exclusionsOverride", heading: "Exclusions", noun: "exclusions" },
];

interface Choice {
  readonly value: string;
  readonly label: string;
}

export function LetterDocument({
  letterId,
  editable,
  onChanged,
}: {
  letterId: string;
  editable: boolean;
  onChanged?: () => void;
}) {
  const { record, error, loaded, reload } = useLetter(letterId);
  const session = useSession();
  const [people, setPeople] = useState<readonly Choice[]>([]);
  const [standing, setStanding] = useState<{ displayName: string | null; title: string } | null>(null);
  const [clauses, setClauses] = useState<readonly ConfigEntry[]>([]);
  const [standardTerms, setStandardTerms] = useState<StandardTerms | null>(null);
  const [termBusy, setTermBusy] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);
  const [oneTerm, setOneTerm] = useState("");

  const deleted = record?.letter.deletedAt != null;
  const isDraft = record?.letter.status === "draft" && !deleted;
  const mayEdit = editable && isDraft && (session?.permissions.includes("party:write") ?? false);
  const clientId = record?.party.id ?? null;

  useEffect(() => {
    if (!isDraft) return;
    void api.GET("/api/v1/tenancy/firm-signatory").then((r) => {
      setStanding(r.data?.signatory ?? null);
    });
  }, [isDraft]);

  useEffect(() => {
    if (!mayEdit || clientId === null) return;
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: clientId } } })
      .then((r) => {
        setPeople((r.data?.people ?? []).map((p) => ({ value: p.id, label: p.displayName })));
      });
    void api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }).then((r) => {
      setClauses((r.data?.entries ?? []).filter((e) => e.published !== null));
    });
  }, [mayEdit, clientId]);

  if (!loaded && record === null) return <p className="text-muted">Loading…</p>;
  if (record === null) return <Notice tone="danger">{error ?? "This letter could not be read."}</Notice>;

  const { letter, lines, feeGroups } = record;
  const currency = letter.currency;
  const lineOf = (id: string) => lines.find((l) => l.id === id) ?? null;
  const groupOf = (id: string | null) => (id === null ? null : (feeGroups.find((g) => g.id === id) ?? null));
  const blocksOf = (kind: NoteKind): Block[] =>
    record.blocks.filter((b) => b.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);

  async function changed(): Promise<void> {
    await reload();
    onChanged?.();
  }

  async function revise(body: HeadChange): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/engagement-letters/{letterId}", {
      params: { path: { letterId } },
      body,
    });
    if (result.error) return apiError(result.error).message;
    putLetter(letterId, result.data);
    onChanged?.();
    return null;
  }

  /** One item prints for several lines (one per company): change them all. */
  async function reviseLines(lineIds: readonly string[], change: LineChange): Promise<SaveOutcome> {
    for (const lineId of lineIds) {
      const result = await api.PATCH("/api/v1/engagement-letters/{letterId}/lines/{lineId}", {
        params: { path: { letterId, lineId } },
        body: change,
      });
      if (result.error) return apiError(result.error).message;
      putLetter(letterId, result.data);
    }
    onChanged?.();
    return null;
  }

  async function reviseGroup(groupId: string, body: GroupChange): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/engagement-letters/{letterId}/fee-groups/{groupId}", {
      params: { path: { letterId, groupId } },
      body,
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  async function editBlock(blockId: string, body: string): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/document-blocks/{blockId}", {
      params: { path: { blockId } },
      body: { body },
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  async function strikeBlock(blockId: string): Promise<SaveOutcome> {
    const result = await api.DELETE("/api/v1/document-blocks/{blockId}", { params: { path: { blockId } } });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  async function addBlock(kind: NoteKind, body: string): Promise<SaveOutcome> {
    const last = blocksOf(kind).at(-1);
    const result = await api.POST("/api/v1/document-blocks", {
      body: { engagementLetterId: letterId, kind, body, sortOrder: (last?.sortOrder ?? 0) + 1, isHeading: false },
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  async function addStandardTerms(): Promise<void> {
    setTermBusy(true);
    setTermError(null);
    setStandardTerms(null);
    const result = await api.POST("/api/v1/engagement-letters/{letterId}/clauses/standard", {
      params: { path: { letterId } },
    });
    setTermBusy(false);
    if (result.error) {
      setTermError(apiError(result.error).message);
      return;
    }
    setStandardTerms(result.data);
    await changed();
  }

  async function addOneTerm(): Promise<void> {
    if (oneTerm === "") return;
    setTermBusy(true);
    setTermError(null);
    const result = await api.POST("/api/v1/engagement-letters/{letterId}/clauses", {
      params: { path: { letterId } },
      body: { clauseVersionId: oneTerm },
    });
    setTermBusy(false);
    if (result.error) {
      setTermError(apiError(result.error).message);
      return;
    }
    setOneTerm("");
    await changed();
  }

  const noteList = (kind: NoteKind, title: string, noun: string, paragraphs: boolean, headingLevel: 0 | 3) => (
    <NoteList
      key={kind}
      title={title}
      noun={noun}
      rows={blocksOf(kind)}
      mayEdit={mayEdit}
      documentNoun="letter"
      paragraphs={paragraphs}
      headingLevel={headingLevel}
      onEdit={editBlock}
      onStrike={strikeBlock}
      onAdd={(body) => addBlock(kind, body)}
    />
  );

  // Who the client signs for: every company a line is for, besides itself.
  const others: string[] = [];
  for (const l of lines) {
    const name = l.entity?.displayName ?? null;
    if (l.entityPartyId !== record.party.id && name !== null && !others.includes(name)) others.push(name);
  }
  const addressee = record.addressedTo;
  const addresseeChoices: Choice[] = [
    { value: "", label: `${record.party.displayName} (no individual)` },
    ...people,
    ...(addressee !== null && !people.some((p) => p.value === addressee.id)
      ? [{ value: addressee.id, label: addressee.displayName }]
      : []),
  ];
  const firmBlock =
    record.firmSignatory !== null
      ? { name: record.firmSignatory.displayName, title: record.firmSignatory.title }
      : isDraft && standing !== null
        ? { name: standing.displayName, title: standing.title }
        : null;

  const onLetter = new Set(record.clauses.map((c) => c.clauseVersionId));
  const onLetterKeys = new Set(record.clauses.map((c) => c.key));
  const fitting = clauses.filter((entry) => {
    const published = entry.published;
    if (published === null || onLetter.has(published.id) || onLetterKeys.has(entry.entry.key)) return false;
    const body = readClauseBody(published.body);
    return clauseApplies(body, letter.jurisdiction) && lawFits(body, record.issuer.jurisdiction);
  });

  return (
    <article
      data-tw
      aria-label={`Engagement letter ${letter.ref}`}
      className="w-full max-w-[900px] rounded-md border border-line bg-surface text-ink shadow-md"
    >
      {!isDraft && !deleted && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 text-sm text-muted sm:px-12">
          This letter was sent, so it reads exactly as the client has it.
        </p>
      )}
      {deleted && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 text-sm text-muted sm:px-12">
          This draft was deleted, so its wording no longer changes.
        </p>
      )}
      {mayEdit && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 text-sm text-muted sm:px-12">
          Click any part with a pencil to change it for this letter only.
        </p>
      )}

      <div className="flex flex-col gap-8 px-6 py-8 sm:px-12 sm:py-12">
        {/* ── Page one: the cover letter ─────────────────────────────── */}
        <header className="flex flex-col gap-1 border-b border-line pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-xl font-semibold text-brand-ink">{record.issuer.name}</p>
            <p className="mono text-sm text-muted">{letter.ref}</p>
          </div>
          {record.issuer.jurisdiction !== null && (
            <p className="text-sm text-muted">Registered in {record.issuer.jurisdiction}</p>
          )}
        </header>

        <section className="flex flex-col gap-4" aria-label="Cover letter">
          <EditableText
            label="the date on the letter"
            value={letter.issuedOn}
            editable={mayEdit}
            multiline={false}
            inputType="date"
            onSave={(day) => revise({ issuedOn: day === "" ? null : day })}
          >
            <p>
              Dated{" "}
              {letter.issuedOn !== null ? (
                pdfDate(letter.issuedOn)
              ) : (
                <span className="italic text-muted">the day it is sent</span>
              )}
            </p>
          </EditableText>

          <EditableChoice
            label="who the letter is addressed to"
            value={addressee?.id ?? ""}
            options={addresseeChoices}
            editable={mayEdit}
            onSave={(v) => revise({ addressedToPartyId: v === "" ? null : v })}
          >
            {addressee !== null && <p>{addressee.displayName}</p>}
            <p>{record.party.displayName}</p>
          </EditableChoice>

          <div className="flex flex-col gap-1">
            <EditableText
              label="the subject"
              value={letter.title}
              editable={mayEdit}
              multiline={false}
              required
              maxLength={300}
              onSave={(title) => revise({ title })}
            >
              <p className="font-semibold">Subject: {letter.title}</p>
            </EditableText>
            <EditableText
              label="the day work begins"
              value={letter.effectiveFrom}
              editable={mayEdit}
              multiline={false}
              inputType="date"
              onSave={(day) => revise({ effectiveFrom: day === "" ? null : day })}
            >
              {letter.effectiveFrom === null ? (
                mayEdit ? (
                  <Missing>No start date, so work begins the day it is signed. Click to set one.</Missing>
                ) : null
              ) : (
                <p className="text-sm text-ink-2">Period commencing {pdfDate(letter.effectiveFrom)}</p>
              )}
            </EditableText>
          </div>

          <p>{addressee === null ? "Dear Sir or Madam," : `Dear ${addressee.displayName},`}</p>

          {blocksOf("cover").length === 0 && !mayEdit ? null : noteList("cover", "Cover letter", "cover letter", true, 0)}

          <div className="flex flex-col gap-1">
            <p>Yours sincerely,</p>
            <p className="mt-6 font-semibold">For {record.issuer.name}</p>
            {firmBlock === null ? (
              <p className="text-sm italic text-muted">No signatory named yet.</p>
            ) : (
              <>
                {firmBlock.name !== null && <p>{firmBlock.name}</p>}
                <p className="text-ink-2">{firmBlock.title}</p>
              </>
            )}
          </div>

          <h3 className="mt-4 text-lg font-semibold">Acceptance</h3>
          {blocksOf("acceptance").length === 0 && !mayEdit
            ? null
            : noteList("acceptance", "Acceptance", "acceptance", true, 0)}
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              Accepted for and on behalf of {record.party.displayName}
              {others.length === 0 ? "" : `, for itself and on behalf of ${andList(others)}`}
            </p>
            <p className="text-ink-2">
              {letter.signedByName === null
                ? "Name and capacity"
                : `${letter.signedByName}${letter.signedByTitle === null ? "" : `, ${letter.signedByTitle}`}`}
            </p>
          </div>
        </section>

        {/* ── Annexure 1 ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-8 border-t border-line pt-8" aria-label="Annexure 1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-faint">Annexure 1</p>
            <h2 className="text-2xl font-semibold text-brand-ink">Scope of Services, Deliverables &amp; Fees</h2>
          </div>

          {(letter.background !== null || mayEdit) && (
            <DocSection title="Background">
              <EditableText
                label="the Background"
                value={letter.background}
                editable={mayEdit}
                maxLength={20000}
                placeholder="e.g. Acme is a Delhi manufacturer moving its books to Zoho."
                onSave={(text) => revise({ background: text === "" ? null : text })}
              >
                {letter.background === null ? (
                  <Missing>No Background, so Annexure 1 starts with the services. Click to write one.</Missing>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{letter.background}</p>
                )}
              </EditableText>
            </DocSection>
          )}

          {record.document.sections.length === 0 && (
            <p className="text-muted">No services on this letter yet.</p>
          )}

          {record.document.sections.map((section) => {
            const group = groupOf(section.feeGroupId);
            return (
              <section key={section.code} className="flex flex-col gap-4">
                <EditableText
                  label={`the title of section ${section.code}`}
                  value={section.title}
                  editable={mayEdit && group !== null}
                  multiline={false}
                  required
                  maxLength={200}
                  onSave={(title) => (group === null ? Promise.resolve(null) : reviseGroup(group.id, { title }))}
                >
                  <h2 className="text-xl font-semibold text-brand-ink">
                    {section.code}. {section.title}
                  </h2>
                </EditableText>
                {section.entityNames !== null && (
                  <p className="text-sm text-muted">For {andList(section.entityNames)}.</p>
                )}
                {group !== null && (group.intro !== null || mayEdit) && (
                  <EditableText
                    label={`the introduction of section ${section.code}`}
                    value={group.intro}
                    editable={mayEdit}
                    placeholder="e.g. The recurring work for the year, for one monthly fee."
                    onSave={(intro) => reviseGroup(group.id, { intro })}
                  >
                    {group.intro === null ? (
                      <Missing>No introduction for this section. Click to write one.</Missing>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{group.intro}</p>
                    )}
                  </EditableText>
                )}
                {section.items.map((item) => {
                  const head = lineOf(item.lineIds[0] ?? "");
                  if (head === null) return null;
                  return (
                    <div key={item.code} className="flex flex-col gap-2 border-l-2 border-line-soft pl-4">
                      <EditableText
                        label={`the name of ${item.description}`}
                        value={item.description}
                        editable={mayEdit}
                        multiline={false}
                        required
                        maxLength={500}
                        onSave={(description) => reviseLines(item.lineIds, { description })}
                      >
                        <h3 className="text-lg font-semibold">
                          {item.code}. {item.description}
                        </h3>
                      </EditableText>
                      {item.entityNames !== null && (
                        <p className="text-sm text-muted">For {andList(item.entityNames)}.</p>
                      )}
                      {item.beginsOn !== null && <p className="text-sm text-muted">Begins {pdfDate(item.beginsOn)}.</p>}
                      {TERMS.map((t) => {
                        const term = head.terms[t.key];
                        // An empty text is not drawn, as the PDF does not draw it.
                        if (term.text === null) return null;
                        return (
                          <div key={t.key} className="flex flex-col gap-1">
                            {t.heading !== null && <h4 className="text-sm font-semibold text-ink-2">{t.heading}</h4>}
                            <EditableText
                              label={`the ${t.noun} of ${item.description}`}
                              value={term.text}
                              editable={mayEdit}
                              onSave={(text) => reviseLines(item.lineIds, { [t.override]: text === "" ? null : text })}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">{term.text}</p>
                            </EditableText>
                            {mayEdit && term.tailored && (
                              <BackToStandard
                                noun={t.noun}
                                service={item.description}
                                standard={head.service?.[t.key] ?? null}
                                documentNoun="letter"
                                onRestore={() => reviseLines(item.lineIds, { [t.override]: null })}
                              />
                            )}
                          </div>
                        );
                      })}
                      {head.oopEstimate !== null && (
                        <p className="text-sm text-muted">
                          Out-of-pocket expenses: approximately{" "}
                          {letterMoney(head.oopEstimate.min, head.oopEstimate.currency)} to{" "}
                          {letterMoney(head.oopEstimate.max, head.oopEstimate.currency)}, reimbursed at actuals and not
                          part of the fee.
                        </p>
                      )}
                    </div>
                  );
                })}
                {group !== null && group.deliverables !== null && (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-semibold text-ink-2">Deliverables</h4>
                    <EditableText
                      label={`the deliverables of section ${section.code}`}
                      value={group.deliverables}
                      editable={mayEdit}
                      onSave={(deliverables) => reviseGroup(group.id, { deliverables })}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{group.deliverables}</p>
                    </EditableText>
                  </div>
                )}
                {group !== null && group.clientObligations !== null && (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-semibold text-ink-2">Client&apos;s responsibilities</h4>
                    <EditableText
                      label={`the client's responsibilities in section ${section.code}`}
                      value={group.clientObligations}
                      editable={mayEdit}
                      onSave={(clientObligations) => reviseGroup(group.id, { clientObligations })}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{group.clientObligations}</p>
                    </EditableText>
                  </div>
                )}
              </section>
            );
          })}

          <DocSection title="Summary of Fees">
            {record.document.fees.length === 0 ? (
              <p className="text-muted">No services have been added to this letter yet.</p>
            ) : (
              <table className="w-full table-fixed border-collapse text-md">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[38%]" />
                  <col className="w-[20%]" />
                  <col className="w-[32%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-left text-sm text-ink-2">
                    <th className="px-2 py-2 font-semibold">Section</th>
                    <th className="px-2 py-2 font-semibold">Description</th>
                    <th className="px-2 py-2 font-semibold">Frequency</th>
                    <th className="px-2 py-2 font-semibold">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {record.document.fees.map((f) => {
                    const recurring = f.billingFrequency !== null && f.billingFrequency !== "one_time";
                    const line = f.lineId === null ? null : lineOf(f.lineId);
                    const group = groupOf(f.feeGroupId);
                    const withheld = f.amount === null && (line?.priced === true || group !== null);
                    const words = withheld
                      ? "Not shown to you"
                      : letterFee(f.amount, f.billingFrequency, f.pricingNote, currency);
                    return (
                      <tr key={`${f.code}-${f.lineId ?? f.feeGroupId ?? ""}`} className="border-b border-line-soft align-top">
                        <td className="break-words px-2 py-2">{f.code}</td>
                        <td className="break-words px-2 py-2">{f.description}</td>
                        <td className="break-words px-2 py-2">
                          {f.billingFrequency === null ? "Not stated" : LETTER_FREQUENCY[f.billingFrequency]}
                          {recurring && f.startsOn !== null && `; starting from ${pdfDate(f.startsOn)}`}
                        </td>
                        <td className="break-words px-2 py-2">
                          {line !== null && !withheld ? (
                            <EditableFee
                              line={line}
                              currency={currency}
                              editable={mayEdit}
                              onSave={(change) =>
                                reviseLines([line.id], {
                                  unitAmount: change.unitAmount,
                                  billingFrequency: change.billingFrequency,
                                })
                              }
                            >
                              <span className={cx(f.amount !== null && "mono")}>{words}</span>
                            </EditableFee>
                          ) : group !== null && !withheld ? (
                            <EditableFee
                              line={{
                                unitAmount: group.amount,
                                billingFrequency: group.billingFrequency,
                                quantity: "1",
                                discountPercent: null,
                                description: group.title,
                              }}
                              currency={currency}
                              editable={mayEdit}
                              onSave={(change) =>
                                reviseGroup(group.id, {
                                  amount: change.unitAmount,
                                  ...(change.billingFrequency === null ? {} : { billingFrequency: change.billingFrequency }),
                                })
                              }
                            >
                              <span className={cx(f.amount !== null && "mono")}>{words}</span>
                            </EditableFee>
                          ) : (
                            <span>{words}</span>
                          )}
                          {f.paymentTerms !== null && <p className="text-sm text-muted">({f.paymentTerms})</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {letter.advanceRequired && letter.advanceAmount !== null && (
              <p>
                <span className="font-semibold">Advance, payable before work begins</span>{" "}
                <span className="mono">{letterMoney(letter.advanceAmount, currency)}</span>
              </p>
            )}
          </DocSection>

          {NOTES.map((n) =>
            blocksOf(n.kind).length === 0 && !mayEdit ? null : (
              <DocSection key={n.kind} title={n.title}>
                {noteList(n.kind, n.title, n.noun, false, 0)}
              </DocSection>
            ),
          )}
        </section>

        {/* ── Annexure 2 ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 border-t border-line pt-8" aria-label="Annexure 2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-faint">Annexure 2</p>
            <h2 className="text-2xl font-semibold text-brand-ink">Standard Terms &amp; Conditions</h2>
          </div>
          {record.clauses.length === 0 ? (
            <p className="italic text-muted">No terms on this letter yet.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {record.clauses.map((c, i) => (
                <li key={c.id} className="flex flex-col gap-1">
                  <h3 className="text-md font-semibold">
                    {i + 1}. {c.title}
                  </h3>
                  <p className="whitespace-pre-wrap leading-relaxed">{c.text}</p>
                </li>
              ))}
            </ol>
          )}

          {mayEdit && (
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-line p-4">
              <div className="cluster">
                <Button
                  type="button"
                  variant={record.clauses.length === 0 ? "primary" : "secondary"}
                  loading={termBusy}
                  disabled={termBusy}
                  onClick={() => {
                    void addStandardTerms();
                  }}
                >
                  Add all standard terms for {record.issuer.name}
                </Button>
              </div>
              {termError !== null && (
                <p role="alert" className="text-sm text-danger">
                  {termError}
                </p>
              )}
              {standardTerms !== null && (
                <div role="status" className="text-sm">
                  <p>
                    {standardTerms.added.length === 0
                      ? "No term was added."
                      : `Added ${String(standardTerms.added.length)} ${standardTerms.added.length === 1 ? "term" : "terms"}.`}
                  </p>
                  {standardTerms.skipped.filter((s) => s.reason !== "Already on this letter.").length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {standardTerms.skipped
                        .filter((s) => s.reason !== "Already on this letter.")
                        .map((s) => (
                          <li key={s.clauseKey}>
                            Left off{" "}
                            {readClauseBody(clauses.find((c) => c.entry.key === s.clauseKey)?.published?.body).title ||
                              s.clauseKey}
                            : {s.reason}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              {fitting.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm text-ink-2">
                    Add one term
                    <Select
                      value={oneTerm}
                      onChange={(e) => {
                        setOneTerm(e.target.value);
                      }}
                    >
                      <option value="">Choose a term</option>
                      {fitting.map((entry) => (
                        <option key={entry.entry.id} value={entry.published?.id}>
                          {readClauseBody(entry.published?.body).title || entry.entry.key}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={termBusy || oneTerm === ""}
                    onClick={() => {
                      void addOneTerm();
                    }}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
