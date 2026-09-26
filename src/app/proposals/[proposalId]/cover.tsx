"use client";

import { useState } from "react";
import type { ProposalRecord } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Meta,
  MetaItem,
  Select,
  Textarea,
  useSwapFocus,
} from "@/components/ui";
import { longDay } from "@/lib/day";

/** A person the proposal may be prepared for — someone the client's own page
 *  records at it (F-10-1), the same list the API checks. */
export interface Contact {
  readonly id: string;
  readonly name: string;
}

/** A colleague who may be named as having prepared it. */
export interface Preparer {
  readonly userId: string;
  readonly name: string;
}

/** What a save sends. Every field, every time: absent would mean "leave it",
 *  and this form shows all five, so each one it sends is what the person saw. */
export interface CoverEdit {
  title: string;
  validUntil: string | null;
  background: string | null;
  addressedToPartyId: string | null;
  preparedByUserId: string | null;
}

/**
 * The proposal's COVER and its Background (0084) — what the PDF's first page
 * and first paragraph say.
 *
 * The cover prints two names over the firm's artwork: who the proposal is
 * PREPARED FOR (a person at the client, then the client) and who PREPARED IT
 * (a colleague, the firm's company that is offering, their address). Both are
 * this card's to set, on a draft; after sending they are the record of what
 * the client was shown, and the card only reads.
 */
export function ProposalCover({
  record,
  contacts,
  preparers,
  editable,
  busy,
  onSave,
}: {
  record: ProposalRecord;
  contacts: readonly Contact[];
  preparers: readonly Preparer[];
  editable: boolean;
  busy: boolean;
  /** Resolves true when the API took it — the form closes only then, so a
   *  refusal leaves what was typed where the person can fix it. */
  onSave: (edit: CoverEdit) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  // "Edit" replaces itself with the form, so focus is handed over and back.
  const { panel, trigger } = useSwapFocus(editing);
  const { proposal } = record;

  // The current preparer may have left the roster; the choice still has to be
  // able to show them rather than silently switching to somebody else.
  const preparerChoices: readonly Preparer[] =
    record.preparedBy !== null && !preparers.some((p) => p.userId === record.preparedBy?.userId)
      ? [
          ...preparers,
          {
            userId: record.preparedBy.userId,
            name: `${record.preparedBy.displayName ?? record.preparedBy.email} (no longer on the roster)`,
          },
        ]
      : preparers;

  return (
    <Card>
      <CardTitle level={2}>Cover and Background</CardTitle>
      <p className="muted text-md">
        The first page of the proposal PDF is your company&apos;s cover artwork, with these two
        names printed on it. The Background is the first paragraph after it.
      </p>

      <div className="mb-6">
        <Meta>
          <MetaItem label="Prepared for">
            {record.addressee === null ? (
              <>
                {record.party.displayName}
                <span className="mt-0.5 block text-md text-muted">no individual named</span>
              </>
            ) : (
              <>
                {record.addressee.displayName}
                <span className="mt-0.5 block text-md text-muted">{record.party.displayName}</span>
              </>
            )}
          </MetaItem>
          <MetaItem label="Prepared by">
            {record.preparedBy === null ? (
              <span className="text-sm text-muted">nobody named</span>
            ) : (
              <>
                {record.preparedBy.displayName ?? record.preparedBy.email}
                <span className="mt-0.5 block text-md text-muted">
                  {record.issuingEntity.displayName} · {record.preparedBy.email}
                </span>
              </>
            )}
          </MetaItem>
          <MetaItem label="Valid until">
            {proposal.validUntil === null ? (
              <span className="text-sm text-muted">no date given</span>
            ) : (
              longDay(proposal.validUntil)
            )}
          </MetaItem>
        </Meta>
      </div>
      <h3 className="eyebrow">Background</h3>
      {proposal.background === null ? (
        <p className="text-md text-muted">
          None written. The proposal opens straight with the services it covers.
        </p>
      ) : (
        <p className="whitespace-pre-wrap">{proposal.background}</p>
      )}

      {editable && !editing && (
        <div className="cluster">
          <Button
            ref={trigger}
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit the cover and Background
          </Button>
        </div>
      )}

      {editable && editing && (
        <div ref={panel} tabIndex={-1}>
          <form
            action={(form) => {
              const text = (name: string): string => String(form.get(name) ?? "").trim();
              const orNull = (value: string): string | null => (value === "" ? null : value);
              void onSave({
                title: text("title"),
                validUntil: orNull(text("validUntil")),
                background: orNull(text("background")),
                addressedToPartyId: orNull(text("addressedToPartyId")),
                preparedByUserId: orNull(text("preparedByUserId")),
              }).then((saved) => {
                if (saved) setEditing(false);
              });
            }}
          >
            <FieldStack>
              <FieldRow>
                <Field label="Title" hint="How the firm names this proposal. The cover artwork carries its own heading, so this prints only on a plain cover.">
                  <Input name="title" defaultValue={proposal.title} required maxLength={300} />
                </Field>
                <Field label="Valid until" optional>
                  <Input name="validUntil" type="date" defaultValue={proposal.validUntil ?? ""} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field
                  label="Prepared for"
                  hint={
                    contacts.length === 0
                      ? `Nobody is recorded at ${record.party.displayName} yet. Add a director, signatory or employee on the client's page to name them here.`
                      : `A person recorded at ${record.party.displayName} or one of its companies. The client's name always prints under theirs.`
                  }
                >
                  <Select name="addressedToPartyId" defaultValue={record.addressee?.id ?? ""}>
                    <option value="">{record.party.displayName} (no individual)</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Prepared by"
                  hint={`Printed with ${record.issuingEntity.displayName} and their email address.`}
                >
                  <Select name="preparedByUserId" defaultValue={record.preparedBy?.userId ?? ""}>
                    <option value="">Nobody named</option>
                    {preparerChoices.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FieldRow>
              <Field
                label="Background"
                optional
                hint="A paragraph about the client's business. Leave it empty and the proposal starts with the services."
              >
                <Textarea name="background" rows={4} defaultValue={proposal.background ?? ""} maxLength={4000} />
              </Field>
              <div className="cluster">
                <Button type="submit" loading={busy} disabled={busy}>
                  Save
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </FieldStack>
          </form>
        </div>
      )}
    </Card>
  );
}
