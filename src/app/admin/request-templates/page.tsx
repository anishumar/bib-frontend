"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, DOCUMENT_KIND_LABELS } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import { Button } from "@/components/ui";
import {
  Card,
  CardTitle,
  Empty,
  ErrorNotice,
  Page,
  PageHeader,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { ConfigHistory } from "@/lib/ui/config-history";
import {
  ASK_KINDS,
  MONTHLY_CLOSE,
  dueWords,
  readRequestTemplate,
  sendWords,
} from "@/lib/request-template";
import type { RequestTemplateBody, RequestTemplateItem } from "@/lib/request-template";
import { TemplateEditor } from "./template-editor";

/**
 * What a firm asks its clients for, every period, and by when (F1.7).
 *
 * A firm asks for the month's papers by email at the start of every month, from
 * a partner's memory. A request template is that list written down once: each
 * item is what the client reads, what kind of answer it wants, what a file is
 * filed as, and two days counted from the period's LAST day (asked, due). A
 * process step names a template (Processes, "Ask the client for"), and the
 * requests sweep (F1.4) raises one ask per item per period on its send day.
 *
 * ── DRAFT AND PUBLISH, LIKE PROCESSES ───────────────────────────────────────
 *
 * The same two steps `/admin/workflows`, `/admin/client-reminders` and
 * `/catalogue` take, and for the client-reminders reason: a half-written list
 * that started asking would ask somebody OUTSIDE the firm. A step may only name
 * a PUBLISHED template, and each ask pins the version it was raised from, so
 * publishing a new list in November never rewrites what October asked.
 *
 * ── NOTHING IS SEEDED ───────────────────────────────────────────────────────
 *
 * "Start from an example: Monthly close" fills the form; the firm saves and
 * publishes it. A list this product published on a firm's behalf would be one
 * nobody there agreed to send to their clients (10x has yet to confirm its own
 * monthly list, FIN_BUILD_PLAN's open decisions).
 */
export default function RequestTemplatesPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** What a new template starts from, or null when none is being written. A
   *  counter beside it remounts the editor when the starting point changes. */
  const [writing, setWriting] = useState<{ start: RequestTemplateBody | null; n: number } | null>(
    null,
  );

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/config/{kind}", {
      params: { path: { kind: "request_template" } },
    });
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setEntries(result.data.entries);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function publish(key: string, version: number): Promise<void> {
    setBusy(`publish:${key}`);
    setError(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "request_template", key, version } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  function startFrom(start: RequestTemplateBody | null): void {
    setWriting((w) => ({ start, n: (w?.n ?? 0) + 1 }));
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <Page>
      <PageHeader
        title="Request templates"
        lede="What your clients are asked for each period, and by when."
        actions={
          <Button
            variant={writing !== null ? "secondary" : "primary"}
            aria-expanded={writing !== null}
            {...(writing !== null ? { "aria-label": "Cancel the new template" } : {})}
            onClick={() => {
              if (writing !== null) setWriting(null);
              else startFrom(null);
            }}
          >
            {writing !== null ? "Cancel" : "New template"}
          </Button>
        }
      />
      <ErrorNotice error={error} />

      {writing !== null && (
        <Card>
          <CardTitle level={2}>A new template</CardTitle>
          <TemplateEditor
            key={writing.n}
            templateKey={null}
            initial={writing.start}
            takenKeys={entries.map((e) => e.entry.key)}
            onStartFrom={startFrom}
            note="Saved as a draft. No client is asked from it until you publish it."
            onDone={() => {
              setWriting(null);
              void load();
            }}
            onCancel={() => {
              setWriting(null);
            }}
            onError={setError}
          />
        </Card>
      )}

      {entries.length === 0 && writing === null && (
        <Card>
          <Empty title="No request template yet" icon="files">
            <p>Clients are asked for nothing each period until a process step names one.</p>
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  startFrom(MONTHLY_CLOSE);
                }}
              >
                Start from an example: Monthly close
              </Button>
            </div>
          </Empty>
        </Card>
      )}

      {entries.map((e) => (
        <TemplateCard
          key={e.entry.key}
          entry={e}
          busy={busy}
          onPublish={(key, version) => void publish(key, version)}
          onSaved={() => void load()}
          onError={setError}
        />
      ))}
    </Page>
  );
}

