"use client";

/**
 * SENDING AN ISSUED INVOICE (0395): by email, as a PDF, and, later, on WhatsApp.
 *
 * - **Email** opens the Compose panel, Gmail's New Message, as a proposal's
 *   send does. To starts with the client's own email (else its first portal
 *   contact), and every box can be changed before Send: the user asked that
 *   the details be asked for first. The issued copy goes attached.
 * - **WhatsApp** is a button that says it is coming (10x, 2026-10-17).
 * - **Download** is the issued copy, the file the client is sent, never a
 *   fresh render.
 *
 * The PDF prints every figure, so all three need a login that sees fees; the
 * API refuses the rest.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError, downloadDocument } from "@/lib/api/client";
import type { InvoiceEmail, InvoiceEmailCompose } from "@/lib/api/client";
import { Button, Compose, Field, FieldStack, Icon, Input, Textarea } from "@/components/ui";
import { Card, CardTitle, ErrorNotice, Notice, Pill } from "@/components/tw";
import { longInstantTime } from "@/lib/day";

/** Addresses as typed: split on commas, semicolons and spaces. */
function addresses(typed: string): string[] {
  return typed
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter((a) => a !== "");
}

export function SendInvoice({
  invoiceId,
  number,
  status,
  seesFees,
  canSend,
  onChanged,
}: {
  invoiceId: string;
  number: string | null;
  status: "draft" | "issued" | "cancelled";
  seesFees: boolean | null;
  /** `party:write`: may email it. Downloading needs only the fee axis. */
  canSend: boolean;
  /** Told after a send or a first download files something. */
  onChanged: () => void;
}) {
  const [form, setForm] = useState<InvoiceEmailCompose | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvoiceEmail | null>(null);
  const issued = status === "issued";

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/invoices/{invoiceId}/email", { params: { path: { invoiceId } } });
    if (result.data) setForm(result.data);
  }, [invoiceId]);

  useEffect(() => {
    if (!issued || seesFees !== true) return;
    void (async () => {
      await load();
    })();
  }, [issued, seesFees, load]);

  if (status === "cancelled") return null;
  if (!issued) {
    return (
      <Card>
        <CardTitle level={2}>Send to the client</CardTitle>
        <p className="text-sm text-muted">Issue it first; then you can email it or download the PDF here.</p>
      </Card>
    );
  }
  if (seesFees !== true) {
    return (
      <Card>
        <CardTitle level={2}>Send to the client</CardTitle>
        <p className="text-sm text-muted">
          The invoice prints its fees, so emailing and downloading it are for a login that can see fees.
        </p>
      </Card>
    );
  }

  async function download(): Promise<void> {
    setBusy("pdf");
    setError(null);
    let failure: string | null;
    const filed = form?.attachment ?? null;
    if (filed !== null) {
      failure = await downloadDocument(filed.documentId, filed.filename, filed.versionId);
    } else {
      // No issued copy filed yet (Issue's filing failed, or it was issued
      // before copies were kept): make it, then download it.
      const made = await api.POST("/api/v1/documents/render", { body: { kind: "invoice", subjectRef: invoiceId } });
      failure = made.error
        ? apiError(made.error).message
        : await downloadDocument(made.data.id, made.data.latestVersion.filename, made.data.latestVersion.id);
      if (!made.error) {
        onChanged();
        await load();
      }
    }
    setBusy(null);
    if (failure !== null) setError(failure);
  }

  async function send(draft: { to: string[]; cc: string[]; subject: string; message: string }): Promise<void> {
    setBusy("email");
    setError(null);
    const result = await api.POST("/api/v1/invoices/{invoiceId}/email", {
      params: { path: { invoiceId } },
      body: draft,
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setSent(result.data);
    setOpen(false);
    onChanged();
    await load();
  }

  return (
    <Card>
      <CardTitle level={2}>Send to the client</CardTitle>
      <ErrorNotice error={open ? null : error} />
      {sent !== null && (
        <Notice tone="ok">
          Emailed to {[...sent.to, ...sent.cc].join(", ")} with the invoice attached.
        </Notice>
      )}
      <div className="cluster">
        {canSend && (
          <Button
            icon={<Icon name="letters" size={16} />}
            disabled={busy !== null || form === null || !form.sendable}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            Email
          </Button>
        )}
        <span className="flex items-center gap-2">
          <Button variant="secondary" icon={<Icon name="chat" size={16} />} disabled aria-describedby={`wa-${invoiceId}`}>
            WhatsApp
          </Button>
          <Pill tone="neutral">
            <span id={`wa-${invoiceId}`}>Coming soon</span>
          </Pill>
        </span>
        <Button
          variant="secondary"
          icon={<Icon name="download" size={16} />}
          loading={busy === "pdf"}
          disabled={busy !== null}
          onClick={() => void download()}
        >
          Download PDF
        </Button>
      </div>
      {form !== null && form.sent.length > 0 && <Sent emails={form.sent} />}

      {form !== null && (
        <Compose
          open={open}
          title={`Email ${number ?? "the invoice"}`}
          onClose={() => {
            setOpen(false);
          }}
        >
          <EmailInvoice form={form} busy={busy === "email"} error={error} onSend={(d) => void send(d)} />
        </Compose>
      )}
    </Card>
  );
}

/** The email as the person will send it: every box filled, every box theirs. */
function EmailInvoice({
  form,
  busy,
  error,
  onSend,
}: {
  form: InvoiceEmailCompose;
  busy: boolean;
  error: string | null;
  onSend: (draft: { to: string[]; cc: string[]; subject: string; message: string }) => void;
}) {
  const [to, setTo] = useState(form.to.join(", "));
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(form.subject);
  const [message, setMessage] = useState(form.message);
  // The client's other people, one click to add to To.
  const typed = addresses(to).map((a) => a.toLowerCase());
  const more = form.suggestions.filter((s) => !typed.includes(s.email));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend({ to: addresses(to), cc: addresses(cc), subject, message });
      }}
    >
      <FieldStack>
        <ErrorNotice error={error} />
        <p className="text-sm text-muted">
          From {form.from.name}
          {form.from.email !== null && <> &lt;{form.from.email}&gt;</>}
        </p>
        <Field label="To" hint="Separate several addresses with commas.">
          <Input name="to" value={to} required onChange={(e) => { setTo(e.target.value); }} />
        </Field>
        {more.length > 0 && (
          <div className="cluster" aria-label="Others at the client">
            {more.map((s) => (
              <Button
                key={s.email}
                type="button"
                size="sm"
                variant="secondary"
                icon={<Icon name="plus" size={14} />}
                onClick={() => {
                  setTo((now) => (now.trim() === "" ? s.email : `${now.replace(/[\s,;]+$/, "")}, ${s.email}`));
                }}
              >
                {s.name === null ? s.email : `${s.name} (${s.email})`}
              </Button>
            ))}
          </div>
        )}
        <Field label="Cc" optional>
          <Input name="cc" value={cc} onChange={(e) => { setCc(e.target.value); }} />
        </Field>
        <Field label="Subject">
          <Input name="subject" value={subject} required maxLength={200} onChange={(e) => { setSubject(e.target.value); }} />
        </Field>
        <Field label="Message">
          <Textarea name="message" rows={9} value={message} required maxLength={5000} onChange={(e) => { setMessage(e.target.value); }} />
        </Field>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="files" size={16} />
          {form.attachment?.filename ?? "The issued invoice, as a PDF"} is attached.
        </p>
        <div className="cluster">
          <Button type="submit" icon={<Icon name="letters" size={16} />} loading={busy} disabled={busy}>
            Send
          </Button>
        </div>
      </FieldStack>
    </form>
  );
}

/** Every email it went in, newest first. */
function Sent({ emails }: { emails: readonly InvoiceEmail[] }) {
  return (
    <div className="mt-4">
      <h3 className="eyebrow">Emailed</h3>
      <ul className="mt-1">
        {emails.map((e) => (
          <li key={e.id} className="text-md">
            To <strong>{e.to.join(", ")}</strong>
            {e.cc.length > 0 && <> · Cc {e.cc.join(", ")}</>} · {longInstantTime(e.sentAt)}
            {e.sentBy !== null && e.sentBy.displayName !== null && ` · by ${e.sentBy.displayName}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
