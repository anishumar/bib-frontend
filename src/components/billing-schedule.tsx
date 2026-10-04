"use client";

import { useEffect, useId, useState } from "react";
import { api, apiError, BILLING_FREQUENCY_LABELS } from "@/lib/api/client";
import type { BillingSchedule } from "@/lib/api/client";
import { Button, Dialog, ErrorNotice, Field, FieldRow, FieldStack, Input } from "@/components/ui";
import { longDay } from "@/lib/day";

/**
 * SET BILLING: the two dates that make an engagement billed on its own
 * (auto-invoice, 0318). Used by Invoices' "Billing not set up" tab and by the
 * client's Engagements panel, so the two say the same thing.
 *
 * WHY TWO DATES AND NOT ONE. One date cannot say whether an invoice on 1 Nov
 * bills October or November, nor that an audit billed in October 2026 is for
 * FY 2025-26. So the firm says which period is billed first ("Bill from", the
 * API snaps it to that period's first day) and the date that period's invoice
 * falls due ("First invoice on"); each later period follows one span after.
 * Nothing before "Bill from" is ever billed, which is how a client already
 * billed by hand goes live without a second bill for old months.
 *
 * The boxes are prefilled with the API's suggestion (the current period, billed
 * the day after it ends: Ashish, arrears), never computed here, because a
 * quarter or a year is cut by the firm's financial year and that rule lives in
 * the API. A schedule already set is prefilled with itself.
 */
export interface ScheduleSubject {
  readonly engagementId: string;
  readonly serviceName: string;
  readonly clientName: string;
  readonly billingFrequency: string | null;
  /** A fee group is billed once: setting one engagement sets the group. */
  readonly feeGroupTitle: string | null;
  readonly billingFrom: string | null;
  readonly firstInvoiceOn: string | null;
  /** The day the work started (the engagement's effective date): a period is
   *  billed only for the days the work ran, so nothing before it is billed
   *  however early "Bill from" is set (CA#35). Said, not hidden. */
  readonly workStartedOn?: string | null | undefined;
}

export interface ScheduleSuggestion {
  readonly billingFrom: string;
  readonly firstInvoiceOn: string;
  readonly periodLabel: string;
}

const SPAN_WORDS: Readonly<Record<string, string>> = {
  monthly: "Then one every month.",
  quarterly: "Then one every quarter.",
  annually: "Then one every year.",
};

/** "Monthly", from the API's code. */
export function frequencyWord(code: string | null): string {
  if (code === null) return "Not set";
  return Object.entries(BILLING_FREQUENCY_LABELS).find(([key]) => key === code)?.[1] ?? code;
}

export function BillingScheduleDialog({
  subject,
  suggestion,
  onClose,
  onSaved,
}: {
  /** The engagement being set; null keeps the dialog closed. */
  subject: ScheduleSubject | null;
  /**
   * The default to offer when nothing is set. `undefined` asks the API for it
   * (the client page has no suggestion of its own); `null` means the API has
   * none (a quarter or a year with no financial year set).
   */
  suggestion: ScheduleSuggestion | null | undefined;
  onClose: () => void;
  onSaved: (set: BillingSchedule) => void;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [fetched, setFetched] = useState<{ id: string; value: ScheduleSuggestion | null } | null>(null);
  /** What "Bill from" holds as it is typed, for the warning under it. */
  const [typedFrom, setTypedFrom] = useState<string | null>(null);

  const engagementId = subject?.engagementId ?? null;
  const isSet = subject !== null && subject.billingFrom !== null && subject.firstInvoiceOn !== null;

  // The client page has no suggestion of its own: read the firm's list of
  // engagements without a schedule and take this one's. One call, when opened.
  useEffect(() => {
    if (engagementId === null || suggestion !== undefined || isSet) return;
    let live = true;
    void (async () => {
      const list = await api.GET("/api/v1/billing/unscheduled", {});
      if (!live) return;
      const row = list.data?.engagements.find((e) => e.engagementId === engagementId);
      setFetched({ id: engagementId, value: row?.suggestion ?? null });
    })();
    return () => {
      live = false;
    };
  }, [engagementId, suggestion, isSet]);

  if (subject === null) return null;

  const offered =
    suggestion !== undefined ? suggestion : fetched?.id === subject.engagementId ? fetched.value : null;
  const waiting = !isSet && suggestion === undefined && fetched?.id !== subject.engagementId;
  const from = isSet ? subject.billingFrom : (offered?.billingFrom ?? "");
  const first = isSet ? subject.firstInvoiceOn : (offered?.firstInvoiceOn ?? "");

  async function save(billingFrom: string | null, firstInvoiceOn: string | null): Promise<void> {
    if (subject === null) return;
    setBusy(billingFrom === null ? "clear" : "save");
    setError(null);
    const result = await api.PUT("/api/v1/engagements/{engagementId}/billing", {
      params: { path: { engagementId: subject.engagementId } },
      body: { billingFrom, firstInvoiceOn },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    onSaved(result.data);
  }

  function close(): void {
    setError(null);
    setTypedFrom(null);
    onClose();
  }

  // BILL FROM BEFORE THE WORK STARTED (CA#35): saved as asked, and the months
  // before the start still get no bill, because a period is billed only for
  // the days the work ran. It was silent; now it is said while it is typed.
  const fromNow = typedFrom ?? from ?? "";
  const started = subject.workStartedOn ?? null;
  const before = started !== null && fromNow !== "" && fromNow < started;

  return (
    <Dialog
      open
      onClose={close}
      title={`Set billing for ${subject.serviceName}`}
      footer={
        <>
          {isSet && (
            <Button
              variant="destructive-quiet"
              className="mr-auto"
              loading={busy === "clear"}
              disabled={busy !== null}
              onClick={() => {
                void save(null, null);
              }}
            >
              Stop billing
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy === "save"} disabled={busy !== null || waiting}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void save(String(form.get("billingFrom") ?? ""), String(form.get("firstInvoiceOn") ?? ""));
        }}
      >
        <FieldStack>
          <ErrorNotice error={error} />
          <p className="text-ink-2">
            {subject.clientName}
            {subject.feeGroupTitle !== null && `. Billed with the rest of ${subject.feeGroupTitle}.`}
          </p>
          {/* Keyed on what fills them, so the boxes take the suggestion when it
              arrives rather than keeping the empty first render. */}
          <FieldRow key={`${from ?? ""}|${first ?? ""}`}>
            <Field
              label="Bill from"
              hint={
                before ? (
                  <strong role="status" className="font-semibold text-danger">
                    This work started on {longDay(started ?? "")}. A period is billed only for the days the work
                    ran, so nothing before {longDay(started ?? "")} will be billed.
                  </strong>
                ) : offered !== null && !isSet ? (
                  `${offered.periodLabel} is the first period suggested. Nothing before it is billed.`
                ) : (
                  "Nothing before this period is billed."
                )
              }
            >
              <Input
                name="billingFrom"
                type="date"
                required
                defaultValue={from ?? ""}
                onChange={(e) => {
                  setTypedFrom(e.target.value);
                }}
              />
            </Field>
            <Field
              label="First invoice on"
              hint={SPAN_WORDS[subject.billingFrequency ?? ""] ?? "The date that period's invoice is due."}
            >
              <Input name="firstInvoiceOn" type="date" required defaultValue={first ?? ""} />
            </Field>
          </FieldRow>
        </FieldStack>
      </form>
    </Dialog>
  );
}
