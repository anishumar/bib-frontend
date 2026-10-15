"use client";

/**
 * THE PROPOSAL, AS THE PDF (2026-09-28). Replaces the HTML imitation that was
 * `<ProposalDocument>`: the pages are the server's own PDF (cover, logo, page
 * breaks and all), and on a live draft every piece that was editable in the
 * imitation is edited ON the page (a hotspot opens its editor) or from the
 * "Edit" list beside it.
 *
 * - A DRAFT is drawn by `POST /documents/preview`, which files nothing, and
 *   drawn again about 800 ms after the record last changed. The API dates it
 *   the day Send will, and the line under the pages says so.
 * - A SENT or answered proposal shows its PDF OF RECORD (`sentPdf`), the file
 *   the client was sent, never a fresh render. One sent before Send filed its
 *   PDF (before 2026-09-28) and never downloaded has none: it is drawn as it
 *   prints today, and the line under the pages says that too.
 *
 * Every write is the one the imitation made, to the same route, through the
 * same store (`useProposal`): the title, the two names, Background and
 * validity to `PATCH /proposals/{id}`; a service's name, its four texts and
 * its fee to `PATCH …/lines/{lineId}`; a Notes line to the document-block
 * routes.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { api, apiError } from "@/lib/api/client";
import type { ProposalLine, ProposalRecord } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";
import { Icon, Notice, NotSet, cx } from "@/components/ui";
import type { IconName } from "@/components/ui";
import { useSession } from "@/components/layout";
import { longDay } from "@/lib/day";
import { PdfWorkspace, usePreview, useStoredPdf } from "@/components/pdf-pages";
import type { Piece, PieceGroup } from "@/components/pdf-pages";
import { EditableChoice, EditableText, PIECE_BUTTON } from "./editable";
import type { SaveOutcome } from "./editable";
import { EditableFee } from "./fee";
import { BackToStandard } from "./back-to-standard";
import { planSections } from "./plan";
import type { PlannedItem } from "./plan";
import { groupFee } from "@/components/letter-builder/fee-groups";
import { useProposal, putProposal } from "./store";
import { feeWords } from "./words";

type Block = ProposalRecord["blocks"][number];
type LineChange =
  paths["/api/v1/proposals/{proposalId}/lines/{lineId}"]["patch"]["requestBody"]["content"]["application/json"];
type NoteKind = "team" | "exclusion" | "commercial";
type TermKey = keyof ProposalLine["terms"];

interface Choice {
  readonly value: string;
  readonly label: string;
}

/** The Notes, in the order and under the headings the PDF prints them. */
const NOTES: readonly { kind: NoteKind; title: string; icon: IconName; noun: string; example: string }[] = [
  { kind: "team", title: "Team Deployment", icon: "people", noun: "team", example: "e.g. Priya Shah leads the engagement." },
  {
    kind: "exclusion",
    title: "General scope exclusions",
    icon: "ban",
    noun: "exclusion",
    example: "e.g. Statutory fees and penalties are not included.",
  },
  {
    kind: "commercial",
    title: "Commercials",
    icon: "receivables",
    noun: "commercial",
    example: "e.g. Invoices are payable within 15 days of issue.",
  },
];

/** A service's four texts, in the PDF's order. */
export const TERMS: readonly {
  key: TermKey;
  override: "scopeOverride" | "volumeLimitsOverride" | "clientObligationsOverride" | "exclusionsOverride";
  heading: string;
  icon: IconName;
  noun: string;
  example: string;
}[] = [
  { key: "scope", override: "scopeOverride", heading: "Scope of work", icon: "verification", noun: "scope of work", example: "e.g. Monthly books and GST returns for one GSTIN." },
  { key: "volumeLimits", override: "volumeLimitsOverride", heading: "Volume limits", icon: "grades", noun: "volume limits", example: "e.g. Up to 300 invoices a month." },
  {
    key: "clientObligations",
    override: "clientObligationsOverride",
    heading: "Client's responsibilities",
    icon: "clients",
    noun: "client's responsibilities",
    example: "e.g. Bank statements by the 5th of each month.",
  },
  { key: "exclusions", override: "exclusionsOverride", heading: "Exclusions", icon: "ban", noun: "exclusions", example: "e.g. Statutory audit and historical clean-up." },
];

