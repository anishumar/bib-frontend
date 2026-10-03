"use client";

/**
 * The Files panel — one component, dropped onto everything a document attaches
 * to (T3.6).
 *
 * A COMPONENT AND NOT FOUR SCREENS, because a document is never the thing
 * somebody came to look at. Nobody opens the product to browse files; they open
 * a client, a letter, an invoice or a job, and the files are part of what that
 * thing IS. So this lives on those pages, and the subject kind is a prop.
 *
 * That is also what the API is shaped for: `GET /subjects/{kind}/{ref}/documents`
 * is the read, and the upload attaches in the same call that stores — because a
 * file is almost always uploaded ONTO something, and a two-step "upload, then
 * attach" would leave an orphan behind every time somebody closed the tab.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  apiError,
  downloadDocument,
  formatBytes,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
} from "@/lib/api/client";
import { Cluster } from "@/components/layout";
import { useSeesFees } from "@/components/fees";
import { longInstant } from "@/lib/day";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  ErrorNotice,
  Field,
  FieldRow,
  Icon,
  Input,
  Pill,
  Select,
  Sub,
  Switch,
  Table,
  TableWrap,
  Td,
  Th,
  Tooltip,
  useSwapFocus,
} from "@/components/ui";
import type {
  DocumentSubjectKind,
  StoredDocument,
  StoredDocumentVersion,
  SubjectFile,
} from "@/lib/api/client";

/**
 * Who uploaded a file, in one line.
 *
 * NULL is two different facts and the API is careful to let us tell them apart:
 * the product generated the file, or the person's account has been erased. The
 * `origin` field is what separates them, so this says which — "the product made
 * this" and "we no longer know who" are not the same sentence, and rendering
 * both as a dash would throw away a distinction the backend went to the trouble
 * of keeping.
 *
 * When somebody IS named, the email is the fallback: an account may have no
 * display name, and the first cut of this API collapsed that into the same null
 * as the system actor. Building this line is what found it.
 */
function uploader(doc: StoredDocument): string {
  if (doc.createdBy !== null) {
    return doc.createdBy.displayName ?? doc.createdBy.email;
  }
  return doc.origin === "generated" ? "made by BiB" : "uploader no longer on record";
}

/** What a file made by BiB is to this page, in one pill (2026-09-29). */
function madeAs(doc: SubjectFile): string | null {
  if (doc.role === "copy_of_record") return doc.kind === "invoice" ? "Issued copy" : "Copy as sent";
  if (doc.role === "draft_copy") return "Draft, firm only";
  // The signing provider's own files, filed when an envelope completes (F30).
  if (doc.role === "signed") return "Signed copy";
  if (doc.role === "certificate_of_completion") return "Signing certificate";
  return doc.origin === "generated" ? "Generated" : null;
}

/** The day a version was filed, WHERE THE READER IS, as every other date on
 *  the screen reads ("28 Sep 2026"). `createdAt` is an instant, and
 *  `.slice(0, 10)` (what this once was) is its UTC day: a PDF made in India
 *  before 05:30 read as filed the day before (found by the T6.18 walk). */
function when(iso: string): string {
  return longInstant(iso);
}

export interface DocumentsProps {
  /** What these files hang off. A closed set in the API — an unknown kind is
   *  refused at the write rather than becoming a link nothing can follow. */
  readonly subjectKind: DocumentSubjectKind;
  readonly subjectRef: string;
  /**
   * The client the files belong to, when the subject implies one.
   *
   * Passed through to the upload so the document carries `partyId` — the column
   * the client portal's record scope (Gate 4) will filter on. Absent is a real
   * answer: a job's working papers belong to the firm, not to a client.
   */
  readonly partyId?: string | undefined;
  /** `party:write`. Decides what to OFFER — the API is still the only place the
   *  answer lives, and its refusal is shown verbatim when one arrives. */
  readonly canWrite: boolean;
  /** Overrides the default heading, for a page where "Files" is ambiguous. */
  readonly title?: string;
  /** What this panel is for, in the empty state. Every subject wants a
   *  different sentence: a client's file is not a job's working paper. */
  readonly emptyHint: string;
  /**
   * Offer a "Generate PDF" button for this kind of document (T3.8).
   *
   * Only where the API can actually render one — an engagement letter, an
   * invoice and, since 0084, a proposal. Absent means no button, which is right
   * for a client's file and a job's working papers: there is nothing to generate.
   */
  readonly renderable?: "engagement_letter" | "invoice" | "proposal" | undefined;
  /**
   * An invoice that was issued, or a letter that was sent (2026-09-29). Its
   * first copy from then on is the copy of record and the API refuses a
   * second, so once one is on the list nothing is offered. Before that, the
   * button makes a DRAFT copy the client never sees.
   */
  readonly wentOut?: boolean | undefined;
}

