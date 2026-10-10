"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError, downloadDocument, formatBytes } from "@/lib/api/client";
import type { FinIntakeItem, FinIntakePage, FinReader, PartySummary } from "@/lib/api/client";
import { useSession } from "@/components/layout";
import {
  Card,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Pill,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { Button, Field, FieldRow, Icon, NotSet, Select, Spinner } from "@/components/ui";
import { Empty, ErrorState, Loading, NoResults } from "@/components/states";
import { longInstant, longMoment } from "@/lib/day";
import { cn } from "@/lib/cn";
import {
  FIN_READERS,
  basisWords,
  finCount,
  isFinReader,
  readerWords,
  useFinStatus,
} from "@/lib/fin";

/**
 * FILES RECEIVED (F0.8): every file a client sent for their books since
 * FinCompliance was switched on for the firm, and which reader it goes to.
 *
 * The API decides everything here (`GET /api/v1/fin/intake`): which files fin
 * took (uploads filed as "Client's books", nothing else), which reader each
 * goes to and why, and the counts. The counts are for the CLIENT filter and
 * never for the page or the reader filter, so the strip stays put while
 * somebody scrolls or picks a reader, and each count is a filter of its own.
 *
 * "Needs a person" is the one count anybody has to act on: a file no reader
 * takes (a `.json`, a format nothing reads yet) is never discarded, it waits
 * for somebody to open it. So it is the highlighted tile, and while it is not
 * zero a line above the table says how many and offers to show them.
 *
 * Nothing is read from inside the files yet. That is the next stage, and the
 * page says so in one quiet line, so nobody looks here for extracted figures.
 *
 * Filters live in the URL (`?client=&reader=`), written with
 * `history.replaceState` as `/work-items` writes its tab: a filtered view can
 * be reloaded and sent to a colleague, and Back still leaves the screen.
 * Pages are "Show more" on the API's cursor (`nextBefore`), never numbers:
 * newest first, and a file taken in while somebody reads moves nothing they
 * have already seen.
 */
export default function FilesReceivedPage() {
  // `useSearchParams` needs a Suspense boundary above it in a static build.
  return (
    <Suspense
      fallback={
        <Page>
          <Loading label="Loading files received" />
        </Page>
      }
    >
      <FilesReceived />
    </Suspense>
  );
}

/** How many a page asks for. The API's own default, said out loud. */
const PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Shown {
  readonly items: readonly FinIntakeItem[];
  readonly summary: FinIntakePage["summary"];
  readonly next: string | null;
}

function FilesReceived() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSession();
  const fin = useFinStatus(session);
  const mayListClients = session?.permissions.includes("party:read") ?? false;

  // The URL is where a filter is KEPT; this state is what the screen reads.
  // A client id that is not an id is dropped rather than sent to be refused.
  const [client, setClient] = useState(() => {
    const id = params.get("client");
    return id !== null && UUID.test(id) ? id : "";
  });
  const [reader, setReader] = useState<FinReader | "">(() => {
    const code = params.get("reader");
    return isFinReader(code) ? code : "";
  });

  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [parties, setParties] = useState<readonly PartySummary[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  /** The latest read, so a slow answer to an earlier filter cannot land last
   *  (and a "Show more" answer for a filter since changed is dropped). */
  const asked = useRef(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if ((q.get("client") ?? "") === client && (q.get("reader") ?? "") === reader) return;
    if (client === "") q.delete("client");
    else q.set("client", client);
    if (reader === "") q.delete("reader");
    else q.set("reader", reader);
    const rest = q.toString();
    window.history.replaceState(null, "", rest === "" ? pathname : `${pathname}?${rest}`);
  }, [client, reader, pathname]);

  useEffect(() => {
    const ask = ++asked.current;
    void (async () => {
      setBusy(true);
      setMoreError(null);
      const result = await api.GET("/api/v1/fin/intake", {
        params: {
          query: {
            limit: PAGE_SIZE,
            ...(client === "" ? {} : { clientPartyId: client }),
            ...(reader === "" ? {} : { route: reader }),
          },
        },
      });
      if (ask !== asked.current) return;
      if (result.response.status === 401) {
        router.push("/login");
        return;
      }
      setBusy(false);
      if (result.error) {
        setError(apiError(result.error).message);
        return;
      }
      setError(null);
      setShown({
        items: result.data.items,
        summary: result.data.summary,
        next: result.data.nextBefore,
      });
    })();
  }, [client, reader, attempt, router]);

  // The firm's clients, for the filter: the list `/invoices`' Work vs Billing
  // offers (the book less the firm's own companies). Only for a role that may
  // read the book; `books:read` is kept apart from it on purpose.
  useEffect(() => {
    if (!mayListClients) return;
    let live = true;
    void api.GET("/api/v1/parties", {}).then((r) => {
      if (live) setParties(r.data?.parties ?? []);
    });
    return () => {
      live = false;
    };
  }, [mayListClients]);

  async function showMore(before: string): Promise<void> {
    const ask = asked.current;
    setMore(true);
    setMoreError(null);
    const result = await api.GET("/api/v1/fin/intake", {
      params: {
        query: {
          limit: PAGE_SIZE,
          before,
          ...(client === "" ? {} : { clientPartyId: client }),
          ...(reader === "" ? {} : { route: reader }),
        },
      },
    });
    setMore(false);
    if (ask !== asked.current) return;
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setMoreError(apiError(result.error).message);
      return;
    }
    const data = result.data;
    setShown((was) => {
      if (was === null) return was;
      // A file already on screen is never drawn twice, whatever the cursor.
      const seen = new Set(was.items.map((i) => i.intakeItemId));
      return {
        items: [...was.items, ...data.items.filter((i) => !seen.has(i.intakeItemId))],
        summary: data.summary,
        next: data.nextBefore,
      };
    });
  }

  /** The file itself, the way the Files panel hands one over: fetched with
   *  the session and saved, never an `<a href>` (see `downloadDocument`). The
   *  version is the one fin took in, not whatever was filed after it. */
  async function open(item: FinIntakeItem): Promise<void> {
    setOpening(item.intakeItemId);
    setOpenError(null);
    const failure = await downloadDocument(item.documentId, item.filename, item.documentVersionId);
    setOpening(null);
    if (failure !== null) setOpenError(`${item.filename} could not be opened: ${failure}`);
  }

  const pickReader = (code: FinReader | ""): void => {
    setReader(code);
  };

  // The client picker: the book when this role may read it, else the clients
  // the rows themselves name. The one chosen is always offered, even when it
  // is archived or not in either list, so the select never shows a stranger.
  const fromRows = new Map<string, string>();
  for (const i of shown?.items ?? []) {
    if (i.clientPartyId !== null && i.clientName !== null) fromRows.set(i.clientPartyId, i.clientName);
  }
  const options: { id: string; name: string }[] =
    parties === null
      ? [...fromRows].map(([id, name]) => ({ id, name }))
      : parties.filter((p) => !p.isOwnCompany).map((p) => ({ id: p.id, name: p.displayName }));
  if (client !== "" && !options.some((o) => o.id === client)) {
    options.push({ id: client, name: fromRows.get(client) ?? "The client in the link" });
  }
  options.sort((a, b) => a.name.localeCompare(b.name));

  const summary = shown?.summary ?? null;
  const manual = summary?.byRoute.manual ?? 0;
  /** How many files the current filters hold, all pages together. */
  const inFilter = summary === null ? 0 : reader === "" ? summary.total : summary.byRoute[reader];
  const filtered = client !== "" || reader !== "";

  return (
    <Page>
      <PageHeader
        title="Files received"
        lede={
          fin.kind === "on"
            ? `Every file your clients sent for their books since ${longInstant(fin.enabledSince)}, and which reader it goes to.`
            : "Every file your clients sent for their books, and which reader it goes to."
        }
      />

      {shown === null && error === null && <Loading label="Loading files received" />}

      {shown === null && error !== null && (
        <ErrorState
          title="The files could not be listed"
          message={error}
          onRetry={
            <Button
              variant="secondary"
              onClick={() => {
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      )}

      {shown !== null && summary !== null && (
        <>
          <div className="flex flex-col gap-2">
            <ReaderCounts summary={summary} reader={reader} onPick={pickReader} />
            <p className="text-sm text-muted">Reading what is inside the files comes next.</p>
          </div>

          {manual > 0 && reader !== "manual" && (
            <Notice
              tone="warn"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    pickReader("manual");
                  }}
                >
                  {manual === 1 ? "Show it" : "Show them"}
                </Button>
              }
            >
              <p>
                {manual === 1
                  ? "1 file fits no reader yet. Somebody has to open it."
                  : `${finCount(manual)} files fit no reader yet. Somebody has to open them.`}
              </p>
            </Notice>
          )}

          <div className="max-w-[var(--measure)]">
            <FieldRow>
              <Field label="Client">
                <Select
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                  }}
                >
                  <option value="">All clients</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reader">
                <Select
                  value={reader}
                  onChange={(e) => {
                    const code = e.target.value;
                    pickReader(isFinReader(code) ? code : "");
                  }}
                >
                  <option value="">All readers</option>
                  {FIN_READERS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.many}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
          </div>

          <ErrorNotice error={error ?? openError} />

          {shown.items.length === 0 ? (
            <Card>
              {filtered ? (
                <NoResults
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setClient("");
                        setReader("");
                      }}
                    >
                      Clear the filters
                    </Button>
                  }
                >
                  No files match. Pick another client or reader, or clear the filters.
                </NoResults>
              ) : (
                <Empty icon="files" title="Nothing taken in yet.">
                  Files your clients send as &ldquo;Client&apos;s books&rdquo; appear here within
                  ten minutes.
                </Empty>
              )}
            </Card>
          ) : (
            <Card padded={false}>
              <div
                aria-busy={busy}
                className={cn("transition-opacity", busy && "opacity-60")}
              >
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>File</Th>
                        <Th>Client</Th>
                        <Th>Reader</Th>
                        <Th align="right">Size</Th>
                        <Th>Taken in</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.items.map((i) => (
                        <tr key={i.intakeItemId}>
                          <Td>
                            <button
                              type="button"
                              className="block max-w-[24rem] text-left font-semibold [overflow-wrap:anywhere] hover:text-ok-ink hover:underline hover:underline-offset-2"
                              aria-busy={opening === i.intakeItemId}
                              onClick={() => void open(i)}
                            >
                              <span className="sr-only">Download </span>
                              {i.title}
                              {opening === i.intakeItemId ? (
                                <span className="ml-1 inline-block align-middle">
                                  <Spinner />
                                </span>
                              ) : (
                                <Icon
                                  name="download"
                                  size={15}
                                  className="ml-1 inline-block align-middle text-muted"
                                />
                              )}
                            </button>
                            {i.title !== i.filename && (
                              <Sub>
                                <span className="block max-w-[24rem] [overflow-wrap:anywhere]">
                                  {i.filename}
                                </span>
                              </Sub>
                            )}
                          </Td>
                          <Td>
                            {i.clientPartyId === null || i.clientName === null ? (
                              <NotSet>No client</NotSet>
                            ) : mayListClients ? (
                              <Link
                                href={`/clients/${i.clientPartyId}`}
                                className="block max-w-64 whitespace-normal"
                              >
                                {i.clientName}
                              </Link>
                            ) : (
                              <span className="block max-w-64 whitespace-normal">{i.clientName}</span>
                            )}
                          </Td>
                          <Td>
                            <Pill tone={i.route === "manual" ? "warn" : "neutral"}>
                              {readerWords(i.route)}
                            </Pill>
                            <Sub>{basisWords(i.routeBasis, i.filename)}</Sub>
                          </Td>
                          <Td align="right">
                            <span className="whitespace-nowrap">{formatBytes(i.byteSize)}</span>
                          </Td>
                          <Td>
                            <time dateTime={i.takenAt} className="whitespace-nowrap">
                              {longMoment(i.takenAt)}
                            </time>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            </Card>
          )}

          {shown.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-4">
              {shown.next !== null && (
                <Button
                  variant="secondary"
                  loading={more}
                  onClick={() => {
                    if (shown.next !== null) void showMore(shown.next);
                  }}
                >
                  Show more
                </Button>
              )}
              <p className="text-sm text-muted" role="status">
                Showing {finCount(shown.items.length)} of{" "}
                {inFilter === 1 ? "1 file" : `${finCount(inFilter)} files`}
              </p>
            </div>
          )}
          <ErrorNotice error={moreError} />
        </>
      )}
    </Page>
  );
}

