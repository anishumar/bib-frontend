"use client";

/**
 * THE CLIENT SAID YES OUTSIDE BIB (0317) — a partner records it.
 *
 * The client accepted by email, on a call or in a meeting, and never pressed
 * Accept on the link or signed in DocuSign. `acceptance:record` (a partner, by
 * default) records how, when, who and a note. On a LETTER the client's own
 * email must be attached: it is the contract, and it signs the letter and
 * starts the work. On a proposal the file is optional.
 *
 * The file goes up first, through the ordinary upload, attached to the same
 * proposal or letter (`kind: correspondence`), because the API checks the
 * evidence is filed there. An upload that worked is kept for a retry, so a
 * refusal of the acceptance itself never files the email twice.
 *
 * `RecordedAcceptanceCard` shows one afterwards: who recorded it, how and when
 * the client said yes, the note and the file.
 */

import { useState } from "react";
import { api, apiError, downloadDocument } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Button, ErrorNotice, Field, FieldRow, FieldStack, Input, Select, Textarea } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { browserDay, longDay, longInstant } from "@/lib/day";

type RecordedAcceptance = NonNullable<components["schemas"]["RecordedAcceptance"]>;
type Channel = RecordedAcceptance["channel"];

const CHANNELS: readonly { value: Channel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Phone call" },
  { value: "meeting", label: "Meeting" },
  { value: "letter", label: "Letter" },
  { value: "other", label: "Other" },
];

export function channelLabel(c: Channel): string {
  return CHANNELS.find((x) => x.value === c)?.label ?? c;
}

