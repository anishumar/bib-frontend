"use client";

/**
 * THE PROPOSAL, AS A DOCUMENT (T6.18, D10).
 *
 * What the client will read, drawn in the app, in the PDF's own order and with
 * the PDF's own lettering: the cover, Background, the in-scope services, the
 * work in sections by Dept with each service under its code, the Summary of
 * Fees, the validity line, and the Notes (team, general exclusions,
 * commercials). `render-source.ts` builds the PDF from the same record in the
 * same order; `plan.ts` restates its lettering. The PDF rendered at Send stays
 * the record (0085); this is what lets somebody read and fix it first.
 *
 * ## Editable in place, on a draft
 *
 * Every piece a person may change is changed where it is read (`editable.tsx`):
 * the title and the two names on the cover, the Background, the validity date,
 * each line of the Notes (and striking one off, and adding one). Each save goes
 * to the route that owns that piece, and every change is THIS document's only
 * (D7): the catalogue and the firm's standard prose are never written from here.
 *
 * Offered only when all of these hold: the caller said `editable`, the session
 * holds `party:write`, and the proposal is a draft that was not deleted. A sent
 * proposal is the record of what the client was shown, so it draws no controls
 * at all, and says so once rather than leaving a reader to find out by trying.
 *
 * ## It depends on nothing but the id
 *
 * The proposal page mounts it and so does step 3 of the builder. It reads the
 * record through `store.ts`, which the Send panel shares, so a send turns the
 * document read-only in the same instant.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, apiError } from "@/lib/api/client";
import type { ProposalLine, ProposalRecord } from "@/lib/api/client";
import { Icon, Notice, Skeleton, SkeletonText, cx } from "@/components/ui";
import { useSession } from "@/components/layout";
import type { paths } from "@/lib/api/schema";
import { EditableChoice, EditableText, PIECE_BUTTON } from "./editable";
import { EditableFee } from "./fee";
import type { SaveOutcome } from "./editable";
import { planSections } from "./plan";
import type { PlannedItem, PlannedSection } from "./plan";
import { putProposal, useProposal } from "./store";
import { FREQUENCY_WORDS, feeWords, namedService, pdfDate, pdfMoney, summaryFee, totalWords } from "./words";

type Block = ProposalRecord["blocks"][number];
/** What changing one line of the proposal may send. */
type LineChange =
  paths["/api/v1/proposals/{proposalId}/lines/{lineId}"]["patch"]["requestBody"]["content"]["application/json"];
type NoteKind = "team" | "exclusion" | "commercial";

/** The Notes, in the order and under the headings the PDF prints them. */
const NOTES: readonly { kind: NoteKind; title: string; noun: string; example: string }[] = [
  { kind: "team", title: "Team Deployment", noun: "team", example: "e.g. Priya Shah leads the engagement." },
  {
    kind: "exclusion",
    title: "General scope exclusions",
    noun: "exclusion",
    example: "e.g. Statutory fees and penalties are not included.",
  },
  {
    kind: "commercial",
    title: "Commercials",
    noun: "commercial",
    example: "e.g. Invoices are payable within 15 days of issue.",
  },
];

interface Choice {
  readonly value: string;
  readonly label: string;
}