// ── One template ─────────────────────────────────────────────────────────────

function TemplateCard({
  entry,
  busy,
  onPublish,
  onSaved,
  onError,
}: {
  entry: ConfigEntry;
  busy: string | null;
  onPublish: (key: string, version: number) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inForce = entry.published;
  const draft = entry.pendingDraft;
  const shown = readRequestTemplate((draft ?? inForce)?.body);
  const name = shown?.label || entry.entry.key;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-4">
        <CardTitle level={2}>{name}</CardTitle>
        <span className="flex items-center gap-2">
          {draft !== null && inForce !== null && <Pill tone="warn">Unpublished changes</Pill>}
          {inForce === null ? (
            <Pill tone="neutral">Draft</Pill>
          ) : (
            <Pill tone="ok">In force, v{String(inForce.version)}</Pill>
          )}
        </span>
      </div>

      {draft !== null && (
        <p className="mt-1 text-sm text-ink-2">
          Draft v{draft.version} is saved. No client is asked from it until you publish it.
        </p>
      )}

      {shown === null ? (
        // A body this screen cannot read is said, not drawn as an empty list.
        <p className="mt-2 text-sm text-ink-2">This version cannot be shown here.</p>
      ) : (
        <div className="mt-3">
          <ItemTable items={shown.items} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {draft !== null && (
          <Button
            disabled={busy === `publish:${entry.entry.key}`}
            aria-label={`Publish v${String(draft.version)} of ${name}`}
            onClick={() => {
              onPublish(entry.entry.key, draft.version);
            }}
          >
            Publish v{draft.version}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-label={`${editing ? "Stop editing" : draft === null ? "Change" : "Edit the draft of"} ${name}`}
          aria-expanded={editing}
          onClick={() => {
            setEditing((e) => !e);
          }}
        >
          {editing ? "Cancel" : draft === null ? "Change it" : "Edit the draft"}
        </Button>
      </div>
      {inForce !== null && (
        <p className="field-hint">
          A <Link href="/admin/workflows">process</Link> step asks for it under &ldquo;Ask the
          client for&rdquo;.
        </p>
      )}

      {editing && shown !== null && (
        <TemplateEditor
          templateKey={entry.entry.key}
          initial={shown}
          takenKeys={[]}
          note="Saved as a new version. Asks already raised keep the version they came from."
          onDone={() => {
            setEditing(false);
            onSaved();
          }}
          onCancel={() => {
            setEditing(false);
          }}
          onError={onError}
        />
      )}

      <div className="mt-2">
        <ConfigHistory kind="request_template" entryKey={entry.entry.key} name={name} />
      </div>
    </Card>
  );
}

/** The list as a partner reads it: what is asked, how, and when. */
function ItemTable({ items }: { items: readonly RequestTemplateItem[] }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>What the client is asked for</Th>
            <Th>As</Th>
            <Th>Asked</Th>
            <Th>Due</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key}>
              <Td>
                <span className="block max-w-[24rem] whitespace-normal">{i.label}</span>
              </Td>
              <Td>
                {ASK_KINDS.find((k) => k.value === i.askKind)?.short ?? i.askKind}
                {i.documentKind !== null && (
                  <span className="mt-0.5 block text-sm text-ink-2">
                    Filed as {DOCUMENT_KIND_LABELS[i.documentKind] ?? i.documentKind}
                  </span>
                )}
              </Td>
              <Td>{sendWords(i.sendOffsetDays)}</Td>
              <Td>{dueWords(i.dueOffsetDays)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