export function ProposalPdf({
  proposalId,
  editable,
  onChanged,
}: {
  proposalId: string;
  /** Whether the caller wants edit controls. They are offered only on a live
   *  draft and to a session holding `party:write`. */
  editable: boolean;
  onChanged?: () => void;
}) {
  const { record, error, loaded, reload } = useProposal(proposalId);
  const session = useSession();
  // B01/F01: the document prints every fee, so it is drawn only for a login
  // that sees fees (the API refuses /documents/preview and the PDF's bytes to
  // the rest). Such a login is told so in place of the pages, and nothing is
  // asked of the API.
  const seesFees = session?.commercialVisibility === true;
  const [people, setPeople] = useState<readonly Choice[]>([]);
  const [colleagues, setColleagues] = useState<readonly Choice[]>([]);

  const deleted = record?.proposal.deletedAt != null;
  const isDraft = record?.proposal.status === "draft" && !deleted;
  const mayEdit = editable && isDraft && (session?.permissions.includes("party:write") ?? false);
  const clientId = record?.proposal.partyId ?? null;
  const pinned = record?.sentPdf ?? null;
  // A document of record once it is out; a render otherwise.
  const ofRecord = record !== null && !isDraft && !deleted && pinned !== null;

  const preview = usePreview({
    kind: "proposal",
    subjectRef: proposalId,
    revision: record === null ? "" : JSON.stringify(record),
    enabled: record !== null && !ofRecord && seesFees,
  });
  const stored = useStoredPdf({
    documentId: seesFees && ofRecord && pinned !== null ? pinned.documentId : null,
    versionId: ofRecord && pinned !== null ? pinned.versionId : undefined,
  });

  useEffect(() => {
    if (!mayEdit || clientId === null) return;
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: clientId } } })
      .then((r) => {
        setPeople((r.data?.people ?? []).map((p) => ({ value: p.id, label: p.displayName })));
      });
    void api.GET("/api/v1/tenancy/colleagues", {}).then((r) => {
      setColleagues((r.data?.colleagues ?? []).map((c) => ({ value: c.userId, label: c.displayName ?? c.role })));
    });
  }, [mayEdit, clientId]);

  if (!loaded && record === null) {
    return <PdfWorkspace label="Proposal" data={null} anchors={[]} updating={false} groups={null} />;
  }
  if (record === null) return <Notice tone="danger">{error ?? "This proposal could not be read."}</Notice>;
  if (session !== null && !seesFees) return <FeesNotShown what="proposal" />;

  const { proposal } = record;
  const label = `Proposal ${proposal.ref}`;

  async function changed(): Promise<void> {
    await reload();
    onChanged?.();
  }

  async function revise(body: {
    title?: string;
    background?: string | null;
    validUntil?: string | null;
    addressedToPartyId?: string | null;
    preparedByUserId?: string | null;
  }): Promise<SaveOutcome> {
    const result = await api.PATCH("/api/v1/proposals/{proposalId}", { params: { path: { proposalId } }, body });
    if (result.error) return apiError(result.error).message;
    putProposal(proposalId, result.data);
    onChanged?.();
    return null;
  }

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
    const result = await api.PATCH("/api/v1/document-blocks/{blockId}", { params: { path: { blockId } }, body: { body } });
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

  const blocksOf = (kind: NoteKind): Block[] =>
    record.blocks.filter((b) => b.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);

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
    ...(record.addressee !== null && !people.some((p) => p.value === record.addressee?.id)
      ? [{ value: record.addressee.id, label: record.addressee.displayName }]
      : []),
  ];
  const preparerChoices: Choice[] = [
    { value: "", label: "Nobody named" },
    ...colleagues,
    ...(record.preparedBy !== null && !colleagues.some((c) => c.value === record.preparedBy?.userId)
      ? [{ value: record.preparedBy.userId, label: record.preparedBy.displayName ?? record.preparedBy.email }]
      : []),
  ];

  const groups: PieceGroup[] | null = !mayEdit
    ? null
    : [
        {
          title: "Cover",
          icon: "proposals",
          pieces: [
            textPiece({
              key: "proposal.title",
              noun: "the title",
              heading: "Title",
              icon: "heading",
              value: proposal.title,
              multiline: false,
              required: true,
              maxLength: 300,
              onSave: (title) => revise({ title }),
            }),
            choicePiece({
              key: "proposal.preparedFor",
              noun: "who it is prepared for",
              heading: "Prepared for",
              icon: "user",
              value: record.addressee?.id ?? "",
              options: addresseeChoices,
              shown: record.addressee?.displayName ?? record.party.displayName,
              onSave: (v) => revise({ addressedToPartyId: v === "" ? null : v }),
            }),
            choicePiece({
              key: "proposal.preparedBy",
              noun: "who prepared it",
              heading: "Prepared by",
              icon: "pencil",
              value: record.preparedBy?.userId ?? "",
              options: preparerChoices,
              shown: record.preparedBy === null ? null : (record.preparedBy.displayName ?? record.preparedBy.email),
              onSave: (v) => revise({ preparedByUserId: v === "" ? null : v }),
            }),
          ],
        },
        {
          title: "Background",
          icon: "prose",
          pieces: [
            textPiece({
              key: "proposal.background",
              noun: "the Background",
              heading: null,
              value: proposal.background,
              maxLength: 4000,
              placeholder: "e.g. Kaveri Foods makes packaged snacks and sells across India.",
              onSave: (text) => revise({ background: text === "" ? null : text }),
            }),
          ],
        },
        ...planSections(record).map(
          (s): PieceGroup => ({
            title: `${s.code}. ${s.title}`,
            icon: "structure",
            pieces: s.items.flatMap((item) =>
              servicePieces(item.code, item.line, item.line.currency, reviseLine, sectionFee(record, item)),
            ),
          }),
        ),
        {
          title: "Valid until",
          icon: "calendar",
          pieces: [
            textPiece({
              key: "proposal.validUntil",
              noun: "the date it is valid until",
              heading: null,
              value: proposal.validUntil,
              multiline: false,
              inputType: "date",
              shown: proposal.validUntil === null ? null : longDay(proposal.validUntil),
              onSave: (day) => revise({ validUntil: day === "" ? null : day }),
            }),
          ],
        },
        ...NOTES.map(
          (n): PieceGroup => ({
            title: n.title,
            icon: n.icon,
            pieces: [
              ...blocksOf(n.kind).map((b) => blockPiece(b, n.noun, "proposal", editBlock, strikeBlock)),
              addPiece({ kind: n.kind, title: n.title, noun: n.noun, example: n.example, onAdd: (body) => addBlock(n.kind, body) }),
            ],
          }),
        ),
      ];

  const pages = ofRecord ? stored.data : preview.data;
  const failure = ofRecord ? stored.error : preview.error;
  const entity = preview.issuingEntity;

  return (
    <div className="flex w-full flex-col gap-3">
      {failure !== null && <Notice tone="danger">{failure}</Notice>}
      {deleted && <p className="text-sm text-muted">Deleted as made by mistake. This is how it printed.</p>}
      <PdfWorkspace
        label={label}
        data={pages}
        anchors={ofRecord ? [] : preview.anchors}
        updating={!ofRecord && preview.updating && preview.data !== null}
        groups={groups}
        above={
          !ofRecord && entity !== null && preview.missingBrand.length > 0 ? (
            <BrandMissing entity={entity} missing={preview.missingBrand} />
          ) : undefined
        }
        below={
          ofRecord ? (
            "The PDF the client was sent."
          ) : !isDraft && !deleted ? (
            "No copy was kept when it was sent. This is how it prints today."
          ) : preview.datedAsIfSent !== null ? (
            `Dated ${longDay(preview.datedAsIfSent)}. Send dates it the day it goes out.`
          ) : undefined
        }
      />
    </div>
  );
}

