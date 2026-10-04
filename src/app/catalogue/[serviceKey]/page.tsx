"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, ConfigVersion, ObligationRule } from "@/lib/api/client";
import {
  Button,
  Card,
  Meta,
  MetaItem,
  Notice,
  NotSet,
  Pill,
  scrollBelowBar,
  TabPanel,
  Tabs,
  useAppearFocus,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader, useSession } from "@/components/layout";
import { createBodyOf, type RuleDraft } from "../../admin/obligation-rules/rule-editor";
import { ComplianceFilings } from "../compliance-filings";
import { CountryCodes, DeptChip, StatusPill } from "../parts";
import { ServiceForm, processLabel, stillRefused, type Refusals } from "../service-form";
import {
  BASIS_WORDS,
  RECURRENCE_WORDS,
  SCOPE_BLOCKS,
  axisName,
  bodyOf,
  changesBetween,
  countriesWords,
  draftOf,
  nameOf,
  priceWords,
  readServiceRecord,
  refusalsOf,
  rowFromHistory,
  turnaroundWords,
  type Change,
  type Namer,
  type ServiceDraft,
  type ServiceRecord,
  type ServiceRow,
} from "../service";
import {
  ARRIVAL_KEY,
  FailureNote,
  currencyList,
  currencyOf,
  failureOf,
  loadFormContext,
  suggestedCountries,
  type Arrival,
  type Failure,
  type FormContext,
} from "../shared";
import { ServiceHistory } from "./history";

/**
 * ONE SERVICE, its own page (Wave 4 brief §8.2, 2026-09-28), opened from a row
 * of `/catalogue`.
 *
 * Four short tabs, the tab in the URL (`?tab=`), so the library's "Used in"
 * lands on the filings and a reload stays put:
 *
 *   Overview           what we do, what the client does, what the price
 *                      assumes, what is not included, and the basics. Empty
 *                      ones are HIDDEN, and one line names what is missing
 *                      with "Add them", which opens Edit at the first.
 *   Price & billing    the price, how it is charged, how often.
 *   Compliance filings the T6.16 section, moved here with its behaviour.
 *   History            every version, what each changed and when.
 *
 * EDIT MAKES A DRAFT. Publishing freezes a version, and a proposal keeps the
 * version it was quoted from, so a change is always a new version. The screen
 * stopped explaining that (the brief): "Edit" opens the form, "Save as draft"
 * leaves the change waiting under an amber "Unpublished changes" with what it
 * changes listed, and "Publish" puts it in force. "Save and publish" does both
 * in one press, which is what changing a price usually is. The version
 * mechanics underneath are the same calls the old cards made.
 *
 * WHAT THE PAGE SHOWS WHILE A CHANGE WAITS is the LIVE version, because that is
 * what a proposal quotes today, with the waiting changes listed above the
 * tabs. The form opens on the draft, so a second edit carries the first.
 *
 * READING IS `config:read`, writing `tenant:admin`: Edit and Publish are offered
 * to an admin, and the API refuses anybody else regardless.
 */
export default function ServicePage() {
  return (
    <Suspense fallback={<Loading label="Loading the service" />}>
      <Service />
    </Suspense>
  );
}

type TabKey = "overview" | "price" | "filings" | "history";
const TABS: readonly TabKey[] = ["overview", "price", "filings", "history"];