export function Documents({
  subjectKind,
  subjectRef,
  partyId,
  canWrite,
  title = "Files",
  emptyHint,
  renderable,
  wentOut = false,
}: DocumentsProps) {
  const [documents, setDocuments] = useState<readonly SubjectFile[]>([]);
  const [versions, setVersions] = useState<Record<string, readonly StoredDocumentVersion[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // "Add a file" is hidden while the form is open, so pressing it unmounts the
  // focused button and focus falls to <body>. This component is on six
  // screens, so that is six screens. See `useSwapFocus`.
  const { panel: addPanel, trigger: addTrigger } = useSwapFocus(adding);
  // B01/F01: a proposal, a letter, an invoice and a credit note print the
  // firm's fees, and their PDFs open, and are made, only for a login that
  // sees fees. The API refuses the rest (FEES_NOT_VISIBLE); this offers only
  // what will work. Every kind this panel can make is one of the four.
  const seesFees = useSeesFees();

  // WHAT THE BUTTON MAKES (2026-09-29). An invoice or a letter in draft is
  // printed as the firm's own draft copy. Once it has gone out, its first copy
  // is the copy of record and there is never a second: the button goes as soon
  // as one is on the list, and waits for the list so it never flashes.
  const recordKind = renderable === "invoice" || renderable === "engagement_letter";
  const make: string | null = !recordKind
    ? "Generate PDF"
    : !wentOut
      ? "Make a draft copy"
      : !loaded || documents.some((d) => d.role === "copy_of_record")
        ? null
        : renderable === "invoice"
          ? "Make the issued copy"
          : "Make the copy as sent";

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/subjects/{subjectKind}/{subjectRef}/documents", {
      params: { path: { subjectKind, subjectRef } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setDocuments(result.data.documents);
    setLoaded(true);
  }, [subjectKind, subjectRef]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Share this file with its client, or stop sharing it.
   *
   * RELOADS THE WHOLE LIST rather than patching the row. The API's answer is
   * the record as it now stands, and the flag is enforced by a database policy
   * — so a local `setState` would be this screen's guess about what happened,
   * and the one place a guess must not stand is a control that decides who
   * outside the firm can read a file.
   */
  const share = useCallback(
    async (documentId: string, visible: boolean): Promise<void> => {
      const result = await api.PATCH("/api/v1/documents/{documentId}/client-visibility", {
        params: { path: { documentId } },
        body: { isClientVisible: visible },
      });
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      await load();
    },
    [load],
  );

  /**
   * Take a file OFF this page. Withdrawn, never deleted (0302, decided
   * 2026-09-25): the API keeps the link as history, marked with who and when,
   * and the document simply stops being listed here. Every other place it is
   * attached, and the bytes, are untouched. Reloads for `share`'s reason.
   */
  const withdraw = useCallback(
    async (documentId: string): Promise<void> => {
      const result = await api.POST("/api/v1/documents/{documentId}/links/withdraw", {
        params: { path: { documentId } },
        body: { subjectKind, subjectRef },
      });
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      await load();
    },
    [load, subjectKind, subjectRef],
  );

  async function upload(form: FormData): Promise<void> {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      // Caught here only to say something useful sooner. The API refuses an
      // empty file too, and says the better sentence ("an empty file is a
      // failed upload, not a document") — this is the case where the browser
      // never attached one at all.
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);

    // Rebuilt rather than posted through, because the API takes the subject as
    // part of the upload and the form does not know it. `openapi-fetch` would
    // serialise a declared body as JSON, so the FormData goes on `body` with
    // the content type left for the browser to set — it has to add the
    // multipart boundary, and any value we set here would be missing it.
    const payload = new FormData();
    payload.set("file", file);
    payload.set("title", String(form.get("title") ?? "").trim());
    payload.set("kind", String(form.get("kind") ?? "other"));
    payload.set("subjectKind", subjectKind);
    payload.set("subjectRef", subjectRef);
    if (partyId !== undefined) payload.set("partyId", partyId);

    const result = await api.POST("/api/v1/documents", {
      body: payload as unknown as never,
      bodySerializer: (b: unknown) => b as FormData,
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    formRef.current?.reset();
    setAdding(false);
    await load();
  }

  /**
   * Render the record this panel hangs off, and store the result.
   *
   * Safe to press twice: the renderer is deterministic and the store is
   * content-addressed, so a second press produces the same bytes and writes no
   * second blob. It DOES create a second document row, which is correct —
   * generating a copy is an act, and the ledger records who did it.
   */
  async function generate(): Promise<void> {
    if (renderable === undefined) return;
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/documents/render", {
      // NO `partyId`. The API used to take one and filed the rendered PDF under
      // whatever the caller named — and a rendered invoice is client-visible by
      // default, so naming the wrong client put one firm's invoice in another
      // client's portal library. The record knows whose it is; the API reads it
      // there now, and the field is gone from the request schema.
      body: { kind: renderable, subjectRef },
    });
    setBusy(false);
    if (result.error) {
      // Shown verbatim. The 400 here is the renderer's own limit — it names the
      // character it cannot draw and where it appeared — and paraphrasing it
      // would throw away the only part somebody can act on.
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  async function showVersions(documentId: string): Promise<void> {
    if (expanded === documentId) {
      setExpanded(null);
      return;
    }
    setExpanded(documentId);
    if (documentId in versions) return;
    const result = await api.GET("/api/v1/documents/{documentId}/versions", {
      params: { path: { documentId } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setVersions((v) => ({ ...v, [documentId]: result.data.versions }));
  }

  async function get(documentId: string, filename: string, versionId?: string): Promise<void> {
    setError(null);
    const failure = await downloadDocument(documentId, filename, versionId);
    // A failed download is the one place this panel must not stay quiet: the
    // browser shows nothing at all, so without this the button looks broken.
    // 502 in particular means the metadata is intact and storage lost the
    // bytes, which is a different thing from a missing document.
    if (failure !== null) setError(failure);
  }

  return (
    <Card>
      <CardHead
        /* Every screen renders this as a top-level card beside its other
           top-level cards, so it is an h2 on all five of them. */
        level={2}
        title={title}
        aside={
          <>
            {documents.length > 0 && <Pill tone="quiet">{documents.length}</Pill>}
            {canWrite && seesFees === true && renderable !== undefined && make !== null && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                icon={<Icon name="files" size={15} />}
                onClick={() => void generate()}
              >
                {make}
              </Button>
            )}
            {canWrite && !adding && (
              <Button
                ref={addTrigger}
                variant="secondary"
                size="sm"
                icon={<Icon name="plus" size={15} />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                Add a file
              </Button>
            )}
          </>
        }
      />

      <ErrorNotice error={error} />

      {canWrite && adding && (
        <div ref={addPanel} tabIndex={-1}>
        <form ref={formRef} action={(fd) => void upload(fd)}>
          <div className="stack">
            <FieldRow>
              <Field label="Title">
                <Input
                  name="title"
                  required
                  placeholder={
                    subjectKind === "work_item" || subjectKind === "job"
                      ? "e.g. GSTR-3B challan, September"
                      : "e.g. PAN card"
                  }
                  maxLength={200}
                />
              </Field>
              {/* NO KIND IS PICKED FOR THEM (audit 2026-10-03, CA#31). It
                  opened on Identity proof, so a GST working paper attached in a
                  hurry was filed as somebody's ID. The person chooses. */}
              <Field label="What it is">
                {/* Nothing preselected (F13, CA#31): a GST working paper was
                    filed as "Identity proof" because nobody changed it. */}
                <Select name="kind" required defaultValue="">
                  <option value="" disabled>
                    Choose what it is
                  </option>
                  {DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENT_KIND_LABELS[k] ?? k}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            {/* The title is required and deliberately not defaulted from the
                filename: "scan_0043.pdf" is what a scanner produces and is not
                a title anybody can find a document by later. */}
            <Field
              label="File"
              hint="Give it a clear title. The file name alone is often not enough to find it later."
            >
              <Input name="file" type="file" required />
            </Field>
            <Cluster>
              <Button type="submit" loading={busy}>
                Upload
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </Cluster>
          </div>
        </form>
        </div>
      )}

      {!loaded ? (
        <Loading label="Loading files" />
      ) : documents.length === 0 ? (
        <Empty title="Nothing attached yet" icon="files">
          {emptyHint}
        </Empty>
      ) : (
        <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>What</Th>
              <Th>Client can see</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <FileRows
                key={d.id}
                doc={d}
                expanded={expanded === d.id}
                versions={versions[d.id]}
                onToggle={() => void showVersions(d.id)}
                onDownload={(versionId, filename) => void get(d.id, filename, versionId)}
                mayOpen={!d.showsFees || seesFees === true}
                canWrite={canWrite}
                onShare={(visible) => void share(d.id, visible)}
                onWithdraw={() => void withdraw(d.id)}
              />
            ))}
          </tbody>
        </Table>
        </TableWrap>
      )}
    </Card>
  );
}

/** Where Download would be, for a document that shows fees and a login that
 *  cannot see them: what it is, and why it does not open. */
function FeesHidden() {
  return <span className="not-set">Shows fees</span>;
}

function FileRows({
  doc,
  expanded,
  versions,
  onToggle,
  onDownload,
  mayOpen,
  canWrite,
  onShare,
  onWithdraw,
}: {
  doc: SubjectFile;
  expanded: boolean;
  versions: readonly StoredDocumentVersion[] | undefined;
  onToggle: () => void;
  onDownload: (versionId: string | undefined, filename: string) => void;
  /** False for a document that shows fees, to a login that cannot see them. */
  mayOpen: boolean;
  canWrite: boolean;
  onShare: (visible: boolean) => void;
  /** Take this file off the page it is on. `party:write`, like attaching. */
  onWithdraw: () => void;
}) {
  const v = doc.latestVersion;
  /* THE ONE TRUE DISCLOSURE IN THIS APP. Everywhere else a form REPLACES the
     button that opened it, so the button is gone and there is no state left to
     announce. Here the button stays and a row appears under it, which is
     precisely what `aria-expanded` is for — and without it a reader was told
     "3 versions, button" and then, after pressing it, "Hide, button", with
     nothing saying a row had opened or where it was. */
  const versionsId = `doc-${doc.id}-versions`;
  const made = madeAs(doc);
  return (
    <>
      <tr>
        {/* Size, day and who filed it ride under the title (W4D): as four
            columns of their own they pushed the Download button out of sight on
            the proposal page, 149px hidden at 1440. */}
        <Td>
          <span className="block max-w-64 whitespace-normal">
            {doc.title}
            <Sub>
              {v.filename} · <span className="num">{formatBytes(v.byteSize)}</span> ·{" "}
              <span className="num">{when(v.createdAt)}</span> · {uploader(doc)}
            </Sub>
          </span>
        </Td>
        <Td>
          <span className="cluster tight">
            <Pill>{DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind}</Pill>
            {/* A generated document could be produced again; an uploaded one is
                the only copy that exists. Worth saying on a row somebody might
                be deciding whether to chase a client for. */}
            {made !== null && <Pill tone="quiet">{made}</Pill>}
          </span>
        </Td>
        {/* ── WHO OUTSIDE THE FIRM CAN READ THIS (T6.7) ───────────────────

            `is_client_visible` (migration 0066) decides whether this file is in
            the client's own portal library, and it is enforced by a POLICY in
            the database — this switch is the only thing that can move it.

            T6.5 named this exact failure on `delivery.work_item`'s copy of the
            same flag: a flag the portal enforces and no screen can change is a
            wall built against a value nobody can move. So the switch ships in
            the same task as the policy, not after it.

            A document with no client is the FIRM's own and has nobody to share
            it with — the API answers 404 there — so the cell says so instead of
            offering a control that would fail. */}
        <Td>
          {doc.partyId === null ? (
            <span>The firm&rsquo;s own</span>
          ) : doc.role === "draft_copy" && !doc.isClientVisible ? (
            /* B10 (audit 2026-10-03): a draft copy is the firm's own and is
               never shared, so no switch is offered. The API refuses it too
               (DRAFT_NOT_SHAREABLE), and still lets one that was shared come
               off, which is why the switch stays while it is on. */
            <span className="text-muted">Not for the client: a draft</span>
          ) : canWrite ? (
            <Switch
              checked={doc.isClientVisible}
              onChange={(e) => {
                onShare(e.target.checked);
              }}
              label={doc.isClientVisible ? "Shared" : "Not shared"}
            />
          ) : (
            <Pill tone={doc.isClientVisible ? "ok" : "quiet"}>
              {doc.isClientVisible ? "Shared" : "Not shared"}
            </Pill>
          )}
        </Td>
        <Td align="right" className="nowrap">
          <span className="cluster tight end">
            {/* More than one version is a fact worth surfacing on the row
                rather than hiding behind the toggle: "which version did they
                sign" is the question this table exists to answer. */}
            {doc.versionCount > 1 && (
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={expanded}
                aria-controls={expanded ? versionsId : undefined}
                onClick={onToggle}
              >
                {expanded ? "Hide" : `${String(doc.versionCount)} versions`}
              </Button>
            )}
            {mayOpen ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="download" size={15} />}
                onClick={() => {
                  onDownload(undefined, v.filename);
                }}
              >
                Download
              </Button>
            ) : (
              <FeesHidden />
            )}
            {/* Attached in error: take it off THIS page. The file and its
                other attachments stay; the link is kept as history. Named by
                the document, because a table draws one of these per row. An
                issued copy is never taken off: it is what the client holds. */}
            {canWrite && doc.role !== "copy_of_record" && (
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Take “${doc.title}” off this page`}
                onClick={onWithdraw}
              >
                Take off
              </Button>
            )}
          </span>
        </Td>
      </tr>
      {expanded && (
        <tr id={versionsId}>
          <Td colSpan={4} style={{ paddingTop: 0 }}>
            <Table>
              <tbody>
                {versions === undefined ? (
                  <tr>
                    <Td>
                      <span className="empty">Loading versions…</span>
                    </Td>
                  </tr>
                ) : (
                  versions.map((ver) => (
                    <tr key={ver.id}>
                      <Td>
                        <span className="num">v{String(ver.versionNo)}</span>
                      </Td>
                      <Td>{ver.filename}</Td>
                      <Td>
                        <span className="num">{formatBytes(ver.byteSize)}</span>
                      </Td>
                      <Td>
                        <span className="num">{when(ver.createdAt)}</span>
                      </Td>
                      {/* The hash is what proves the file a client holds is the
                          one the firm issued. Truncated because 64 characters
                          is unreadable, and the tooltip carries the whole thing
                          for anybody who needs to compare one. */}
                      <Td>
                        <Tooltip text={ver.contentHash}>
                          <span className="mono muted">{ver.contentHash.slice(0, 12)}…</span>
                        </Tooltip>
                      </Td>
                      <Td align="right">
                        {mayOpen ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Icon name="download" size={15} />}
                            onClick={() => {
                              onDownload(ver.id, ver.filename);
                            }}
                          >
                            Download
                          </Button>
                        ) : (
                          <FeesHidden />
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Td>
        </tr>
      )}
    </>
  );
}