/** In place of a document that prints fees, for a login that cannot see them
 *  (B01/F01): what is not shown, and who can open it. */
export function FeesNotShown({ what }: { what: "proposal" | "letter" }) {
  return (
    <Notice tone="neutral">
      The {what === "proposal" ? "proposal" : "engagement letter"} shows fees, so it is not shown to your login.
      Ask somebody who can see fees to read or print it.
    </Notice>
  );
}

/** "No cover uploaded for 10x Global FZCO. Add one", to that company's slot
 *  on /admin/brand (which honours the anchor). */
export function BrandMissing({
  entity,
  missing,
}: {
  entity: { partyId: string; name: string };
  missing: readonly ("logo" | "proposal_cover")[];
}) {
  const what =
    missing.includes("logo") && missing.includes("proposal_cover")
      ? "No logo or cover"
      : missing.includes("logo")
        ? "No logo"
        : "No cover";
  return (
    <span>
      {what} uploaded for {entity.name}.{" "}
      <Link href={`/admin/brand#brand-entity-${entity.partyId}` as Route}>Add {missing.length > 1 ? "them" : "one"}</Link>
    </span>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

/** How a piece reads in the list: a few lines of its words, or "Not set". */
function Shown({ text }: { text: string | null }) {
  return text === null || text.trim() === "" ? (
    <p>
      <NotSet />
    </p>
  ) : (
    <p className="line-clamp-3 whitespace-pre-wrap">{text}</p>
  );
}

/** A piece's label in the Edit list: a small mark and a short name. The
 *  noun (who it is prepared for, the scope of work of A1) still names it to a
 *  screen reader and in the popover; the list shows the short name, because
 *  the group heading above it already says which service. Left out where the
 *  group holds one piece and its heading is the label. */
function PieceLabel({ icon, text }: { icon?: IconName | undefined; text: string | null }) {
  if (text === null) return null;
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
      {icon !== undefined && (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm bg-surface-sunk text-ink-2">
          <Icon name={icon} size={14} />
        </span>
      )}
      {text}
    </p>
  );
}

export function textPiece(opts: {
  key: string;
  noun: string;
  /** The short name in the list, and its mark; null hides the label. */
  heading?: string | null;
  icon?: IconName;
  value: string | null;
  onSave: (next: string) => Promise<SaveOutcome>;
  multiline?: boolean;
  inputType?: "text" | "date";
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** How the value reads, when not as typed (a date). */
  shown?: string | null;
  /** Under the words in the list ("Back to standard"). */
  after?: ReactNode;
}): Piece {
  const common = {
    label: opts.noun,
    value: opts.value,
    editable: true,
    onSave: opts.onSave,
    multiline: opts.multiline ?? true,
    inputType: opts.inputType ?? ("text" as const),
    required: opts.required ?? false,
    ...(opts.maxLength === undefined ? {} : { maxLength: opts.maxLength }),
    ...(opts.placeholder === undefined ? {} : { placeholder: opts.placeholder }),
  };
  return {
    key: opts.key,
    label: `Edit ${opts.noun}`,
    listed: (
      <div className="flex flex-col gap-1">
        <PieceLabel icon={opts.icon} text={opts.heading === undefined ? capitalise(opts.noun) : opts.heading} />
        <EditableText {...common}>
          <Shown text={opts.shown === undefined ? opts.value : opts.shown} />
        </EditableText>
        {opts.after}
      </div>
    ),
    editor: (close) => (
      <EditableText {...common} initiallyEditing onClose={close}>
        <span />
      </EditableText>
    ),
  };
}

export function choicePiece(opts: {
  key: string;
  noun: string;
  heading?: string | null;
  icon?: IconName;
  value: string;
  options: readonly Choice[];
  shown: string | null;
  onSave: (next: string) => Promise<SaveOutcome>;
}): Piece {
  const common = { label: opts.noun, value: opts.value, options: opts.options, editable: true, onSave: opts.onSave };
  return {
    key: opts.key,
    label: `Change ${opts.noun}`,
    listed: (
      <div className="flex flex-col gap-1">
        <PieceLabel icon={opts.icon} text={opts.heading === undefined ? capitalise(opts.noun) : opts.heading} />
        <EditableChoice {...common}>
          <Shown text={opts.shown} />
        </EditableChoice>
      </div>
    ),
    editor: (close) => (
      <EditableChoice {...common} initiallyEditing onClose={close}>
        <span />
      </EditableChoice>
    ),
  };
}

/**
 * What a service in a section prints for its fee, as the PDF does (0394): the
 * section's fee on its first service, "Included in A1" on the rest. Null for a
 * service priced on its own. Changed in "One fee for several services".
 */
function sectionFee(record: ProposalRecord, item: PlannedItem): string | null {
  const g = record.feeGroups.find((x) => x.id === item.line.feeGroupId);
  if (g === undefined) return null;
  if (item.includedIn !== null) return `Included in ${item.includedIn}`;
  return g.amount === null ? `${g.title}: fee not shown to you` : `${groupFee(g)} (${g.title})`;
}

/** A service's name, its texts (those the catalogue or this proposal gives
 *  it; an empty one is added from the list) and its fee. */
function servicePieces(
  code: string,
  line: ProposalLine,
  currency: string,
  reviseLine: (lineId: string, change: LineChange) => Promise<SaveOutcome>,
  inSection: string | null,
): Piece[] {
  const name = line.description;
  const pieces: Piece[] = [
    textPiece({
      key: `line:${line.id}.name`,
      noun: `the name of ${code}`,
      heading: `${code} · Service`,
      icon: "board",
      value: name,
      multiline: false,
      required: true,
      maxLength: 500,
      onSave: (description) => reviseLine(line.id, { description }),
    }),
  ];
  for (const t of TERMS) {
    const term = line.terms[t.key];
    const onSave = (text: string) => reviseLine(line.id, { [t.override]: text === "" ? null : text });
    if (term.text === null) {
      pieces.push({
        key: `line:${line.id}.${t.key}`,
        label: `Add ${t.noun} to ${code}`,
        listed: <AddText label={`Add ${t.noun}`} noun={`${t.noun} of ${name}`} example={t.example} onSave={onSave} />,
        editor: (close) => (
          <EditableText label={`${t.noun} of ${name}`} value="" editable initiallyEditing placeholder={t.example} onSave={onSave} onClose={close}>
            <span />
          </EditableText>
        ),
      });
      continue;
    }
    pieces.push(
      textPiece({
        key: `line:${line.id}.${t.key}`,
        noun: `the ${t.noun} of ${code}`,
        heading: t.heading,
        icon: t.icon,
        value: term.text,
        placeholder: t.example,
        onSave,
        after: term.tailored ? (
          <BackToStandard
            noun={t.noun}
            service={name}
            standard={term.standard}
            onRestore={() => reviseLine(line.id, { [t.override]: null })}
          />
        ) : undefined,
      }),
    );
  }
  if (inSection !== null) {
    pieces.push({
      key: `fee:line:${line.id}`,
      label: `The fee for ${code}`,
      listed: (
        <div className="flex flex-col gap-1">
          <PieceLabel icon="receivables" text="Fee" />
          <p>{inSection}</p>
        </div>
      ),
      editor: () => <p>{inSection}</p>,
    });
    return pieces;
  }
  const withheld = line.priced && line.net === null;
  const words = withheld ? "Fee not shown to you" : feeWords(line.net, line.billingFrequency, line.pricingNote, currency);
  const fee = (open: boolean, close?: () => void) => (
    <EditableFee
      line={line}
      currency={currency}
      editable={!withheld}
      onSave={(change) => reviseLine(line.id, change)}
      initiallyEditing={open}
      {...(close === undefined ? {} : { onClose: close })}
    >
      <p className={cx(line.net !== null && "tabular-nums")}>{words}</p>
    </EditableFee>
  );
  pieces.push({
    key: `fee:line:${line.id}`,
    label: `Edit the fee for ${code}`,
    listed: (
      <div className="flex flex-col gap-1">
        <PieceLabel icon="receivables" text="Fee" />
        {fee(false)}
      </div>
    ),
    editor: (close) => fee(true, close),
  });
  return pieces;
}

/** One Notes line: its words, and striking it off. */
export function blockPiece(
  b: Pick<Block, "id" | "body">,
  noun: string,
  documentNoun: string,
  onEdit: (blockId: string, body: string) => Promise<SaveOutcome>,
  onStrike: (blockId: string) => Promise<SaveOutcome>,
): Piece {
  const short = b.body.length > 60 ? `${b.body.slice(0, 57)}…` : b.body;
  const common = {
    label: `the ${noun} line “${short}”`,
    value: b.body,
    editable: true,
    required: true,
    onSave: (body: string) => onEdit(b.id, body),
  };
  return {
    key: `block:${b.id}`,
    label: `Edit the ${noun} line`,
    listed: (
      <EditableText
        {...common}
        actions={<StrikeButton label={`Strike off the ${noun} line “${short}”`} onStrike={() => onStrike(b.id)} documentNoun={documentNoun} />}
      >
        <Shown text={b.body} />
      </EditableText>
    ),
    editor: (close) => (
      <div className="flex flex-col gap-2">
        <EditableText {...common} initiallyEditing onClose={close}>
          <span />
        </EditableText>
        <StrikeLink onStrike={() => onStrike(b.id)} onDone={close} documentNoun={documentNoun} />
      </div>
    ),
  };
}

/** "Add a line to Commercials": the list's button, and the page's heading. */
export function addPiece(opts: {
  kind: string;
  title: string;
  noun: string;
  example: string;
  onAdd: (body: string) => Promise<SaveOutcome>;
}): Piece {
  return {
    key: `add:${opts.kind}`,
    label: `Add a line to ${opts.title}`,
    listed: <AddText label={`Add a line to ${opts.title}`} noun={`a new ${opts.noun} line`} example={opts.example} onSave={opts.onAdd} />,
    editor: (close) => (
      <EditableText label={`a new ${opts.noun} line`} value="" editable initiallyEditing placeholder={opts.example} onSave={opts.onAdd} onClose={close}>
        <span />
      </EditableText>
    ),
  };
}

/** A link that opens a box for words the document does not have yet. */
function AddText({
  label,
  noun,
  example,
  onSave,
}: {
  label: string;
  noun: string;
  example: string;
  onSave: (next: string) => Promise<SaveOutcome>;
}) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <EditableText
        label={noun}
        value=""
        editable
        initiallyEditing
        placeholder={example}
        onSave={onSave}
        onClose={() => {
          setAdding(false);
        }}
      >
        <span />
      </EditableText>
    );
  }
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-semibold text-ink-2 hover:text-ink hover:underline"
      onClick={() => {
        setAdding(true);
      }}
    >
      <Icon name="plus" size={14} />
      {label}
    </button>
  );
}