export function RecordAcceptance({
  subject,
  documentRef,
  partyId,
  sentOn,
  onRecorded,
}: {
  subject: { kind: "proposal" | "engagement_letter"; id: string };
  /** PR-2026-0007 / EL-2026-0003, for the confirmation. */
  documentRef: string;
  /** The client, so the filed email lands in their file. */
  partyId: string;
  /** The day it went out: the earliest day the client can have said yes. */
  sentOn: string | null;
  onRecorded: () => void | Promise<void>;
}) {
  const isLetter = subject.kind === "engagement_letter";
  const today = browserDay();
  const [open, setOpen] = useState(false);
  // Nothing preselected (F13): the record is evidence, and "Email" was what
  // an untouched form said whether or not the yes came by email.
  const [channel, setChannel] = useState<Channel | "">("");
  const [acceptedOn, setAcceptedOn] = useState(today);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // An email already filed by an earlier try, kept so a retry does not file it twice.
  const [filed, setFiled] = useState<{ file: File; documentId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="stack tight">
        <p className="muted text-sm">
          {isLetter ? "Client agreed by email or on a call, but never signed?" : "Client said yes by email or on a call?"}
        </p>
        <div className="cluster">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(true);
            }}
          >
            Record client&apos;s acceptance
          </Button>
        </div>
      </div>
    );
  }

  /** What is missing, said before the confirmation opens. */
  function problem(): string | null {
    if (channel === "") return "Choose how the client said yes.";
    if (name.trim() === "") return "Say who at the client accepted it.";
    if (note.trim() === "") return "Add a note: what the client said and where.";
    if (acceptedOn === "") return "Choose the day the client said yes.";
    if (isLetter && file === null) return "Attach the client's email or letter.";
    return null;
  }

  async function evidenceId(): Promise<string | null> {
    if (file === null) return null;
    if (filed !== null && filed.file === file) return filed.documentId;
    const payload = new FormData();
    payload.set("file", file);
    payload.set("title", `Acceptance from ${name.trim()}, ${longDay(acceptedOn)}`);
    payload.set("kind", "correspondence");
    payload.set("subjectKind", subject.kind);
    payload.set("subjectRef", subject.id);
    payload.set("role", "acceptance_evidence");
    payload.set("partyId", partyId);
    const uploaded = await api.POST("/api/v1/documents", {
      body: payload as unknown as never,
      bodySerializer: (b: unknown) => b as FormData,
    });
    if (uploaded.error) throw new Error(apiError(uploaded.error).message);
    setFiled({ file, documentId: uploaded.data.id });
    return uploaded.data.id;
  }

  async function record(): Promise<void> {
    if (channel === "") {
      setError("Choose how the client said yes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const documentId = await evidenceId();
      const body = {
        channel,
        acceptedOn,
        acceptedByName: name.trim(),
        ...(title.trim() === "" ? {} : { acceptedByTitle: title.trim() }),
        note: note.trim(),
        ...(documentId === null ? {} : { evidenceDocumentId: documentId }),
      };
      const result = isLetter
        ? await api.POST("/api/v1/engagement-letters/{letterId}/acceptance", {
            params: { path: { letterId: subject.id }, query: { asOf: today } },
            body,
          })
        : await api.POST("/api/v1/proposals/{proposalId}/acceptance", {
            params: { path: { proposalId: subject.id } },
            body,
          });
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setOpen(false);
      await onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack tight">
      <h3 className="eyebrow">Record client&apos;s acceptance</h3>
      <ErrorNotice error={error} />
      <FieldStack>
        <FieldRow>
          <Field label="How they said yes">
            <Select
              value={channel}
              required
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
              min={sentOn ?? undefined}
              max={today}
              onChange={(e) => {
                setAcceptedOn(e.target.value);
              }}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Who at the client">
            <Input
              value={name}
              maxLength={200}
              placeholder="e.g. Priya Menon"
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </Field>
          <Field label="Their role" optional>
            <Input
              value={title}
              maxLength={200}
              placeholder="e.g. Director"
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </Field>
        </FieldRow>
        <Field label="Note" hint="What they said, and where it can be found.">
          <Textarea
            rows={2}
            value={note}
            maxLength={2000}
            placeholder="e.g. Replied 'go ahead' to our email on 30 Sep."
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        </Field>
        <Field
          label={isLetter ? "Client's email or letter" : "Client's email or letter"}
          optional={!isLetter}
          hint={isLetter ? "Required. Save the email as PDF and attach it." : "Save the email as PDF and attach it."}
        >
          <Input
            type="file"
            accept=".pdf,.eml,.msg,.png,.jpg,.jpeg"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </Field>
        <div className="cluster">
          <ConfirmAction
            variant="primary"
            size="sm"
            loading={busy}
            disabled={busy}
            beforeOpen={() => {
              const p = problem();
              setError(p);
              return p === null;
            }}
            title={`Record that the client accepted ${documentRef}?`}
            confirmLabel="Record acceptance"
            consequence={
              isLetter ? (
                <p>
                  {documentRef} is marked signed and its work starts. The client can no longer sign
                  it in DocuSign. This cannot be undone.
                </p>
              ) : (
                <p>
                  {documentRef} is marked accepted and cannot be changed. You can then draft the
                  engagement letter from it.
                </p>
              )
            }
            onConfirm={() => {
              void record();
            }}
          >
            Record acceptance
          </ConfirmAction>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </FieldStack>
    </div>
  );
}

/** A recorded acceptance: how and when the client said yes, who recorded it. */
export function RecordedAcceptanceCard({ acceptance }: { acceptance: RecordedAcceptance }) {
  const recorder = acceptance.recordedBy?.displayName ?? acceptance.recordedBy?.email ?? null;
  return (
    <div className="stack tight">
      <h3 className="eyebrow">Accepted outside bib</h3>
      <p className="text-md">
        {acceptance.acceptedByName}
        {acceptance.acceptedByTitle === null ? "" : `, ${acceptance.acceptedByTitle}`} said yes by{" "}
        {channelLabel(acceptance.channel).toLowerCase()} on {longDay(acceptance.acceptedOn)}.
      </p>
      <p className="muted text-sm">{acceptance.note}</p>
      {acceptance.evidence !== null && (
        <div className="cluster">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const evidence = acceptance.evidence;
              if (evidence === null) return;
              void downloadDocument(evidence.documentId, evidence.title ?? "acceptance");
            }}
          >
            {acceptance.evidence.title ?? "The client's email"}
          </Button>
        </div>
      )}
      <p className="muted text-sm">
        Recorded{recorder === null ? "" : ` by ${recorder}`}, {longInstant(acceptance.recordedAt)}.
      </p>
    </div>
  );
}
