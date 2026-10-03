"use client";

/**
 * THE ENGAGEMENT LETTER, AS THE PDF (2026-09-28). Replaces `<LetterDocument>`,
 * the HTML imitation of the Annexure letter: the pages are the server's own
 * PDF (the cover letter with both signature blocks, Annexure 1, Annexure 2),
 * and on a live draft every piece the imitation let a person change is changed
 * ON the page or from the "Edit" list beside it.
 *
 * - A DRAFT is drawn by `POST /documents/preview` as Send will leave it: dated
 *   today (the caller's day, as Send takes it) unless the drafter set a date,
 *   with the firm's signature block when the firm names a signatory.
 * - A letter that went out shows its SIGNED COPY once one is filed (the
 *   provider's, or one a colleague uploaded). Until then it is drawn from its
 *   frozen rows, which the freeze makes the very PDF the client was sent.
 *
 * Every write is the imitation's, to the same route, through the same store
 * (`useLetter`): the head to `PATCH /engagement-letters/{id}`, a service to
 * `PATCH …/lines/{lineId}` for every line its item prints for, a section to
 * its fee-group route, the prose to the document-block routes. Terms are added
 * under the pages, as before.
 */

import { useEffect, useState } from "react";
import { api, apiError, clauseApplies, lawFits, readClauseBody } from "@/lib/api/client";
import type { ConfigEntry, LetterRecord } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Button, Notice, Select, cx } from "@/components/ui";
import { useSession } from "@/components/layout";
import { browserDay, longDay } from "@/lib/day";
import { PdfWorkspace, usePreview, useStoredPdf } from "@/components/pdf-pages";
import type { Piece, PieceGroup } from "@/components/pdf-pages";
import {
  BackToStandard,
  BrandMissing,
  EditableFee,
  EditableText,
  TERMS,
  addPiece,
  blockPiece,
  choicePiece,
  textPiece,
} from "@/components/proposal-document";
import type { SaveOutcome } from "@/components/proposal-document";
import { FeesNotShown } from "@/components/proposal-document";
import { putLetter, useLetter } from "./store";
import { StandardsHelp } from "@/lib/ui/who-may";
import { letterFee } from "./words";

type LineChange = components["schemas"]["UpdateEngagementLetterLineRequest"];
type HeadChange = components["schemas"]["ReviseEngagementLetterRequest"];
type GroupChange = components["schemas"]["EditFeeGroupRequest"];
type StandardTerms = components["schemas"]["StandardClausesAdded"];
type Block = LetterRecord["blocks"][number];
type NoteKind = "cover" | "acceptance" | "commercial" | "team" | "exclusion";
type StoredDoc = components["schemas"]["Document"];

/** The letter's prose, in the order the PDF prints it. */
const PROSE: readonly { kind: NoteKind; title: string; noun: string; example: string }[] = [
  { kind: "commercial", title: "Commercials", noun: "commercial", example: "e.g. Invoices are payable within 15 days of issue." },
  { kind: "team", title: "Team deployment", noun: "team", example: "e.g. Priya Shah leads the engagement." },
  { kind: "exclusion", title: "General scope exclusions", noun: "exclusion", example: "e.g. Statutory fees and penalties are not included." },
];

interface Choice {
  readonly value: string;
  readonly label: string;
}