function StrikeButton({
  label,
  onStrike,
  documentNoun,
}: {
  label: string;
  onStrike: () => Promise<SaveOutcome>;
  documentNoun: string;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={cx(PIECE_BUTTON, "hover:text-danger")}
        aria-label={label}
        title={`Strike it off this ${documentNoun}`}
        onClick={() => {
          setBusy(true);
          setRefusal(null);
          void onStrike().then((outcome) => {
            setBusy(false);
            setRefusal(outcome);
          });
        }}
      >
        <Icon name="close" size={16} />
      </button>
      {refusal !== null && (
        <span role="alert" className="text-sm text-danger">
          {refusal}
        </span>
      )}
    </>
  );
}

function StrikeLink({
  onStrike,
  onDone,
  documentNoun,
}: {
  onStrike: () => Promise<SaveOutcome>;
  onDone: () => void;
  documentNoun: string;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        className="text-sm text-danger underline"
        // On mouse DOWN: a click would blur the box above first, and blurring
        // saves, which would close this before the line is struck off.
        onMouseDown={(e) => {
          e.preventDefault();
          setBusy(true);
          setRefusal(null);
          void onStrike().then((outcome) => {
            setBusy(false);
            if (outcome === null) onDone();
            else setRefusal(outcome);
          });
        }}
      >
        {busy ? "Striking it off…" : `Strike it off this ${documentNoun}`}
      </button>
      {refusal !== null && (
        <span role="alert" className="text-sm text-danger">
          {refusal}
        </span>
      )}
    </div>
  );
}

function capitalise(text: string): string {
  const bare = text.replace(/^the /, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}