export function ProposalDocument({
  proposalId,
  editable,
  onChanged,
}: {
  proposalId: string;
  /** Whether the caller wants edit controls. The document still offers them
   *  only on a live draft and to a session holding `party:write`. */
  editable: boolean;
  /** Told after every save, for a caller that shows something else from the
   *  same proposal. The document itself is already current. */
  onChanged?: () => void;
}) {
  const { record, error, loaded, reload } = useProposal(proposalId);
  const session = useSession();
  const [people, setPeople] = useState<readonly Choice[]>([]);
  const [colleagues, setColleagues] = useState<readonly Choice[]>([]);

  const deleted = record?.proposal.deletedAt != null;
  const isDraft = record?.proposal.status === "draft" && !deleted;
  const mayEdit =
    editable && isDraft && (session?.permissions.includes("party:write") ?? false);
  const clientId = record?.proposal.partyId ?? null;

  // Whom the cover may name, read only when it can be changed: the client's
  // people (the list the API checks "Prepared for" against, F-10-1) and the
  // firm's colleagues. A refusal here costs the choice and nothing else.
  useEffect(() => {
    if (!mayEdit || clientId === null) return;
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: clientId } } })
      .then((r) => {
        setPeople((r.data?.people ?? []).map((p) => ({ value: p.id, label: p.displayName })));
      });
    void api.GET("/api/v1/tenancy/colleagues", {}).then((r) => {
      setColleagues(
        // An account with no name reads as its role, as the roster does.
        (r.data?.colleagues ?? []).map((c) => ({ value: c.userId, label: c.displayName ?? c.role })),
      );
    });
  }, [mayEdit, clientId]);

  if (!loaded && record === null) return <DocumentSkeleton />;
  if (record === null) {
    return <Notice tone="danger">{error ?? "This proposal could not be read."}</Notice>;
  }

  const { proposal } = record;
  const currency = proposal.currency;
  const sections = planSections(record);
  const blocksOf = (kind: NoteKind): Block[] =>
    record.blocks.filter((b) => b.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);
  const hasNotes = NOTES.some((n) => blocksOf(n.kind).length > 0);

  async function changed(): Promise<void> {
    await reload();
    onChanged?.();
  }

  /** The head of the proposal: title, Background, validity, the two names.
   *  The API answers with the whole record, so nothing is read again. */
  async function revise(body: {
    title?: string;
    background?: string | null;
    validUntil?: string | null;
    addressedToPartyId?: string | null;
    preparedByUserId?: string | null;
  }): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/proposals/{proposalId}", {
      params: { path: { proposalId } },
      body,
    });
    if (result.error) return apiError(result.error).message;
    putProposal(proposalId, result.data);
    onChanged?.();
    return null;
  }

  /** One service's line: its name, its four texts, its fee (S1's route,
   *  T6.18). It answers with the whole record, totals included. */
  async function reviseLine(lineId: string, change: LineChange): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/proposals/{proposalId}/lines/{lineId}", {
      params: { path: { proposalId, lineId } },
      body: change,
    });
    if (result.error) return apiError(result.error).message;
    putProposal(proposalId, result.data);
    onChanged?.();
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
    const result = await api.DELETE("/api/v1/document-blocks/{blockId}", {
      params: { path: { blockId } },
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  async function addBlock(kind: NoteKind, body: string): Promise<SaveOutcome> {
    const last = blocksOf(kind).at(-1);
    const result = await api.POST("/api/v1/document-blocks", {
      body: { proposalId, kind, body, sortOrder: (last?.sortOrder ?? 0) + 1, isHeading: false },
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  const addresseeChoices: Choice[] = [
    { value: "", label: `${record.party.displayName} (no individual)` },
    ...people,
    // The person named now is always a choice, even before the list has
    // arrived or after they left it, so the box never opens on somebody else.
    ...(record.addressee !== null && !people.some((p) => p.value === record.addressee?.id)
      ? [{ value: record.addressee.id, label: record.addressee.displayName }]
      : []),
  ];
  const preparerChoices: Choice[] = [
    { value: "", label: "Nobody named" },
    ...colleagues,
    // Somebody who prepared it and has since left the roster must still read
    // as the current choice rather than silently becoming somebody else.
    ...(record.preparedBy !== null && !colleagues.some((c) => c.value === record.preparedBy?.userId)
      ? [{ value: record.preparedBy.userId, label: record.preparedBy.displayName ?? record.preparedBy.email }]
      : []),
  ];

  return (
    <article
      data-tw
      aria-label={`Proposal ${proposal.ref}`}
      className="w-full max-w-[900px] rounded-md border border-line bg-surface text-ink shadow-md"
    >
      {!isDraft && !deleted && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 sm:px-12 text-sm text-muted">
          Sent, so it reads exactly as the client saw it. A new offer is a new proposal.
        </p>
      )}
      {deleted && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 sm:px-12 text-sm text-muted">
          Deleted as made by mistake, so its wording no longer changes.
        </p>
      )}
      {mayEdit && (
        <p className="rounded-t-md border-b border-line bg-surface-sunk px-6 py-3 sm:px-12 text-sm text-muted">
          Click any part with a pencil to change it for this proposal.
        </p>
      )}

      <div className="flex flex-col gap-8 px-6 py-8 sm:px-12 sm:py-12">
        {/* ── The cover ───────────────────────────────────────────────── */}
        <header className="flex flex-col gap-6 border-b border-line pb-8">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">
              {proposal.ref} · {pdfDate(record.issuedOn)}
            </p>
            <h2 className="text-2xl font-semibold text-brand-ink">Proposal for Services</h2>
            <EditableText
              label="the title"
              value={proposal.title}
              editable={mayEdit}
              multiline={false}
              required
              maxLength={300}
              onSave={(title) => revise({ title })}
            >
              <p className="text-lg text-ink-2">{proposal.title}</p>
            </EditableText>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-muted">Prepared for:</p>
              <EditableChoice
                label="who it is prepared for"
                value={record.addressee?.id ?? ""}
                options={addresseeChoices}
                editable={mayEdit}
                onSave={(v) => revise({ addressedToPartyId: v === "" ? null : v })}
              >
                {record.addressee !== null && <p className="font-semibold">{record.addressee.displayName}</p>}
                <p className="font-semibold">{record.party.displayName}</p>
              </EditableChoice>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-muted">Prepared by:</p>
              <EditableChoice
                label="who prepared it"
                value={record.preparedBy?.userId ?? ""}
                options={preparerChoices}
                editable={mayEdit}
                onSave={(v) => revise({ preparedByUserId: v === "" ? null : v })}
              >
                {record.preparedBy !== null && (
                  <p className="font-semibold">
                    {record.preparedBy.displayName ?? record.preparedBy.email}
                  </p>
                )}
                <p className="font-semibold">{record.issuingEntity.displayName}</p>
                {record.preparedBy !== null && (
                  <p className="text-ink-2">{record.preparedBy.email}</p>
                )}
              </EditableChoice>
            </div>
          </div>
        </header>

        {/* ── Background ──────────────────────────────────────────────── */}
        {(proposal.background !== null || mayEdit) && (
          <DocSection title="Background">
            <EditableText
              label="the Background"
              value={proposal.background}
              editable={mayEdit}
              maxLength={4000}
              placeholder="e.g. Kaveri Foods makes packaged snacks and sells across India."
              onSave={(text) => revise({ background: text === "" ? null : text })}
            >
              {proposal.background === null ? (
                <Missing>No Background yet. Click to write one.</Missing>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{proposal.background}</p>
              )}
            </EditableText>
          </DocSection>
        )}

        {/* ── In-scope processes / services ───────────────────────────── */}
        {sections.length > 0 && (
          <DocSection title="In-scope processes / services">
            <ul className="flex flex-col gap-1">
              {sections.flatMap((s) =>
                s.items.map((i) => (
                  <li key={i.line.id}>
                    {s.code}. {namedService(i.line.description, i.subject)}
                  </li>
                )),
              )}
            </ul>
          </DocSection>
        )}

        {/* ── The work, a section per Dept ────────────────────────────── */}
        {sections.map((s) => (
          <DeptSection key={s.code} section={s} currency={currency} mayEdit={mayEdit} onRevise={reviseLine} />
        ))}

        {/* ── Summary of Fees ─────────────────────────────────────────── */}
        <FeesSummary sections={sections} currency={currency} totals={record.totalsByFrequency} />

        {/* ── Valid until ─────────────────────────────────────────────── */}
        {(proposal.validUntil !== null || mayEdit) && (
          <EditableText
            label="the date it is valid until"
            value={proposal.validUntil}
            editable={mayEdit}
            multiline={false}
            inputType="date"
            onSave={(day) => revise({ validUntil: day === "" ? null : day })}
          >
            {proposal.validUntil === null ? (
              <Missing>No validity date. Click to add one.</Missing>
            ) : (
              <p className="text-muted">This proposal is valid until {pdfDate(proposal.validUntil)}.</p>
            )}
          </EditableText>
        )}

        {/* ── Notes ───────────────────────────────────────────────────── */}
        {(hasNotes || mayEdit) && (
          <DocSection title="Notes">
            <div className="flex flex-col gap-6">
              {NOTES.map((n) => {
                const rows = blocksOf(n.kind);
                if (rows.length === 0 && !mayEdit) return null;
                return (
                  <NoteList
                    key={n.kind}
                    title={n.title}
                    noun={n.noun}
                    example={n.example}
                    rows={rows}
                    mayEdit={mayEdit}
                    onEdit={editBlock}
                    onStrike={strikeBlock}
                    onAdd={(body) => addBlock(n.kind, body)}
                  />
                );
              })}
            </div>
          </DocSection>
        )}
      </div>
    </article>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-brand-ink">{title}</h2>
      {children}
    </section>
  );
}

/** A piece the PDF would leave out, shown only where it can be written. */
export function Missing({ children }: { children: ReactNode }) {
  return <p className="rounded-sm border border-dashed border-line px-3 py-2 text-sm text-muted">{children}</p>;
}

function DeptSection({
  section,
  currency,
  mayEdit,
  onRevise,
}: {
  section: PlannedSection;
  currency: string;
  mayEdit: boolean;
  onRevise: (lineId: string, change: LineChange) => Promise<SaveOutcome>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-brand-ink">
        {section.code}. {section.title}
      </h2>
      <p className="text-sm font-semibold text-ink-2">Our responsibilities:</p>
      {section.items.map((item) => (
        <ServiceItem key={item.line.id} item={item} currency={currency} mayEdit={mayEdit} onRevise={onRevise} />
      ))}
    </section>
  );
}

type TermKey = keyof ProposalLine["terms"];

/** The four texts a service prints under it, in the PDF's order, and the
 *  field of the line that holds this proposal's own words for each. */
const TERMS: readonly {
  key: TermKey;
  override: "scopeOverride" | "volumeLimitsOverride" | "clientObligationsOverride" | "exclusionsOverride";
  heading: string | null;
  noun: string;
  /** The box's placeholder: an example, never a default (Wave 4). */
  example: string;
}[] = [
  {
    key: "scope",
    override: "scopeOverride",
    heading: null,
    noun: "scope of work",
    example: "e.g. Monthly books and GST returns for one GSTIN.",
  },
  {
    key: "volumeLimits",
    override: "volumeLimitsOverride",
    heading: "Volume limits",
    noun: "volume limits",
    example: "e.g. Up to 300 invoices a month.",
  },
  {
    key: "clientObligations",
    override: "clientObligationsOverride",
    heading: "Client's responsibilities",
    noun: "client's responsibilities",
    example: "e.g. Bank statements by the 5th of each month.",
  },
  {
    key: "exclusions",
    override: "exclusionsOverride",
    heading: "Exclusions",
    noun: "exclusions",
    example: "e.g. Statutory audit and historical clean-up.",
  },
];

function ServiceItem({
  item,
  currency,
  mayEdit,
  onRevise,
}: {
  item: PlannedItem;
  currency: string;
  mayEdit: boolean;
  onRevise: (lineId: string, change: LineChange) => Promise<SaveOutcome>;
}) {
  const { line } = item;
  const name = line.description;
  /** A text the catalogue leaves empty, being written for this proposal. */
  const [adding, setAdding] = useState<TermKey | null>(null);
  const empty = TERMS.filter((t) => line.terms[t.key].text === null && adding !== t.key);
  return (
    <div className="flex flex-col gap-2 border-l-2 border-line-soft pl-4">
      <EditableText
        label={`the name of ${name}`}
        value={name}
        editable={mayEdit}
        multiline={false}
        required
        maxLength={500}
        onSave={(description) => onRevise(line.id, { description })}
      >
        <h3 className="text-lg font-semibold">
          {item.code}. {name}
        </h3>
      </EditableText>
      {item.subject !== null && <p className="text-sm text-muted">For {item.subject}.</p>}
      {TERMS.map((t) => {
        const term = line.terms[t.key];
        // An empty text is not drawn, as the PDF does not draw it; one being
        // written for this proposal opens in place.
        if (term.text === null && adding !== t.key) return null;
        return (
          <div key={t.key} className="flex flex-col gap-1">
            {t.heading !== null && <h4 className="text-sm font-semibold text-ink-2">{t.heading}</h4>}
            <EditableText
              label={`the ${t.noun} of ${name}`}
              value={term.text}
              editable={mayEdit}
              initiallyEditing={term.text === null}
              placeholder={t.example}
              onSave={(text) => onRevise(line.id, { [t.override]: text === "" ? null : text })}
              onClose={() => {
                setAdding(null);
              }}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{term.text}</p>
            </EditableText>
            {mayEdit && term.tailored && (
              <BackToStandard
                noun={t.noun}
                service={name}
                standard={term.standard}
                onRestore={() => onRevise(line.id, { [t.override]: null })}
              />
            )}
          </div>
        );
      })}
      {mayEdit && empty.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Not in the catalogue. Add:</span>
          {empty.map((t) => (
            <button
              key={t.key}
              type="button"
              className="text-xs text-brand underline"
              aria-label={`Add ${t.noun} to ${name} for this proposal`}
              onClick={() => {
                setAdding(t.key);
              }}
            >
              {t.heading ?? "Scope of work"}
            </button>
          ))}
        </p>
      )}
      {line.oopEstimate !== null && (
        <p className="text-sm text-muted">
          Out-of-pocket expenses: approximately {pdfMoney(line.oopEstimate.min, line.oopEstimate.currency)} to{" "}
          {pdfMoney(line.oopEstimate.max, line.oopEstimate.currency)}, reimbursed at actuals and not part of
          the fee.
        </p>
      )}
      <EditableFee
        line={line}
        currency={currency}
        editable={mayEdit && !(line.priced && line.net === null)}
        onSave={(change) => onRevise(line.id, change)}
      >
        <p>
          <span className="font-semibold">Fees</span> {item.code}: {fee(line, currency)}
        </p>
      </EditableFee>
    </div>
  );
}

/** Marks a text this proposal changed, with the way back to the catalogue's
 *  words: a null override is the API's "print the catalogue's". */
export function BackToStandard({
  noun,
  service,
  standard,
  onRestore,
  documentNoun = "proposal",
}: {
  noun: string;
  service: string;
  /** What the document is called: "proposal" or "letter". */
  documentNoun?: string;
  /** The catalogue's words, or null when it has none (putting it back then
   *  takes the text off this proposal). */
  standard: string | null;
  onRestore: () => Promise<SaveOutcome>;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      <span>Changed for this {documentNoun}.</span>
      <button
        type="button"
        disabled={busy}
        className="text-xs text-brand underline"
        aria-label={`Put back the catalogue's ${noun} for ${service}`}
        title={standard === null ? `The catalogue has none, so this takes it off the ${documentNoun}.` : `The catalogue says: ${standard}`}
        onClick={() => {
          setBusy(true);
          setRefusal(null);
          void onRestore().then((outcome) => {
            setBusy(false);
            setRefusal(outcome);
          });
        }}
      >
        {busy ? "Putting it back…" : standard === null ? "Back to standard (none)" : "Back to standard"}
      </button>
      {refusal !== null && (
        <span role="alert" className="text-sm text-danger">
          {refusal}
        </span>
      )}
    </div>
  );
}

/** A priced line whose amount this session may not see reads as that, never
 *  as "to be agreed": the fee axis redacts the number, not the fact. */
function fee(line: ProposalLine, currency: string): string {
  if (line.priced && line.net === null) return "Fee not shown to you";
  return feeWords(line.net, line.billingFrequency, line.pricingNote, currency);
}

function FeesSummary({
  sections,
  currency,
  totals,
}: {
  sections: readonly PlannedSection[];
  currency: string;
  totals: ProposalRecord["totalsByFrequency"];
}) {
  const rows = sections.flatMap((s) => s.items.map((i) => ({ section: s.code, item: i })));
  return (
    <DocSection title="Summary of Fees">
      {rows.length === 0 ? (
        <p className="text-muted">No services have been added to this proposal yet.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-md">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col />
            <col className="w-[15%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line-strong text-left text-sm text-ink-2">
              <th className="px-2 py-2 font-semibold">Section</th>
              <th className="px-2 py-2 font-semibold">Sub Section</th>
              <th className="px-2 py-2 font-semibold">Description</th>
              <th className="px-2 py-2 font-semibold">Frequency</th>
              <th className="px-2 py-2 font-semibold">Fees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ section, item }) => (
              <tr key={item.line.id} className="border-b border-line-soft align-top">
                <td className="break-words px-2 py-2">{section}</td>
                <td className="break-words px-2 py-2">{item.code}</td>
                <td className="break-words px-2 py-2">{namedService(item.line.description, item.subject)}</td>
                <td className="break-words px-2 py-2">
                  {item.line.billingFrequency === null ? "Not stated" : FREQUENCY_WORDS[item.line.billingFrequency]}
                </td>
                <td className={cx("break-words px-2 py-2", item.line.net !== null && "tabular-nums")}>
                  {item.line.priced && item.line.net === null
                    ? "Not shown to you"
                    : summaryFee(item.line.net, item.line.pricingNote, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && <FrequencyTotals totals={totals} currency={currency} />}
    </DocSection>
  );
}

/**
 * THE TOTAL, PER FREQUENCY (D8), in the PDF's own sentence: "Total INR 25,000
 * Monthly + INR 62,500 Yearly, plus 1 service as mutually agreed". The words
 * are `totalWords`, which the builder's footer reads too. With no priced line
 * there is no total, as on paper.
 */
function FrequencyTotals({
  totals,
  currency,
}: {
  totals: ProposalRecord["totalsByFrequency"];
  currency: string;
}) {
  const { withheld, sentence } = totalWords(totals, currency);
  // A priced line whose amount this session may not see: the figure is
  // withheld by the fee axis, not missing, so the total says that instead.
  if (withheld) {
    return (
      <p>
        <span className="font-semibold">Total</span> <span className="text-muted">not shown to you</span>
      </p>
    );
  }
  if (sentence === null) return null;
  return (
    <p>
      <span className="font-semibold">Total</span> {sentence}
    </p>
  );
}

export function NoteList({
  title,
  noun,
  example,
  rows,
  mayEdit,
  onEdit,
  onStrike,
  onAdd,
  documentNoun = "proposal",
  paragraphs = false,
  headingLevel = 3,
}: {
  title: string;
  noun: string;
  /** The new line's placeholder, an "e.g." example (Wave 4). */
  example?: string;
  rows: readonly Pick<Block, "id" | "body" | "isHeading">[];
  /** What the document is called: "proposal" or "letter". */
  documentNoun?: string;
  /** A letter's cover and acceptance are paragraphs, not a bulleted list. */
  paragraphs?: boolean;
  /** 3 under a section heading; 0 draws no heading (the caller has one). */
  headingLevel?: 0 | 3;
  mayEdit: boolean;
  onEdit: (blockId: string, body: string) => Promise<SaveOutcome>;
  onStrike: (blockId: string) => Promise<SaveOutcome>;
  onAdd: (body: string) => Promise<SaveOutcome>;
}) {
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<{ blockId: string; message: string } | null>(null);
  const [striking, setStriking] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {headingLevel === 3 && <h3 className="text-lg font-semibold">{title}</h3>}
      {rows.length === 0 && !adding && (
        <p className="text-sm text-muted">None on this {documentNoun}.</p>
      )}
      <ul className="flex flex-col gap-1">
        {rows.map((b) => (
          <li key={b.id} className={cx("group/line relative flex flex-col", !b.isHeading && !paragraphs && "pl-5")}>
            {!b.isHeading && !paragraphs && (
              <span aria-hidden="true" className="absolute left-1 top-0 text-muted">
                •
              </span>
            )}
            <EditableText
              label={`the ${noun} line “${b.body.slice(0, 60)}”`}
              value={b.body}
              editable={mayEdit}
              required
              onSave={(body) => onEdit(b.id, body)}
              actions={
                <button
                  type="button"
                  disabled={striking !== null}
                  className={cx(PIECE_BUTTON, "hover:text-danger")}
                  aria-label={`Strike off the ${noun} line “${b.body.slice(0, 60)}”`}
                  title={`Strike it off this ${documentNoun}`}
                  onClick={() => {
                    setStriking(b.id);
                    setRefusal(null);
                    void onStrike(b.id).then((outcome) => {
                      setStriking(null);
                      if (outcome !== null) setRefusal({ blockId: b.id, message: outcome });
                    });
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              }
            >
              <p className={cx("whitespace-pre-wrap leading-relaxed", striking === b.id && "text-muted line-through")}>
                {b.body}
              </p>
            </EditableText>
            {refusal?.blockId === b.id && (
              <p role="alert" className="text-sm text-danger">
                {refusal.message}
              </p>
            )}
          </li>
        ))}
      </ul>
      {mayEdit &&
        (adding ? (
          <div className="pl-5">
            <EditableText
              label={`a new ${noun} line`}
              value=""
              editable
              initiallyEditing
              placeholder={example ?? `e.g. A new ${noun} line`}
              onSave={onAdd}
              onClose={() => {
                setAdding(false);
              }}
            >
              <span />
            </EditableText>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="text-sm text-brand underline"
              onClick={() => {
                setAdding(true);
              }}
            >
              Add a line to {title}
            </button>
          </div>
        ))}
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex w-full max-w-[900px] flex-col gap-6 rounded-md border border-line bg-surface p-12"
    >
      <Skeleton width="40%" height="1.6em" />
      <SkeletonText lines={3} />
      <Skeleton width="30%" height="1.2em" />
      <SkeletonText lines={5} />
    </div>
  );
}