export function LetterPdf({
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
  // B01/F01: the letter prints every fee; it is drawn only for a login that
  // sees fees, and nothing is asked of the API for one that does not.
  const seesFees = session?.commercialVisibility === true;
  const [people, setPeople] = useState<readonly Choice[]>([]);
  const [signedCopy, setSignedCopy] = useState<StoredDoc | null>(null);
  const [today] = useState(browserDay);

  const deleted = record?.letter.deletedAt != null;
  const isDraft = record?.letter.status === "draft" && !deleted;
  const mayEdit = editable && isDraft && (session?.permissions.includes("party:write") ?? false);
  const clientId = record?.party.id ?? null;
  const status = record?.letter.status ?? null;
  const ofRecord = signedCopy !== null && !isDraft;

  // THE SIGNED COPY, once one is filed: a PDF someone supplied (`uploaded`,
  // which is how the provider's copy and a colleague's scan are both stored)
  // filed as the engagement letter on this letter. Renders are `generated`.
  useEffect(() => {
    if (status === null || status === "draft" || !seesFees) return;
    let live = true;
    void api
      .GET("/api/v1/subjects/{subjectKind}/{subjectRef}/documents", {
        params: { path: { subjectKind: "engagement_letter", subjectRef: letterId } },
      })
      .then((r) => {
        if (!live) return;
        const copy = (r.data?.documents ?? []).find(
          (d) =>
            d.origin === "uploaded" &&
            d.kind === "engagement_letter" &&
            d.latestVersion.mediaType === "application/pdf",
        );
        setSignedCopy(copy ?? null);
      });
    return () => {
      live = false;
    };
  }, [status, letterId, seesFees]);

  const preview = usePreview({
    kind: "engagement_letter",
    subjectRef: letterId,
    revision: record === null ? "" : JSON.stringify(record),
    enabled: record !== null && !ofRecord && seesFees,
    asOf: isDraft ? today : undefined,
  });
  const stored = useStoredPdf({
    documentId: ofRecord && signedCopy !== null ? signedCopy.id : null,
    versionId: ofRecord && signedCopy !== null ? signedCopy.latestVersion.id : undefined,
  });

  useEffect(() => {
    if (!mayEdit || clientId === null) return;
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: clientId } } })
      .then((r) => {
        setPeople((r.data?.people ?? []).map((p) => ({ value: p.id, label: p.displayName })));
      });
  }, [mayEdit, clientId]);

  if (!loaded && record === null) {
    return <PdfWorkspace label="Engagement letter" data={null} anchors={[]} updating={false} groups={null} />;
  }
  if (record === null) return <Notice tone="danger">{error ?? "This letter could not be read."}</Notice>;
  if (session !== null && !seesFees) return <FeesNotShown what="letter" />;

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
    const result = await api.PATCH("/api/v1/engagement-letters/{letterId}", { params: { path: { letterId } }, body });
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

  async function addBlock(kind: NoteKind, body: string): Promise<SaveOutcome> {
    const last = blocksOf(kind).at(-1);
    const result = await api.POST("/api/v1/document-blocks", {
      body: { engagementLetterId: letterId, kind, body, sortOrder: (last?.sortOrder ?? 0) + 1, isHeading: false },
    });
    if (result.error) return apiError(result.error).message;
    await changed();
    return null;
  }

  const addressee = record.addressedTo;
  const addresseeChoices: Choice[] = [
    { value: "", label: `${record.party.displayName} (no individual)` },
    ...people,
    ...(addressee !== null && !people.some((p) => p.value === addressee.id)
      ? [{ value: addressee.id, label: addressee.displayName }]
      : []),
  ];

  const proseGroup = (kind: NoteKind, title: string, noun: string, example: string): PieceGroup => ({
    title,
    pieces: [
      ...blocksOf(kind).map((b) => blockPiece(b, noun, "letter", editBlock, strikeBlock)),
      addPiece({ kind, title, noun, example, onAdd: (body) => addBlock(kind, body) }),
    ],
  });

  // Each fee row goes with its section: a section's own fee, or a line priced
  // on its own, which prints in the section that lists it.
  const feePieceFor = (f: LetterRecord["document"]["fees"][number]): Piece | null => {
    const line = f.lineId === null ? null : lineOf(f.lineId);
    const group = groupOf(f.feeGroupId);
    const withheld = f.amount === null && (line?.priced === true || group !== null);
    if (withheld) return null;
    const words = letterFee(f.amount, f.billingFrequency, f.pricingNote, currency);
    const shown = (
      <p className={cx(f.amount !== null && "tabular-nums")}>
        {words}
        {f.paymentTerms !== null && <span className="block text-sm text-muted">({f.paymentTerms})</span>}
      </p>
    );
    if (line !== null) {
      const fee = (open: boolean, close?: () => void) => (
        <EditableFee
          line={line}
          currency={currency}
          editable
          onSave={(change) => reviseLines([line.id], { unitAmount: change.unitAmount, billingFrequency: change.billingFrequency })}
          initiallyEditing={open}
          {...(close === undefined ? {} : { onClose: close })}
        >
          {shown}
        </EditableFee>
      );
      return {
        key: `fee:line:${line.id}`,
        label: `Edit the fee for ${f.code}`,
        listed: (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">Fee for {f.code}</p>
            {fee(false)}
          </div>
        ),
        editor: (close) => fee(true, close),
      };
    }
    if (group !== null) {
      const fee = (open: boolean, close?: () => void) => (
        <EditableFee
          line={{
            unitAmount: group.amount,
            billingFrequency: group.billingFrequency,
            quantity: "1",
            discountPercent: null,
            description: group.title,
          }}
          currency={currency}
          editable
          onSave={(change) =>
            reviseGroup(group.id, {
              amount: change.unitAmount,
              ...(change.billingFrequency === null ? {} : { billingFrequency: change.billingFrequency }),
            })
          }
          initiallyEditing={open}
          {...(close === undefined ? {} : { onClose: close })}
        >
          {shown}
        </EditableFee>
      );
      return {
        key: `fee:group:${group.id}`,
        label: `Edit the fee for section ${f.code}`,
        listed: (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">Fee for section {f.code}</p>
            {fee(false)}
          </div>
        ),
        editor: (close) => fee(true, close),
      };
    }
    return null;
  };

  const fees = record.document.fees;
  const placedFees = new Set<number>();
  const sectionGroups = record.document.sections.map((section): PieceGroup => {
    const group = groupOf(section.feeGroupId);
    const pieces: Piece[] = [];
    if (group !== null) {
      pieces.push(
        textPiece({
          key: `section:${group.id}.title`,
          noun: `the title of section ${section.code}`,
          value: group.title,
          multiline: false,
          required: true,
          maxLength: 200,
          onSave: (title) => reviseGroup(group.id, { title }),
        }),
        textPiece({
          key: `section:${group.id}.intro`,
          noun: `the introduction of section ${section.code}`,
          value: group.intro,
          placeholder: "e.g. The recurring work for the year, for one monthly fee.",
          onSave: (intro) => reviseGroup(group.id, { intro }),
        }),
      );
    }
    for (const item of section.items) {
      const first = item.lineIds[0];
      const head = first === undefined ? null : lineOf(first);
      if (head === null || first === undefined) continue;
      pieces.push(
        textPiece({
          key: `line:${first}.name`,
          noun: `the name of ${item.code}`,
          value: item.description,
          multiline: false,
          required: true,
          maxLength: 500,
          onSave: (description) => reviseLines(item.lineIds, { description }),
        }),
      );
      for (const t of TERMS) {
        const term = head.terms[t.key];
        const onSave = (text: string) => reviseLines(item.lineIds, { [t.override]: text === "" ? null : text });
        if (term.text === null) continue;
        pieces.push(
          textPiece({
            key: `line:${first}.${t.key}`,
            noun: `the ${t.noun} of ${item.code}`,
            value: term.text,
            placeholder: t.example,
            onSave,
            after: term.tailored ? (
              <BackToStandard
                noun={t.noun}
                service={item.description}
                standard={head.service?.[t.key] ?? null}
                documentNoun="letter"
                onRestore={() => reviseLines(item.lineIds, { [t.override]: null })}
              />
            ) : undefined,
          }),
        );
      }
    }
    if (group !== null) {
      pieces.push(
        textPiece({
          key: `section:${group.id}.deliverables`,
          noun: `the deliverables of section ${section.code}`,
          value: group.deliverables,
          placeholder: "e.g. Monthly financial statements by the 10th.",
          onSave: (deliverables) => reviseGroup(group.id, { deliverables }),
        }),
        textPiece({
          key: `section:${group.id}.clientObligations`,
          noun: `the client's responsibilities in section ${section.code}`,
          value: group.clientObligations,
          placeholder: "e.g. Bank statements by the 5th of each month.",
          onSave: (clientObligations) => reviseGroup(group.id, { clientObligations }),
        }),
      );
    }
    const itemLines = new Set(section.items.flatMap((i) => i.lineIds));
    fees.forEach((f, i) => {
      const here =
        (f.feeGroupId !== null && f.feeGroupId === section.feeGroupId) ||
        (f.lineId !== null && itemLines.has(f.lineId));
      if (!here || placedFees.has(i)) return;
      placedFees.add(i);
      const piece = feePieceFor(f);
      if (piece !== null) pieces.push(piece);
    });
    return { title: `${section.code}. ${section.title}`, pieces };
  });
  const otherFees = fees.flatMap((f, i) => {
    if (placedFees.has(i)) return [];
    const piece = feePieceFor(f);
    return piece === null ? [] : [piece];
  });

  const groups: PieceGroup[] | null = !mayEdit
    ? null
    : [
        {
          title: "Cover letter",
          pieces: [
            textPiece({
              key: "letter.issuedOn",
              noun: "the date on the letter",
              value: letter.issuedOn,
              multiline: false,
              inputType: "date",
              shown: letter.issuedOn === null ? null : longDay(letter.issuedOn),
              onSave: (day) => revise({ issuedOn: day === "" ? null : day }),
            }),
            choicePiece({
              key: "letter.addressedTo",
              noun: "who the letter is addressed to",
              value: addressee?.id ?? "",
              options: addresseeChoices,
              shown: addressee?.displayName ?? record.party.displayName,
              onSave: (v) => revise({ addressedToPartyId: v === "" ? null : v }),
            }),
            subjectPiece(letter.title, letter.effectiveFrom, revise),
            ...blocksOf("cover").map((b) => blockPiece(b, "cover letter", "letter", editBlock, strikeBlock)),
            addPiece({
              kind: "cover",
              title: "the cover letter",
              noun: "cover letter",
              example: "e.g. This letter confirms the services you have engaged us for.",
              onAdd: (body) => addBlock("cover", body),
            }),
          ],
        },
        proseGroup("acceptance", "Acceptance", "acceptance", "e.g. The terms of this engagement are accepted."),
        {
          title: "Annexure 1",
          pieces: [
            textPiece({
              key: "letter.background",
              noun: "the Background",
              value: letter.background,
              maxLength: 20000,
              placeholder: "e.g. Acme is a Delhi manufacturer moving its books to Zoho.",
              onSave: (text) => revise({ background: text === "" ? null : text }),
            }),
          ],
        },
        ...sectionGroups,
        ...(otherFees.length === 0 ? [] : [{ title: "Summary of Fees", pieces: otherFees }]),
        ...PROSE.map((p) => proseGroup(p.kind, p.title, p.noun, p.example)),
      ];

  const pages = ofRecord ? stored.data : preview.data;
  const failure = ofRecord ? stored.error : preview.error;
  const entity = preview.issuingEntity;

  return (
    <div className="flex w-full flex-col gap-3">
      {failure !== null && <Notice tone="danger">{failure}</Notice>}
      {deleted && <p className="text-sm text-muted">Deleted as made by mistake. This is how it printed.</p>}
      <PdfWorkspace
        label={`Engagement letter ${letter.ref}`}
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
          ofRecord
            ? "The signed copy, as filed."
            : !isDraft && !deleted
              ? "The letter as it went out."
              : preview.datedAsIfSent !== null
                ? `Dated ${longDay(preview.datedAsIfSent)}. Send dates it the day it goes out.`
                : undefined
        }
      />
      {mayEdit && <LetterTerms record={record} onChanged={changed} />}
    </div>
  );
}