/**
 * The counts, each one a filter: every file, then one tile per reader.
 *
 * Buttons that say whether they are pressed (`aria-pressed`), not a tab list:
 * the table under them is the same table narrowed, not a different panel.
 * Pressing the reader that is already chosen clears it. "Needs a person" is
 * drawn in the warn tone while it holds anything, because it is held up work
 * (`warn` means held up, never wrong); at zero it is an ordinary tile.
 */
function ReaderCounts({
  summary,
  reader,
  onPick,
}: {
  summary: FinIntakePage["summary"];
  reader: FinReader | "";
  onPick: (code: FinReader | "") => void;
}) {
  const tiles: { code: FinReader | ""; label: string; n: number }[] = [
    { code: "", label: "All files", n: summary.total },
    ...FIN_READERS.map((r) => ({ code: r.code, label: r.many, n: summary.byRoute[r.code] })),
  ];
  return (
    <div
      role="group"
      aria-label="Files by reader"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      {tiles.map((t) => {
        const pressed = reader === t.code;
        const waiting = t.code === "manual" && t.n > 0;
        return (
          <button
            key={t.code === "" ? "all" : t.code}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              onPick(pressed ? "" : t.code);
            }}
            className={cn(
              "flex flex-col gap-1 rounded-md border px-4 py-3 text-left transition-colors",
              waiting
                ? "border-warn bg-warn-wash text-warn-ink"
                : "border-line bg-surface text-ink hover:bg-surface-hover",
              pressed && (waiting ? "border-warn-ink shadow-md" : "border-ink-2 bg-surface-sunk shadow-md"),
            )}
          >
            <span className="text-2xl font-semibold tabular-nums">{finCount(t.n)}</span>
            <span className={cn("text-sm", waiting ? "font-semibold" : "text-ink-2")}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