function Service() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ serviceKey: string }>();
  const search = useSearchParams();
  const session = useSession();
  const tabsId = useId();
  const formId = useId();
  const key = decodeURIComponent(params.serviceKey);

  const [entry, setEntry] = useState<ConfigEntry["entry"] | null>(null);
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [ctx, setCtx] = useState<FormContext | null>(null);
  const [filings, setFilings] = useState<ObligationRule[] | null>(null);
  const [filingsUnread, setFilingsUnread] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // What the last publish or save DID, in words; focused as it appears.
  const [said, setSaid] = useState<Arrival | null>(null);
  const saidRef = useAppearFocus(said === null ? null : said.sentence);
  // The form, while it is open.
  const [editing, setEditing] = useState<ServiceDraft | null>(null);
  const [refused, setRefused] = useState<Refusals>({});
  const [focusField, setFocusField] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [history, context] = await Promise.all([
      api.GET("/api/v1/config/{kind}/{key}", { params: { path: { kind: "service", key } } }),
      loadFormContext(),
    ]);
    if (history.response.status === 401) {
      router.push("/login");
      return;
    }
    if (history.error) {
      setMissing(
        history.response.status === 404 ? "There is no such service in the catalogue." : apiError(history.error).message,
      );
      setLoaded(true);
      return;
    }
    setEntry(history.data.entry);
    setVersions(history.data.versions.filter((v) => v !== null));
    if (!("status" in context)) {
      setCtx(context);
      // Keep a list read earlier when a reload's read fails for a reason that
      // is not a permission: said to be possibly out of date, never emptied.
      if (context.filings !== null) setFilings([...context.filings]);
      else if (!context.filingsUnread) setFilings(null);
      setFilingsUnread(context.filingsUnread);
    }
    setMissing(null);
    setLoaded(true);
  }, [key, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // WHAT "ADD A SERVICE" SAID, carried across the navigation that landed
  // here. Read once and removed; a blocked storage just means no sentence.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(`${ARRIVAL_KEY}.${key}`);
      window.sessionStorage.removeItem(`${ARRIVAL_KEY}.${key}`);
    } catch {
      raw = null;
    }
    if (raw === null) return;
    try {
      const arrival = JSON.parse(raw) as Arrival;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage the navigation left behind
      setSaid(arrival);
    } catch {
      /* A sentence that cannot be read is simply not shown. */
    }
  }, [key]);

  // "Add them" and a refused save put focus on the box that needs it, once
  // the form has rendered, below the sticky bar.
  useEffect(() => {
    if (focusField === null || editing === null) return;
    const id = `${formId}-${focusField}`;
    scrollBelowBar(id);
    document.getElementById(id)?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot request, cleared once served
    setFocusField(null);
  }, [focusField, editing, formId]);

  if (!loaded) return <Loading label="Loading the service" />;
  if (entry === null || missing !== null) {
    return (
      <Page>
        <PageHeader eyebrow={<Link href="/catalogue">Catalogue</Link>} title="Service not found" />
        <Notice tone="danger">{missing ?? "There is no such service in the catalogue."}</Notice>
      </Page>
    );
  }

  const row = rowFromHistory(entry, versions);
  // B09/F09: a login that cannot see fees reads the price as Hidden and may
  // not write the service (the API refuses: it would wipe the price).
  const seesFees = session === null ? null : session.commercialVisibility === true;
  const canWrite = (session?.permissions.includes("tenant:admin") ?? false) && seesFees === true;
  const canReadLibrary = session?.permissions.includes("party:read") ?? false;
  const axes = ctx?.axes ?? [];
  const workflows = ctx?.workflows ?? [];
  const names: Namer = {
    dept: (c) => axisName(axes, "dept", c) ?? c,
    team: (c) => axisName(axes, "team", c) ?? c,
    process: (k) => {
      const w = workflows.find((x) => x.entry.key === k);
      return w === undefined ? k : processLabel(w);
    },
  };
  const linkedCount =
    filings === null ? null : filings.filter((f) => f.usedIn.some((u) => u.serviceEntryId === row.id)).length;

  const askedTab = search.get("tab");
  const tab: TabKey = TABS.find((t) => t === askedTab) ?? "overview";
  function showTab(next: TabKey): void {
    const q = new URLSearchParams(search.toString());
    if (next === "overview") q.delete("tab");
    else q.set("tab", next);
    const query = q.toString();
    router.replace((query === "" ? pathname : `${pathname}?${query}`) as Route, { scroll: false });
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  async function publish(): Promise<void> {
    const draft = row.draft;
    if (draft === null) return;
    setBusy("publish");
    setFailure(null);
    setSaid(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "service", key: row.key, version: draft.version } },
    });
    if (result.error) {
      setFailure(failureOf("publish", result.error));
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
    setSaid({ sentence: publishedSentence(row, readServiceRecord(draft.body)), failed: [] });
  }

  function startEdit(field: string | null): void {
    setFailure(null);
    setSaid(null);
    setRefused({});
    setEditing(draftOf(row.working, ctx === null ? "INR" : currencyOf(ctx)(row.working.jurisdictions[0] ?? null)));
    setFocusField(field ?? "name");
  }

  async function save(mode: "publish" | "draft"): Promise<void> {
    if (editing === null) return;
    const local = refusalsOf(editing);
    setRefused(local);
    const firstRefused = (["name", "slaDays", "amount"] as const).find((f) => local[f] !== undefined);
    if (firstRefused !== undefined) {
      setFocusField(firstRefused);
      return;
    }
    setBusy("save");
    setFailure(null);
    setSaid(null);
    const made = await api.POST("/api/v1/config/{kind}/{key}/versions", {
      params: { path: { kind: "service", key: row.key } },
      body: { body: bodyOf(editing, row.working) },
    });
    if (!made.data) {
      setFailure(failureOf("save", made.error));
      setBusy(null);
      return;
    }
    const after = readServiceRecord(made.data.body);
    let sentence: string;
    if (mode === "publish") {
      const put = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "service", key: row.key, version: made.data.version } },
      });
      if (put.error) {
        // The draft is saved; only the publish was refused. Said as both.
        await load();
        setEditing(null);
        setBusy(null);
        setFailure(failureOf("publish", put.error));
        return;
      }
      sentence = publishedSentence(row, after);
    } else {
      sentence =
        row.published === null
          ? `${after.name === "" ? nameOf(row) : after.name} is saved. It is still a draft: publish it to quote it.`
          : "Changes saved. They are not live until you publish them.";
    }
    await load();
    setEditing(null);
    setBusy(null);
    // The sentence takes focus as it appears (`useAppearFocus`): the form
    // whose button was pressed has just unmounted.
    setSaid({ sentence, failed: [] });
  }

  // The filings section's own writes (T6.16), unchanged: busy, the refusal
  // cleared BEFORE the call and drawn where the press was, then a reload, and
  // the answer returned so the section can say what happened.
  async function answered<T>(at: string, call: () => Promise<{ data?: T; error?: unknown }>): Promise<T | null> {
    setBusy(at);
    setFailure(null);
    const result = await call();
    if (result.data === undefined) {
      setFailure(failureOf(at, result.error));
      setBusy(null);
      return null;
    }
    await load();
    setBusy(null);
    return result.data;
  }

  const noteFor = (at: string): ReactNode =>
    failure !== null && failure.at === at ? <FailureNote failure={failure} /> : null;

  // ── Drawing ───────────────────────────────────────────────────────────────

  const name = nameOf(row);
  const changes: Change[] =
    row.status === "changes" && row.draft !== null ? changesBetween(row.body, row.working, names) : [];

  return (
    <Page>
      <title>{`${name} · Catalogue`}</title>
      <PageHeader
        eyebrow={<Link href="/catalogue">Catalogue</Link>}
        title={name}
        aside={
          canWrite && editing === null ? (
            <>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  startEdit(null);
                }}
              >
                Edit
              </Button>
              {row.draft !== null && (
                <Button loading={busy === "publish"} disabled={busy !== null && busy !== "publish"} onClick={() => void publish()}>
                  Publish
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="cluster mt-3">
          {row.body.ref !== null && <Pill tone="code">{row.body.ref}</Pill>}
          <DeptChip axes={axes} code={row.body.module} />
          <CountryCodes codes={row.body.jurisdictions} />
          <StatusPill status={row.status} />
        </div>
      </PageHeader>

      {said !== null && (
        <div ref={saidRef} tabIndex={-1} className="stack tight">
          <Notice tone="ok">{said.sentence}</Notice>
          {said.unpublished != null && (
            <Notice tone="danger">
              It is saved as a draft but was not published: {said.unpublished}
            </Notice>
          )}
          {said.failed.length > 0 && (
            <Notice tone="danger">
              {said.failed.map((f) => (
                <p key={f.name}>
                  {f.name} was not added: {f.message} Add it on the Compliance filings tab.
                </p>
              ))}
            </Notice>
          )}
        </div>
      )}
      {noteFor("publish")}

      {editing === null && row.status === "changes" && (
        <Notice tone="warn" eyebrow="Unpublished changes">
          <p>New proposals use the live version until you publish.</p>
          <ChangeList changes={changes} />
        </Notice>
      )}
      {editing === null && row.status === "draft" && (
        <Notice>Not published yet, so it cannot be quoted.</Notice>
      )}

      {editing !== null && ctx !== null ? (
        <>
          <ServiceForm
            formId={formId}
            draft={editing}
            onChange={(next) => {
              setEditing(next);
              // A box's own sentence goes the moment it is fixed; nothing new
              // appears until the next save is pressed.
              setRefused((shown) => stillRefused(shown, refusalsOf(next)));
            }}
            axes={axes}
            workflows={workflows}
            suggestedCountries={suggestedCountries(ctx)}
            currencies={currencyList(ctx, editing.currency)}
            currencyFor={currencyOf(ctx)}
            refused={refused}
            onSubmit={(mode) => void save(mode)}
          />
          <div className="stack snug">
            {noteFor("save")}
            <div className="cluster">
              <Button type="submit" form={formId} value="publish" loading={busy === "save"} disabled={busy !== null && busy !== "save"}>
                Save and publish
              </Button>
              <Button type="submit" form={formId} value="draft" variant="secondary" disabled={busy !== null}>
                Save as draft
              </Button>
              <Button
                variant="ghost"
                disabled={busy === "save"}
                onClick={() => {
                  setEditing(null);
                  setRefused({});
                  setFailure(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <Tabs
            id={tabsId}
            label="About this service"
            value={tab}
            onChange={showTab}
            tabs={[
              { value: "overview", label: "Overview" },
              { value: "price", label: "Price & billing" },
              {
                value: "filings",
                label: "Compliance filings",
                ...(linkedCount === null ? {} : { count: linkedCount }),
              },
              { value: "history", label: "History" },
            ]}
          />
          <TabPanel tabsId={tabsId} value={tab}>
            <Card>
              {tab === "overview" && (
                <Overview
                  body={row.body}
                  names={names}
                  canWrite={canWrite}
                  onAdd={(field) => {
                    startEdit(field);
                  }}
                />
              )}
              {tab === "price" && <PriceAndBilling body={row.body} seesFees={seesFees} />}
              {tab === "filings" && (
                <ComplianceFilings
                  service={{ id: row.id, key: row.key, name }}
                  filings={filings}
                  unread={filingsUnread}
                  canWrite={canWrite}
                  canReadLibrary={canReadLibrary}
                  busy={busy !== null}
                  working={busy === "filings"}
                  note={noteFor("filings")}
                  onAdd={(rule) =>
                    answered("filings", () =>
                      api.POST("/api/v1/services/{serviceEntryId}/filings", {
                        params: { path: { serviceEntryId: row.id } },
                        // Any rule of the chain is accepted; the one in force is what is sent.
                        body: { ruleId: rule.id },
                      }),
                    )
                  }
                  onRemove={(rule) =>
                    answered("filings", () =>
                      api.POST("/api/v1/services/{serviceEntryId}/filings/{ruleId}/unlink", {
                        params: { path: { serviceEntryId: row.id, ruleId: rule.id } },
                      }),
                    )
                  }
                  onWrite={(draft: RuleDraft) =>
                    // Written into the library and onto this service in ONE
                    // call, so the rule never exists on no service.
                    answered("filings", () =>
                      api.POST("/api/v1/obligation-rules", {
                        body: { ...createBodyOf(draft), serviceEntryIds: [row.id] } as never,
                      }),
                    )
                  }
                />
              )}
              {tab === "history" && <ServiceHistory versions={versions} names={names} />}
            </Card>
          </TabPanel>
        </>
      )}
    </Page>
  );
}

/** After a publish: what is now live, in the words a partner checks. */
function publishedSentence(before: ServiceRow, after: ServiceRecord): string {
  const name = after.name === "" ? nameOf(before) : after.name;
  if (before.published === null) return `${name} is live. It can be quoted now.`;
  const price = priceWords(after);
  const was = priceWords(before.body);
  return price !== null && price !== was
    ? `Published. New proposals quote ${name} at ${price}.`
    : "Published. New proposals use these details.";
}

/** "Price: SGD 900 / quarter → SGD 950 / quarter", and a long text by name. */
function ChangeList({ changes }: { changes: readonly Change[] }) {
  if (changes.length === 0) return <p>Nothing differs from the live version.</p>;
  return (
    <ul className="stack tight">
      {changes.map((c) => (
        <li key={c.label}>
          <strong>{c.label}</strong>
          {c.before === undefined ? (
            ": changed"
          ) : (
            <>
              {": "}
              {c.before ?? <NotSet />} → {c.after ?? <NotSet />}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── The tabs ────────────────────────────────────────────────────────────────

/** The details a service can leave empty, in the order "missing" names them,
 *  each with the form box "Add them" opens at. */
const DETAILS: readonly { readonly label: string; readonly field: string; readonly empty: (b: ServiceRecord) => boolean }[] = [
  { label: "Dept", field: "module", empty: (b) => b.module === null },
  { label: "Delivery team", field: "group", empty: (b) => b.group === null },
  { label: "How it is delivered", field: "workflowTemplateKey", empty: (b) => b.workflowTemplateKey === null },
  { label: "Turnaround", field: "slaDays", empty: (b) => b.slaDays === null },
  ...SCOPE_BLOCKS.map((s) => ({ label: s.heading, field: s.field, empty: (b: ServiceRecord) => b[s.field] === null })),
];

function Overview({
  body,
  names,
  canWrite,
  onAdd,
}: {
  body: ServiceRecord;
  names: Namer;
  canWrite: boolean;
  onAdd: (field: string) => void;
}) {
  const missing = DETAILS.filter((d) => d.empty(body));
  const turnaround = turnaroundWords(body.slaDays, body.recurrence);
  const texts = SCOPE_BLOCKS.filter((s) => body[s.field] !== null);
  return (
    <div className="stack">
      {body.description !== null && <p className="text-md">{body.description}</p>}
      <Meta>
        {body.module !== null && <MetaItem label="Dept">{names.dept(body.module)}</MetaItem>}
        {body.group !== null && <MetaItem label="Delivery team">{names.team(body.group)}</MetaItem>}
        <MetaItem label="Offered in">{countriesWords(body.jurisdictions)}</MetaItem>
        {body.workflowTemplateKey !== null && (
          <MetaItem label="How it is delivered">{names.process(body.workflowTemplateKey)}</MetaItem>
        )}
        {turnaround !== null && <MetaItem label="Turnaround">{turnaround}</MetaItem>}
        {body.category !== null && <MetaItem label="Category">{body.category}</MetaItem>}
      </Meta>
      {texts.length > 0 && (
        <div className="prose-grid">
          {texts.map((s) => (
            <section key={s.field} className="prose">
              {/* A label's size and ink, like the facts above it: these are
                  four named texts, not four sections of a page. */}
              <h3 className="mb-1 text-xs font-semibold text-ink-2">{s.heading}</h3>
              <p>{body[s.field]}</p>
            </section>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="text-md">
          {missing.length === 1 ? "1 detail missing" : `${String(missing.length)} details missing`}:{" "}
          {missing.map((m) => m.label).join(", ")}.
          {canWrite && (
            <>
              {" "}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onAdd(missing[0]?.field ?? "name");
                }}
              >
                {missing.length === 1 ? "Add it" : "Add them"}
              </Button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function PriceAndBilling({ body, seesFees }: { body: ServiceRecord; seesFees: boolean | null }) {
  const price = priceWords(body);
  return (
    <Meta>
      <MetaItem label="Price">
        {seesFees === false ? (
          <NotSet>Hidden</NotSet>
        ) : price === null ? (
          <NotSet>No list price. Quoted per client.</NotSet>
        ) : (
          <strong className="text-lg">{price}</strong>
        )}
      </MetaItem>
      <MetaItem label="Charged as">
        {body.billingBasis === null ? <NotSet /> : BASIS_WORDS[body.billingBasis]}
      </MetaItem>
      <MetaItem label="How often">
        {body.recurrence === null ? <NotSet /> : RECURRENCE_WORDS[body.recurrence]}
      </MetaItem>
      {body.pricingNote !== null && <MetaItem label="Pricing note">{body.pricingNote}</MetaItem>}
      <MetaItem label="SAC (India)">{body.tax["IN"]?.sac ?? <NotSet />}</MetaItem>
      <MetaItem label="GST rate (India)">
        {body.tax["IN"]?.ratePercent == null ? <NotSet /> : `${body.tax["IN"].ratePercent}%`}
      </MetaItem>
    </Meta>
  );
}