/** The subject line prints the letter's title and the day work begins. */
function subjectPiece(
  title: string,
  effectiveFrom: string | null,
  revise: (body: HeadChange) => Promise<SaveOutcome>,
): Piece {
  const titleBox = (open: boolean) => (
    <EditableText
      label="the subject"
      value={title}
      editable
      multiline={false}
      required
      maxLength={300}
      initiallyEditing={open}
      onSave={(next) => revise({ title: next })}
    >
      <p className="line-clamp-2">{title}</p>
    </EditableText>
  );
  const beginsBox = (
    <EditableText
      label="the day work begins"
      value={effectiveFrom}
      editable
      multiline={false}
      inputType="date"
      onSave={(day) => revise({ effectiveFrom: day === "" ? null : day })}
    >
      <p>{effectiveFrom === null ? <span className="not-set">The day it is signed</span> : longDay(effectiveFrom)}</p>
    </EditableText>
  );
  const both = (open: boolean) => (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">Subject</p>
      {titleBox(open)}
      <p className="text-sm text-muted">Work begins</p>
      {beginsBox}
    </div>
  );
  return { key: "letter.subject", label: "Edit the subject", listed: both(false), editor: () => both(true) };
}

/** Annexure 2: the terms on the letter, and adding them (T6.18 item 7). */
function LetterTerms({ record, onChanged }: { record: LetterRecord; onChanged: () => Promise<void> }) {
  const letterId = record.letter.id;
  const [clauses, setClauses] = useState<readonly ConfigEntry[]>([]);
  const [standardTerms, setStandardTerms] = useState<StandardTerms | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [oneTerm, setOneTerm] = useState("");

  useEffect(() => {
    void api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }).then((r) => {
      setClauses((r.data?.entries ?? []).filter((e) => e.published !== null));
    });
  }, []);

  async function addStandard(): Promise<void> {
    setBusy(true);
    setRefusal(null);
    setStandardTerms(null);
    const result = await api.POST("/api/v1/engagement-letters/{letterId}/clauses/standard", {
      params: { path: { letterId } },
    });
    setBusy(false);
    if (result.error) {
      setRefusal(apiError(result.error).message);
      return;
    }
    setStandardTerms(result.data);
    await onChanged();
  }

  async function addOne(): Promise<void> {
    if (oneTerm === "") return;
    setBusy(true);
    setRefusal(null);
    const result = await api.POST("/api/v1/engagement-letters/{letterId}/clauses", {
      params: { path: { letterId } },
      body: { clauseVersionId: oneTerm },
    });
    setBusy(false);
    if (result.error) {
      setRefusal(apiError(result.error).message);
      return;
    }
    setOneTerm("");
    await onChanged();
  }

  const onLetter = new Set(record.clauses.map((c) => c.clauseVersionId));
  const onLetterKeys = new Set(record.clauses.map((c) => c.key));
  const fitting = clauses.filter((entry) => {
    const published = entry.published;
    if (published === null || onLetter.has(published.id) || onLetterKeys.has(entry.entry.key)) return false;
    const body = readClauseBody(published.body);
    return clauseApplies(body, record.letter.jurisdiction) && lawFits(body, record.issuer.jurisdiction);
  });
  const skipped = standardTerms?.skipped.filter((s) => s.reason !== "Already on this letter.") ?? [];

  return (
    <section
      aria-label="Terms"
      className="flex max-w-[900px] flex-col gap-3 rounded-md border border-line bg-surface p-4"
    >
      <p className="font-semibold">
        Terms (Annexure 2):{" "}
        <span className="font-normal">
          {record.clauses.length === 0
            ? "none yet"
            : `${String(record.clauses.length)} on this letter`}
        </span>
      </p>
      <div className="cluster">
        <Button
          type="button"
          variant={record.clauses.length === 0 ? "primary" : "secondary"}
          loading={busy}
          disabled={busy}
          onClick={() => {
            void addStandard();
          }}
        >
          Add all standard terms for {record.issuer.name}
        </Button>
      </div>
      {refusal !== null && (
        <p role="alert" className="text-sm text-danger">
          {refusal}
        </p>
      )}
      {standardTerms !== null && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p>
            {standardTerms.added.length > 0
              ? `Added ${String(standardTerms.added.length)} ${standardTerms.added.length === 1 ? "term" : "terms"}.`
              : standardTerms.skipped.length === 0
                ? // CA#3 (audit 2026-10-03): the firm has written none. Say so,
                  // and where they are written, instead of a bare "none".
                  `No term was added: the firm has no standard terms for ${record.issuer.name} yet.`
                : "No term was added."}
          </p>
          {standardTerms.added.length === 0 && standardTerms.skipped.length === 0 && (
            <StandardsHelp
              opening={false}
              terms
              issuerPartyId={record.issuer.partyId}
              issuerHasCountry={record.issuer.jurisdiction !== null}
            />
          )}
          {skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted">
              {skipped.map((s) => (
                <li key={s.clauseKey}>
                  Left off {readClauseBody(clauses.find((c) => c.entry.key === s.clauseKey)?.published?.body).title || s.clauseKey}: {s.reason}
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
            disabled={busy || oneTerm === ""}
            onClick={() => {
              void addOne();
            }}
          >
            Add
          </Button>
        </div>
      )}
    </section>
  );
}
