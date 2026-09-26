"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { ServiceAxis } from "@/lib/api/client";
import type { ConfigEntry, ObligationRule } from "@/lib/api/client";
import { createBodyOf, type RuleDraft } from "../admin/obligation-rules/rule-editor";
import { ComplianceFilings, NewServiceFilings, willConfirm } from "./compliance-filings";
import {
  Button,
  scrollBelowBar,
  Field,
  FieldRow,
  Input,
  Meta,
  MetaItem,
  NotStated,
  Notice,
  Pill,
  Prose,
  Select,
  Textarea,
  useAppearFocus,
} from "@/components/ui";
import { Card, CardTitle, Page, PageHeader } from "@/components/tw";

/**
 * What the firm sells, the terms it sells under, and the one rule it sells by.
 *
 * This is the configuration registry with its commercial hat on — the same
 * machinery as `/admin/roles`, different kinds. Three things about it decide how
 * this screen behaves and none of them is presentation:
 *
 * PUBLISHING FREEZES. A published version's body can never change; an edit is a
 * NEW version, and the one it replaces is archived and stays readable forever.
 * That is what makes a proposal's pin meaningful — a quote sent in March still
 * resolves March's price after the catalogue moved on. So this screen offers
 * "new version", never "edit", and it never lets a draft and a published version
 * look like the same thing.
 *
 * A BODY IS STORED VERBATIM AND READ BACK BY NAME, which is why the API refuses
 * an unknown key outright instead of ignoring it: a misspelt field would save
 * and then do nothing. Every write here therefore sends only fields it has a
 * value for — a blank input is sent as NOTHING, never as "" — and shows the
 * API's refusal word for word when one comes back. Those refusals are the most
 * useful text on this screen: they name the field, the value they got and the
 * form they wanted.
 *
 * READING IS BROAD, WRITING IS `tenant:admin`. An associate quotes from the
 * catalogue, so the record is theirs to read; changing what the firm sells is
 * not. The controls are offered on that basis and the API refuses regardless.
 *
 * A SERVICE SAYS WHAT IT FILES, HERE AND NOWHERE ELSE (T6.16). Each service
 * card carries its compliance filings, added from the firm's library or
 * written on the spot, and this is the one place a filing is linked to a
 * service: the rule editor's single-service picker is gone, because a rule on
 * NO service used to mean "every service" and that is how a bookkeeping-only
 * client was sent 98 GST filings. A rule no service carries now adds nothing
 * to the calendar. Removing one withdraws the upcoming filings nobody started
 * and says what it kept. The filings are NOT versioned with the service body,
 * and `compliance-filings.tsx` says why. The "Add a service" form lists them
 * too (`NewServiceFilings`), because that is where a partner building a
 * service looks for them; they are sent once the service exists.
 */
export default function CataloguePage() {
  const router = useRouter();
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [clauses, setClauses] = useState<ConfigEntry[]>([]);
  const [policies, setPolicies] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  // The firm's own Dept/team lists, for the two pickers. Only an admin can read
  // them (the route is `tenant:admin`, like the form itself), so a reader who
  // cannot write simply gets no lists and sees the codes as stored — which is
  // exactly what the field holds anyway.
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  // The firm's published processes, for the picker. `config:read`, like the
  // catalogue itself — an associate reading a service should see how it is done.
  const [workflows, setWorkflows] = useState<ConfigEntry[]>([]);
  // The firm's whole compliance library, one row per chain, each saying which
  // services carry it. ONE read for every card on the page (T6.16); null when
  // this session may not read it (`party:read`, where the catalogue itself is
  // `config:read`), which each card says rather than drawing an empty list.
  const [filings, setFilings] = useState<ObligationRule[] | null>(null);
  // The LAST read of that library failed for a reason that is not a
  // permission (a throttle, a server error). Kept apart from `filings` so a
  // 429 is never drawn as "your role cannot see", and so a list read earlier
  // stays on screen, said to be possibly out of date, rather than vanishing.
  const [filingsUnread, setFilingsUnread] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The compliance filings the service being ADDED will carry: chosen from the
  // library or written on the form, and sent only once the service exists,
  // because a link hangs off its catalogue entry (see `NewServiceFilings`).
  const [newChosen, setNewChosen] = useState<readonly ObligationRule[]>([]);
  const [newDrafts, setNewDrafts] = useState<readonly RuleDraft[]>([]);
  // What adding the service DID, filings included, in words.
  const [defined, setDefined] = useState<Defined | null>(null);
  const definedRef = useAppearFocus(defined === null ? null : defined.sentence);

  const load = useCallback(async (): Promise<void> => {
    const [catalogue, library, policy, me, structure, processes, compliance] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "policy" } } }),
      api.GET("/api/v1/auth/me", {}),
      // 403 for a reader without `tenant:admin`, and that is not an error here:
      // the lists feed a form only an admin is shown. `?? []` is the whole
      // handling, deliberately — a failure note about a list nobody was going
      // to use would be noise on a screen that reads fine without it.
      api.GET("/api/v1/tenancy/structure", {}),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "workflow_template" } } }),
      // Every service's filings in one request, never one per card: the local
      // limit is about 300 requests a minute and this page is already six.
      api.GET("/api/v1/obligation-filings", {}),
    ]);
    if (catalogue.response.status === 401) {
      router.push("/login");
      return;
    }
    if (catalogue.error) {
      setFailure(failureOf("load", catalogue.error));
      setLoaded(true);
      return;
    }
    setServices(catalogue.data.entries);
    setClauses(library.data?.entries ?? []);
    setPolicies(policy.data?.entries ?? []);
    setPermissions(me.data?.permissions ?? []);
    setAxes(structure.data?.axes ?? []);
    setWorkflows(processes.data?.entries ?? []);
    // ONLY A 403 MEANS "YOUR ROLE CANNOT SEE". Every other failure keeps the
    // list already on screen (null only if there has never been one) and
    // says it could not be refreshed. `?? null` on any failure told an admin
    // whose reload was throttled that their role could not see filings, hid
    // the add and remove controls, and swallowed the sentence saying what
    // their add had just done.
    if (compliance.data !== undefined) {
      setFilings(compliance.data.filings);
      setFilingsUnread(false);
    } else if (compliance.response.status === 403) {
      setFilings(null);
      setFilingsUnread(false);
    } else {
      setFilingsUnread(true);
    }
    setFailure(null);
    // One call. What is in force AND what is waiting both come back on the list,
    // so there is nothing to fill in afterwards and no half-painted state.
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // THE LIBRARY LINKS HERE BY SERVICE, as `/catalogue#service-<key>`, and the
  // browser's own jump to the anchor happens before this page has read its
  // services, so it finds nothing and stays at the top. This repeats it once
  // the cards exist, below the sticky top bar (see `scrollBelowBar`).
  useEffect(() => {
    if (!loaded) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id !== "") scrollBelowBar(id);
  }, [loaded]);

  async function act(at: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(at);
    setFailure(null);
    const result = await call();
    if (result.error) {
      // Verbatim, and shown where the attempt was made. The config validator's
      // message is the whole explanation — "frc" beside "FRC" silently splits a
      // revenue report in two — and a local "something went wrong" would throw
      // away the only sentence that tells somebody how to fix it.
      setFailure(failureOf(at, result.error));
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  /**
   * `act` for a write whose ANSWER is the point.
   *
   * `act` throws the success body away, which is right for a publish and wrong
   * here: adding a filing says how many filings reached the calendar and for
   * how many companies, and removing one says what came off and what stayed
   * and why. So this is the same shape (busy, failure cleared BEFORE the call,
   * the refusal verbatim at `at`, then a reload) returning the body, and the
   * section turns it into the sentence. The reload comes first so the sentence
   * lands on a card that already shows the new state.
   */
  async function answered<T>(
    at: string,
    call: () => Promise<{ data?: T; error?: unknown }>,
  ): Promise<T | null> {
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

  function addFiling(row: ServiceRow, rule: ObligationRule) {
    return answered(`filings:${row.key}`, () =>
      api.POST("/api/v1/services/{serviceEntryId}/filings", {
        params: { path: { serviceEntryId: row.id } },
        // Any rule of the chain is accepted; the one in force is what is sent.
        body: { ruleId: rule.id },
      }),
    );
  }

  function removeFiling(row: ServiceRow, rule: ObligationRule) {
    return answered(`filings:${row.key}`, () =>
      api.POST("/api/v1/services/{serviceEntryId}/filings/{ruleId}/unlink", {
        params: { path: { serviceEntryId: row.id, ruleId: rule.id } },
      }),
    );
  }

  /** Written into the library and onto this service in ONE call: the API links
   *  it in the same transaction, so there is no moment where the rule exists
   *  on no service and a failure could leave it there. */
  function writeFiling(row: ServiceRow, draft: RuleDraft) {
    return answered(`filings:${row.key}`, () =>
      api.POST("/api/v1/obligation-rules", {
        body: { ...createBodyOf(draft), serviceEntryIds: [row.id] } as never,
      }),
    );
  }

  function noteFor(at: string): ReactNode {
    return failure !== null && failure.at === at ? <FailureNote failure={failure} /> : null;
  }

  /**
   * Add a service, and then the compliance filings the form listed for it.
   *
   * THREE KINDS OF CALL, IN ORDER, AND NOT ONE TRANSACTION. The service first,
   * because every link names its catalogue entry and there is none before it.
   * Then each filing from the library, then each one written on the form (the
   * create links it in the same call, so a written rule is never left on no
   * service). They are separate routes owned by separate use cases, so a
   * filing can be refused after the service went in: that is said filing by
   * filing, with the API's own sentence, and the service's card is where it is
   * added again. A refused SERVICE sends nothing else and keeps the list, so
   * the partner does not have to choose the filings twice.
   */
  async function define(form: FormData): Promise<void> {
    const key = String(form.get("key")).trim();
    const name = String(form.get("name") ?? "").trim();
    setBusy("define");
    setFailure(null);
    setDefined(null);
    const made = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind: "service" } },
      body: { key, body: serviceBody(form) },
    });
    if (made.data === undefined) {
      setFailure(failureOf("define", made.error));
      setBusy(null);
      return;
    }
    const serviceEntryId = made.data.entry.id;
    const added: string[] = [];
    const confirmed: string[] = [];
    const failed: { name: string; message: string }[] = [];
    for (const rule of newChosen) {
      const linked = await api.POST("/api/v1/services/{serviceEntryId}/filings", {
        params: { path: { serviceEntryId } },
        body: { ruleId: rule.id },
      });
      if (linked.data === undefined) {
        failed.push({ name: rule.name, message: apiError(linked.error).message });
        continue;
      }
      added.push(rule.name);
      if (linked.data.effect.confirmed) confirmed.push(rule.name);
    }
    for (const draft of newDrafts) {
      const written = await api.POST("/api/v1/obligation-rules", {
        body: { ...createBodyOf(draft), serviceEntryIds: [serviceEntryId] } as never,
      });
      if (written.error) {
        failed.push({ name: draft.name.trim(), message: apiError(written.error).message });
        continue;
      }
      added.push(draft.name.trim());
    }
    setNewChosen([]);
    setNewDrafts([]);
    await load();
    setBusy(null);
    setDefined({
      key,
      sentence: definedSentence(name === "" ? key : name, added, confirmed),
      failed,
    });
  }

  function newVersion(key: string, form: FormData): void {
    void act(`version:${key}`, () =>
      api.POST("/api/v1/config/{kind}/{key}/versions", {
        params: { path: { kind: "service", key } },
        body: { body: serviceBody(form) },
      }),
    );
  }

  function publish(key: string, version: number): void {
    void act(`publish:${key}`, () =>
      api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "service", key, version } },
      }),
    );
  }

  /** A clause is written and put in force in one act. There is no clause
   *  editor to come back to, so a draft left here would be a clause the list
   *  above marks "never in force" that no letter can pin — a thing that looks
   *  written and is not. */
  function defineClause(form: FormData): void {
    const key = String(form.get("key") ?? "").trim();
    void act("clause", async () => {
      const defined = await api.POST("/api/v1/config/{kind}", {
        params: { path: { kind: "clause" } },
        body: { key, body: clauseBody(form) },
      });
      if (defined.error) return defined;
      return api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "clause", key, version: 1 } },
      });
    });
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  const canWrite = permissions.includes("tenant:admin");
  const rows = services.map(serviceRow);
  const groups = byModule(rows);
  const discount = policies.find((p) => p.entry.key === "discount");
  const discountLimit =
    discount?.published === null || discount === undefined
      ? null
      : String(discount.published.body["maxDiscountPercent"] ?? "");

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="Catalogue"
        lede="Everything your firm sells: each service, its price, its turnaround and what it
        includes. Publishing a version freezes it. Every proposal and letter quoted from it
        keeps that version, so a change is always a new version."
      />
      {noteFor("load")}

      {rows.length > 0 && <Axes rows={rows} />}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Nothing in the catalogue yet.
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.module ?? ""}>
            <h2 className="eyebrow">
              {group.module === null ? (
                // A service filed under no Dept is not an error and must not be
                // dropped off the bottom of a grouped list: it is a row whose
                // revenue lands in no column of the firm's own dashboard.
                <NotStated>no Dept set</NotStated>
              ) : (
                <span>{group.module}</span>
              )}{" "}
              {/* `{" "}` and not a newline: JSX drops whitespace that spans a
                  line break, so these two spans rendered as "FRC· 2 services"
                  with the space missing, on every group heading. */}
              <span className="annot">
                · {group.rows.length} {group.rows.length === 1 ? "service" : "services"}
              </span>
            </h2>
            {group.rows.map((row) => (
              <ServiceCard
                key={row.key}
                row={row}
                canWrite={canWrite}
                busy={busy}
                note={noteFor}
                onPublish={publish}
                onNewVersion={newVersion}
                axes={axes}
                workflows={workflows}
                compliance={
                  <ComplianceFilings
                    service={{
                      id: row.id,
                      key: row.key,
                      name: row.body.name === "" ? row.key : row.body.name,
                    }}
                    filings={filings}
                    unread={filingsUnread}
                    canWrite={canWrite}
                    canReadLibrary={permissions.includes("party:read")}
                    busy={busy !== null}
                    working={busy === `filings:${row.key}`}
                    note={noteFor(`filings:${row.key}`)}
                    onAdd={(rule) => addFiling(row, rule)}
                    onRemove={(rule) => removeFiling(row, rule)}
                    onWrite={(draft) => writeFiling(row, draft)}
                  />
                }
              />
            ))}
          </section>
        ))
      )}

      {canWrite && (
        <Card>
          <CardTitle level={2}>Add a service</CardTitle>
          <p className="text-md text-muted">
            Only the name, the short name and how it is charged are required. Leave anything else
            blank if your firm has not decided it yet, and the service will show that field as
            not stated.
          </p>
          <form
            id="define-service"
            action={(form) => {
              void define(form);
            }}
          >
            <FieldRow>
              {/* The key is a HANDLE, not a title, and not the firm's service
                  code either: pins are written against it, so it never moves.
                  Lower case by rule — the code that prints on a proposal is
                  `ref` below. */}
              <Field
                label="Short name"
                hint="Lower case, no spaces, and permanent once set. Every proposal and letter refers to the service by this."
              >
                <Input name="key" placeholder="gst-filing" required />
              </Field>
            </FieldRow>
            <ServiceFields
              id="define"
              groupLabel="A new service"
              defaults={null}
              axes={axes}
              workflows={workflows}
            />
          </form>
          {/* OUTSIDE the form on purpose: the filing editor is a column of text
              boxes, and Enter in a box inside a form submits it. The submit
              below reaches the form by its id. */}
          <NewServiceFilings
            filings={filings}
            unread={filingsUnread}
            busy={busy !== null}
            chosen={newChosen}
            drafts={newDrafts}
            onChosen={setNewChosen}
            onDrafts={setNewDrafts}
          />
          {noteFor("define")}
          {newChosen.some(willConfirm) && (
            // SAID BESIDE THE PRESS THAT DOES IT: adding the service confirms
            // these dates, and each is already written out in words above.
            <p className="text-sm text-muted">
              Adding the service also confirms the dates of{" "}
              {newChosen
                .filter(willConfirm)
                .map((r) => r.name)
                .join(", ")}
              , which nobody at your firm has checked against the law yet.
            </p>
          )}
          <div className="cluster">
            <Button
              type="submit"
              form="define-service"
              loading={busy === "define"}
              disabled={busy !== null && busy !== "define"}
            >
              Add as a draft
            </Button>
          </div>
          <p className="text-sm text-muted">
            Adding a service saves it as a draft. Publish it to start quoting it. Once published,
            a version never changes, so a proposal opened next year still shows the price it was
            sent at. Its compliance filings are not part of a version: they are added now, and
            can be changed on its card at any time.
          </p>
          {defined !== null && (
            <div ref={definedRef} tabIndex={-1} className="stack tight">
              <Notice tone="ok">
                <p>{defined.sentence}</p>
                <div className="cluster">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      window.history.replaceState(null, "", `#service-${defined.key}`);
                      scrollBelowBar(`service-${defined.key}`);
                    }}
                  >
                    Go to the service
                  </Button>
                </div>
              </Notice>
              {defined.failed.length > 0 && (
                <Notice tone="danger">
                  {defined.failed.map((f) => (
                    <p key={f.name}>
                      {f.name} was not added: {f.message} Add it from the service&rsquo;s card.
                    </p>
                  ))}
                </Notice>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle level={2}>Standard terms</CardTitle>
        <p className="text-md text-muted">
          The standard clauses your engagement letters are built from. Each clause records two
          separate things: the countries it may be used in, and what it says about whose law
          applies and which courts hear a dispute. A clause written for India cannot go out on
          a letter issued by your US company.
        </p>
        {clauses.length === 0 ? (
          <p className="text-sm text-muted">No clauses written yet.</p>
        ) : (
          clauses.map((entry) => <ClauseCard key={entry.entry.id} entry={entry} />)
        )}
        {/* THE WRITER. The library was listed here from the start and could
            only be filled by API: a firm with no clause for its own country
            cannot issue a letter at all — every engagement row on an import
            reads BLOCKING — and until this form existed nothing on any screen
            said how to fix that. */}
        {canWrite && (
          <form
            action={(form) => {
              defineClause(form);
            }}
            className="stack"
            style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s-4)", marginTop: "var(--s-4)" }}
          >
            <CardTitle>Write a clause</CardTitle>
            <p className="text-sm text-muted">
              A clause is live as soon as it is saved. Each letter keeps the version it was drafted
              from, so changing the wording later never changes a letter already sent.
            </p>
            <FieldRow>
              <Field label="Short name" hint="Lower case, no spaces, and permanent once set. Letters refer to the clause by this.">
                <Input name="key" placeholder="governing-law-in" required />
              </Field>
              <Field label="Title">
                <Input name="title" placeholder="Governing law and jurisdiction" required />
              </Field>
            </FieldRow>
            <Field label="The clause text, exactly as it will print">
              <Textarea name="text" rows={4} required />
            </Field>
            <FieldRow>
              <Field
                label="Usable in"
                optional
                hint="Two-letter country codes separated by commas, such as IN, AE. Leave blank if it can be used anywhere."
              >
                <Input name="jurisdictions" placeholder="IN, AE" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Governing law: country" optional hint="Fill in only on the clause that says whose law applies.">
                <Input name="lawJurisdiction" maxLength={2} placeholder="IN" style={{ textTransform: "uppercase" }} />
              </Field>
              <Field label="Governing law: wording" optional>
                <Input name="lawText" placeholder="the laws of the Republic of India" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Courts: country" optional>
                <Input name="courtsJurisdiction" maxLength={2} placeholder="IN" style={{ textTransform: "uppercase" }} />
              </Field>
              <Field label="Courts: wording" optional>
                <Input name="courtsText" placeholder="the courts at New Delhi" />
              </Field>
            </FieldRow>
            {noteFor("clause")}
            <div className="cluster">
              <Button type="submit" disabled={busy !== null}>
                Save and make it live
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle level={2}>Discount limit</CardTitle>
        <p className="text-md text-muted">
          {discountLimit === null || discountLimit === ""
            ? "No limit is set yet, so every discount needs sign-off from someone who can approve proposals."
            : `Up to ${discountLimit}% off can be given without sign-off. Above that, a proposal cannot be sent until someone who can approve proposals has approved it.`}
        </p>
        {canWrite && (
          <form
            action={(form) => {
              const max = String(form.get("maxDiscountPercent")).trim();
              // Defined once, then a new version each time — publishing freezes,
              // so a limit is never edited in place.
              void act("policy", () =>
                discount === undefined
                  ? api.POST("/api/v1/config/{kind}", {
                      params: { path: { kind: "policy" } },
                      body: { key: "discount", body: { maxDiscountPercent: max } },
                    })
                  : api.POST("/api/v1/config/{kind}/{key}/versions", {
                      params: { path: { kind: "policy", key: "discount" } },
                      body: { body: { maxDiscountPercent: max } },
                    }),
              );
            }}
          >
            <FieldRow>
              <Field label="Limit %">
                <Input
                  name="maxDiscountPercent"
                  defaultValue={discountLimit ?? "15"}
                  required
                />
              </Field>
              {/* The button was the second CELL of the grid, so it was sized by
                  the column rather than by its own words. */}
              <div className="cluster" style={{ alignSelf: "end" }}>
                <Button type="submit" disabled={busy !== null}>
                  {discount === undefined ? "Set it" : "Draft a new limit"}
                </Button>
              </div>
            </FieldRow>
            {noteFor("policy")}
            {discount !== undefined && (
              <p className="text-sm text-muted">
                A new limit is saved as a draft. The current limit stays in force until the draft
                is published.
              </p>
            )}
          </form>
        )}
      </Card>
    </Page>
  );
}

// ── One service ──────────────────────────────────────────────────────────────

function ServiceCard({
  row,
  canWrite,
  busy,
  note,
  onPublish,
  onNewVersion,
  axes,
  workflows,
  compliance,
}: {
  row: ServiceRow;
  canWrite: boolean;
  busy: string | null;
  note: (at: string) => ReactNode;
  onPublish: (key: string, version: number) => void;
  onNewVersion: (key: string, form: FormData) => void;
  axes: readonly ServiceAxis[];
  workflows: readonly ConfigEntry[];
  /** The service's compliance filings (T6.16), drawn LAST and outside both
   *  version blocks: a filing hangs off the service itself, not a version. */
  compliance: ReactNode;
}) {
  const { body, published, draft } = row;
  const draftBody = draft === null ? null : readServiceRecord(draft.body);
  return (
    /* The id is the anchor the library's "Used in" links land on, and the
       KEY is the only part of a service that never changes. */
    <article className="card stack" id={`service-${row.key}`}>
      <div className="card-head">
        {/* The firm's OWN code, printed as the firm writes it. It is on the body
            and not on the handle because a services-master renumber is an
            ordinary Tuesday and the handle is what every issued document pins
            through. */}
        {body.ref === null ? (
          <NotStated>no code</NotStated>
        ) : (
          <Pill tone="code">{body.ref}</Pill>
        )}
        <CardTitle>{body.name === "" ? row.key : body.name}</CardTitle>
        <span className="mono muted">{row.key}</span>
        <span style={{ marginLeft: "auto" }}>
          {published === null ? (
            // A draft was never in force, so it cannot be quoted — the proposal
            // screen will not offer it either.
            <Pill tone="danger">draft, not yet in force</Pill>
          ) : (
            /* `ok`, not `accent`. In force is a STATUS; `accent` is shadcn's
               neutral hover ground and the two have been confused six times on
               this product now. */
            <Pill tone="ok">in force · v{published.version}</Pill>
          )}
        </span>
      </div>

      {published === null && draft === null ? (
        // An entry always has at least one version, and the list now carries
        // both the published one and the pending draft — so both being null is
        // not "still loading", it is a row the API could not resolve. Saying so
        // beats rendering "not stated" against every field, which would be that
        // lie in full.
        <p className="text-md text-muted">
          The details of this service could not be loaded.
        </p>
      ) : (
        <>
          <ServiceFacts body={body} />
          <ServiceProse body={body} />
        </>
      )}

      {draft !== null && (
        <div style={{ marginTop: "var(--s-5)" }}>
          <p className="text-md text-muted">
            {published === null
              ? `Draft v${draft.version} is waiting to be published. This service cannot be quoted until then.`
              : `Draft v${draft.version} is waiting to be published. Until then, proposals keep using v${published.version}, shown above.`}
          </p>
          {published !== null && draftBody !== null && (
            // Side by side, never merged: what is in force is above, and this is
            // what would replace it. Blurring the two is the one thing this
            // screen must not do.
            <details style={{ marginTop: "var(--s-2)" }}>
              <summary>What draft v{draft.version} says</summary>
              <div style={{ marginTop: "var(--s-4)" }}>
                <ServiceFacts body={draftBody} />
                <ServiceProse body={draftBody} />
              </div>
            </details>
          )}
          {canWrite && (
            <>
              {note(`publish:${row.key}`)}
              <div className="cluster" style={{ marginTop: "var(--s-2)" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    onPublish(row.key, draft.version);
                  }}
                >
                  Publish v{draft.version}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {canWrite && draft === null && published !== null && (
        <details style={{ marginTop: "var(--s-5)" }}>
          {/* THE BUTTON INSIDE WAS NAMED BY THE HANDLE MONTHS AGO — see the note
              on it below — and the <summary> that opens the form was not,
              because nothing has ever counted a <summary>. Five services, five
              disclosures reading "Draft a new version". Visible word unchanged. */}
          <summary aria-label={`The form for a new version of ${row.key}`}>
            Draft a new version
          </summary>
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              onNewVersion(row.key, form);
            }}
          >
            <p className="text-sm text-muted">
              This form starts as a copy of the version in force. Change what you need. If you
              clear a field, the new version will show that field as not stated.
            </p>
            <ServiceFields
              id={`v-${row.key}`}
              groupLabel={`The service ${row.key}`}
              defaults={body}
              axes={axes}
              workflows={workflows}
            />
            {note(`version:${row.key}`)}
            <div className="cluster">
              {/* One per service, so five read "Draft it". By the service's
                  permanent handle. */}
              <Button
                type="submit"
                disabled={busy !== null}
                aria-label={`Draft a new version of ${row.key}`}
              >
                Draft it
              </Button>
            </div>
          </form>
        </details>
      )}

      {compliance}
    </article>
  );
}

/** The short facts: how it is filed, how it is sold, what it promises. */
function ServiceFacts({ body }: { body: ServiceRecord }) {
  return (
    <Meta>
      {/* Two axes, never a tree — see Axes below. */}
      <MetaItem label="Dept">
        {body.module === null ? <NotStated>no Dept set</NotStated> : body.module}
      </MetaItem>
      <MetaItem label="Delivery team">
        {body.group === null ? <NotStated>no team</NotStated> : body.group}
      </MetaItem>
      <MetaItem label="Charged">
        {body.billingBasis === null ? (
          <NotStated />
        ) : (
          body.billingBasis.replace("_", " ")
        )}
      </MetaItem>
      <MetaItem label="Recurs">
        {/* Null is not one_time. A consumer that defaulted it would put a billing
            frequency on an engagement letter that nobody chose. */}
        {body.recurrence === null ? (
          <NotStated />
        ) : (
          body.recurrence.replace("_", " ")
        )}
      </MetaItem>
      <MetaItem label="Turnaround">{slaSentence(body.slaDays, body.recurrence)}</MetaItem>
      <MetaItem label="List price">
        {/* Null is "we quote it", never zero and never free. */}
        {body.listPrice === null ? (
          <NotStated>no list price, quoted per engagement</NotStated>
        ) : (
          <span className="mono">
            {formatMoney(body.listPrice.amount, body.listPrice.currency)}
          </span>
        )}
      </MetaItem>
      <MetaItem label="Pricing note">
        {/* Allowed beside a price too: "plus statutory fees at actuals" belongs
            next to the money, not buried in the description. */}
        {body.pricingNote === null ? <NotStated /> : body.pricingNote}
      </MetaItem>
      <MetaItem label="Offered in">
        {body.jurisdictions.length === 0 ? (
          <span className="text-sm text-muted">everywhere</span>
        ) : (
          <span className="mono">{body.jurisdictions.join(", ")}</span>
        )}
      </MetaItem>
      <MetaItem label="Category">{body.category === null ? <NotStated /> : body.category}</MetaItem>
      <MetaItem label="Description">
        {body.description === null ? <NotStated /> : body.description}
      </MetaItem>
    </Meta>
  );
}

/**
 * The four blocks that protect the firm in a dispute.
 *
 * The firm's own words, in the firm's own order, never parsed into typed
 * limits: nothing here is metered, and past a ceiling the firm RE-ASSESSES the
 * engagement rather than auto-charging. A letter copies these and may override
 * them per document, so this is the DEFAULT wording and never the record of
 * what was agreed.
 */
function ServiceProse({ body }: { body: ServiceRecord }) {
  return (
    <div className="prose-grid">
      <Prose heading="What the firm will do" text={body.scope} />
      <Prose
        heading="What the client must do"
        text={body.clientObligations}
      />
      <Prose
        heading="What the price assumes"
        text={body.volumeLimits}
      />
      <Prose heading="What is not included" text={body.exclusions} />
    </div>
  );
}

/**
 * The reporting axes, side by side and deliberately NOT nested.
 *
 * `module` is what the firm's own dashboard splits revenue by; `group` is who
 * delivers. FINCOMPLIANCE delivers under both FRC and TRC, so rendering group as
 * a child of module would make that service unfileable and force a duplicate
 * catalogue row per Dept — a second row somebody has to keep in step, and a
 * revenue figure counted twice.
 */
function Axes({ rows }: { rows: ServiceRow[] }) {
  return (
    <Card>
      <Meta>
        <MetaItem label="By Dept">
          <AxisChips counts={countBy(rows, (b) => b.module)} />
        </MetaItem>
        <MetaItem label="By delivery team">
          <AxisChips counts={countBy(rows, (b) => b.group)} />
        </MetaItem>
      </Meta>
      <p className="text-sm text-muted">
        Dept and delivery team are set separately on each service, because one team can do
        work for more than one Dept.
      </p>
    </Card>
  );
}

function AxisChips({ counts }: { counts: AxisCount[] }) {
  if (counts.length === 0) return <NotStated>none set</NotStated>;
  return (
    <span className="cluster">
      {counts.map((c) => (
        <Pill key={c.label ?? ""} tone={c.label === null ? "neutral" : "code"}>
          {c.label ?? "not set"} · {c.count}
        </Pill>
      ))}
    </span>
  );
}

// ── One clause ───────────────────────────────────────────────────────────────

function ClauseCard({ entry }: { entry: ConfigEntry }) {
  const body = readClauseRecord(entry.published?.body);
  return (
    <article
      className="stack"
      style={{
        borderTop: "1px solid var(--line)",
        paddingTop: "var(--s-4)",
        marginTop: "var(--s-4)",
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CardTitle>{body.title === "" ? entry.entry.key : body.title}</CardTitle>
        <span className="mono text-muted">{entry.entry.key}</span>
        <span className="ml-auto">
          {entry.published === null ? (
            <Pill tone="danger">draft, not yet in force</Pill>
          ) : (
            <Pill tone="ok">in force · v{entry.published.version}</Pill>
          )}
        </span>
      </div>
      {entry.published === null ? (
        // The list carries the PUBLISHED version and nothing else, so a clause
        // that has only ever been a draft has no body here. Saying that is the
        // honest render; a record of "not stated" everywhere would read as a
        // clause that names no law, which is a different and much worse claim.
        <p className="text-md text-muted">
          Not published yet, so it cannot be used on a letter.
        </p>
      ) : (
        <>
          <Meta>
            <MetaItem label="Can be used in">
              {/* Where it may be USED. Not the same fact as what it SAYS — the
                  two below are that, and the gap between them is how a US
                  entity's letter went out naming Indian law. */}
              {body.jurisdictions.length === 0 ? (
                <span className="text-sm text-muted">everywhere</span>
              ) : (
                <span className="mono">{body.jurisdictions.join(", ")}</span>
              )}
            </MetaItem>
            <MetaItem label="Governing law">
              <Term term={body.governingLaw} absent="not stated in this clause" />
            </MetaItem>
            <MetaItem label="Courts">
              <Term term={body.courts} absent="not stated in this clause" />
            </MetaItem>
          </Meta>
          <Prose
            heading="The clause"
            text={body.text === "" ? null : body.text}
          />
        </>
      )}
    </article>
  );
}

/**
 * A jurisdictional term, BOTH halves.
 *
 * The code is what a mismatch check compares; the words are what the letter
 * prints, and neither does the other's job — "the laws of the State of Delaware"
 * does not follow from "US", because US law is state law. Showing only the code
 * would hide what the document actually says; showing only the words would hide
 * the half that is machine-checkable. So: both, always.
 */
function Term({ term, absent }: { term: JurisdictionalTerm | null; absent: string }) {
  // Null is the ordinary case, not an omission — confidentiality and fee clauses
  // name no law at all.
  if (term === null) return <NotStated>{absent}</NotStated>;
  return (
    <span>
      <Pill tone="code">{term.jurisdiction}</Pill>{" "}
      {term.text}
    </span>
  );
}

// ── The form ─────────────────────────────────────────────────────────────────

/**
 * Every field a service body has, on both the DEFINE form and the NEW VERSION
 * form, because a field a screen cannot set is a field a firm cannot use.
 *
 * `id` prefixes every control, because this page renders one of these per
 * service plus one to define with, and a duplicated `id` breaks every label on
 * the page after the first.
 */
function ServiceFields({
  id,
  groupLabel,
  defaults,
  axes,
  workflows,
}: {
  id: string;
  /** Which service these fields belong to. Every service on this page renders
   *  the SAME eighteen labels, so "Name, edit" appeared six times over with
   *  nothing telling them apart — measured: 110 controls, 20 distinct names.
   *  Named by the service's HANDLE, which never moves, and not by its title,
   *  which is editable in the box above. */
  groupLabel: string;
  defaults: ServiceRecord | null;
  axes: readonly ServiceAxis[];
  workflows: readonly ConfigEntry[];
}) {
  return (
    /* No legend: the card already carries the service's name where anybody who
       can see it will read it. This names the group for everybody else. */
    <fieldset className="fieldset" aria-label={groupLabel}>
      <FieldRow>
        <Field id={`${id}-name`} label="Name">
          <Input name="name" defaultValue={defaults?.name ?? ""} required />
        </Field>
        <Field
          id={`${id}-ref`}
          label="Service code"
          hint={<>The firm&apos;s own code. Printed on proposals.</>}
        >
          <Input name="ref" placeholder="A1" maxLength={32} defaultValue={defaults?.ref ?? ""} />
        </Field>
        <Field
          id={`${id}-billingBasis`}
          label="Charged"
          hint="What the price is for: a fixed fee, an hourly rate, a retainer or a charge per unit."
        >
          <Select name="billingBasis" defaultValue={defaults?.billingBasis ?? "fixed"}>
            {BILLING_BASES.map((b) => (
              <option key={b} value={b}>
                {b.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <div>
          <AxisPicker
            id={id}
            field="module"
            label="Dept"
            rows={axes.filter((a) => a.axis === "dept")}
            current={defaults?.module ?? null}
            placeholder="FRC"
            hint="Which Dept's revenue this service counts towards."
          />
        </div>
        <div>
          <AxisPicker
            id={id}
            field="group"
            label="Delivery team"
            rows={axes.filter((a) => a.axis === "team")}
            current={defaults?.group ?? null}
            placeholder="FINCOMPLIANCE"
            hint="The team that does the work. One team can serve several Depts."
          />
        </div>
      </FieldRow>

      <FieldRow>
        {/* A PICKER of the firm's published processes, and only published ones:
            a draft is not in force, and offering it would point a service at
            something no job will ever follow. Free text was never an option
            here — the key resolves against config.entry and a typo would leave
            every job for this service waiting forever. */}
        <Field
          id={`${id}-workflowTemplateKey`}
          label="How it is delivered"
          hint={
            <>
              The process every job for this service follows.{" "}
              <Link href="/admin/workflows">Write one</Link> if it is not here yet. If you leave
              this blank, jobs for this service are still created, but they wait until a
              process is chosen.
            </>
          }
        >
          <Select
            name="workflowTemplateKey"
            defaultValue={defaults?.workflowTemplateKey ?? ""}
          >
            <option value="">no process yet (jobs will wait)</option>
            {workflows
              .filter((w) => w.published !== null)
              .map((w) => (
                <option key={w.entry.key} value={w.entry.key}>
                  {typeof w.published?.body["label"] === "string"
                    ? String(w.published.body["label"])
                    : w.entry.key}
                </option>
              ))}
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field
          id={`${id}-recurrence`}
          label="Recurs"
          hint="How often the work comes round, for example monthly. This is separate from how it is billed."
        >
          <Select name="recurrence" defaultValue={defaults?.recurrence ?? ""}>
            <option value="">not stated</option>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id={`${id}-slaDays`}
          label="Turnaround, days"
          hint="For a one-time service, days from signing. For a monthly, quarterly or annual service, days after each period ends: 10 means by the 10th of the following month. Leave blank if there is no fixed turnaround. 0 means due on the day itself."
        >
          <Input
            name="slaDays"
            type="number"
            min={0}
            max={3650}
            step={1}
            placeholder="30"
            defaultValue={defaults?.slaDays ?? ""}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field id={`${id}-amount`} label="List price">
          <Input name="amount" placeholder="25000.00" defaultValue={defaults?.listPrice?.amount ?? ""} />
        </Field>
        <Field id={`${id}-currency`} label="Currency">
          <Input name="currency" maxLength={3} defaultValue={defaults?.listPrice?.currency ?? "INR"} />
        </Field>
        <Field
          id={`${id}-pricingNote`}
          label="Pricing note"
          hint={
            <>
              Explain the price when there is no list price, or add to one, for example &quot;plus
              statutory fees at actuals&quot;.
            </>
          }
        >
          <Input
            name="pricingNote"
            placeholder="As mutually agreed"
            defaultValue={defaults?.pricingNote ?? ""}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field id={`${id}-category`} label="Category">
          <Input name="category" defaultValue={defaults?.category ?? ""} />
        </Field>
        <Field
          id={`${id}-jurisdictions`}
          label="Offered in"
          hint="Two-letter country codes separated by commas. Leave blank if offered everywhere."
        >
          <Input
            name="jurisdictions"
            placeholder="IN, AE"
            defaultValue={defaults?.jurisdictions.join(", ") ?? ""}
          />
        </Field>
        <Field id={`${id}-description`} label="Description">
          <Input name="description" defaultValue={defaults?.description ?? ""} />
        </Field>
      </FieldRow>

      <div className="prose-grid">
        {SCOPE_BLOCKS.map((block) => (
          <Field
            key={block.field}
            id={`${id}-${block.field}`}
            label={block.heading}
          >
            <Textarea
              name={block.field}
              rows={3}
              placeholder={block.placeholder}
              defaultValue={defaults?.[block.field] ?? ""}
            />
          </Field>
        ))}
      </div>
      <p className="max-w-[var(--measure)] text-sm text-muted">
        Write these in your firm&apos;s own words, for example &quot;under 1,000 entries; under 8
        bank accounts&quot;. Nothing is counted automatically. If a client goes past a limit,
        the firm reviews the engagement.
      </p>
    </fieldset>
  );
}

/** The four blocks, in the order a letter reads them. One list, because they are
 *  written identically and they fail identically. */
const SCOPE_BLOCKS = [
  {
    field: "scope",
    heading: "What the firm will do",
    placeholder: "Monthly management accounts; board pack.",
  },
  {
    field: "clientObligations",
    heading: "What the client must do",
    placeholder: "Bank statements by the 5th.",
  },
  {
    field: "volumeLimits",
    heading: "What the price assumes",
    placeholder: "Under 1,000 entries per month.",
  },
  {
    field: "exclusions",
    heading: "What is not included",
    placeholder: "Statutory audit. Litigation support.",
  },
] as const satisfies readonly { field: ScopeBlockField; heading: string; placeholder: string }[];

type ScopeBlockField = "scope" | "clientObligations" | "volumeLimits" | "exclusions";

/**
 * A service body, from the form.
 *
 * ONLY FIELDS WITH A VALUE. The API refuses an unknown key outright and refuses
 * an EMPTY prose block by name — "use null for a block this service does not
 * state: an empty string prints on an engagement letter as a heading with
 * nothing under it" — so a blank input is sent as nothing at all. That also
 * makes clearing a field on a new version mean what it looks like: the new
 * version does not state it.
 *
 * `module`, `group` and `ref` go through VERBATIM. The API demands their
 * canonical form at the write rather than normalising at the read, deliberately:
 * a body is stored as written and `module` is grouped by in SQL. Quietly
 * upper-casing here would make this app the only place that rule is enforced,
 * and the person who typed "frc" would never learn it.
 */
/** A clause body off the form. A half-filled term — a country with no words,
 *  or words with no country — is SENT as it is, so the registry's own refusal
 *  ("never half a statement") reaches the screen rather than being tidied
 *  away here into a clause that silently names no law. */
function clauseBody(form: FormData): Record<string, unknown> {
  const codes = String(form.get("jurisdictions") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== "");
  const term = (prefix: string): { jurisdiction: string; text: string } | null => {
    const jurisdiction = String(form.get(`${prefix}Jurisdiction`) ?? "").trim().toUpperCase();
    const text = String(form.get(`${prefix}Text`) ?? "").trim();
    return jurisdiction === "" && text === "" ? null : { jurisdiction, text };
  };
  const governingLaw = term("law");
  const courts = term("courts");
  return {
    title: String(form.get("title") ?? "").trim(),
    text: String(form.get("text") ?? "").trim(),
    jurisdictions: codes,
    ...(governingLaw === null ? {} : { governingLaw }),
    ...(courts === null ? {} : { courts }),
  };
}

function serviceBody(form: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: String(form.get("name") ?? "").trim(),
    billingBasis: String(form.get("billingBasis") ?? ""),
  };

  put(body, "ref", verbatim(form, "ref"));
  put(body, "module", verbatim(form, "module"));
  put(body, "group", verbatim(form, "group"));
  put(body, "description", trimmed(form, "description"));
  put(body, "category", trimmed(form, "category"));
  put(body, "pricingNote", trimmed(form, "pricingNote"));
  put(body, "recurrence", verbatim(form, "recurrence"));
  put(body, "workflowTemplateKey", verbatim(form, "workflowTemplateKey"));
  for (const block of SCOPE_BLOCKS) put(body, block.field, trimmed(form, block.field));

  const jurisdictions = (trimmed(form, "jurisdictions") ?? "")
    .split(",")
    .map((j) => j.trim().toUpperCase())
    .filter((j) => j !== "");
  if (jurisdictions.length > 0) body["jurisdictions"] = jurisdictions;

  // A day count is a NUMBER here, unlike money — it counts days, and 30 is
  // exactly 30 in a float. Anything that is not a whole number goes through as
  // the string the user typed, so the API refuses it by name instead of this
  // app turning a typo into NaN and then into "no SLA stated".
  const sla = trimmed(form, "slaDays");
  if (sla !== null) body["slaDays"] = /^\d+$/.test(sla) ? Number(sla) : sla;

  // A list price is optional — an hourly or retainer service often has none
  // until an engagement is scoped — and null means "we quote it", never zero.
  // Half a price is refused, so the currency travels with the amount.
  const amount = trimmed(form, "amount");
  if (amount !== null) {
    body["listPrice"] = {
      amount,
      currency: (trimmed(form, "currency") ?? "").toUpperCase(),
    };
  }
  return body;
}

function put(body: Record<string, unknown>, field: string, value: string | null): void {
  if (value !== null) body[field] = value;
}

/** What the user typed, untouched — for the fields whose exact form the API
 *  judges. Empty is absent. */
function verbatim(form: FormData, field: string): string | null {
  const value = String(form.get(field) ?? "");
  return value === "" ? null : value;
}

/** Trimmed, for the fields where surrounding whitespace is only ever a typo — a
 *  textarea's trailing newline included. Empty after trimming is absent. */
function trimmed(form: FormData, field: string): string | null {
  const value = String(form.get(field) ?? "").trim();
  return value === "" ? null : value;
}

// ── Reading the registry back ────────────────────────────────────────────────

/** One version row. Derived from the generated schema through `ConfigEntry`
 *  rather than retyped — the history endpoint returns the same component. */
type ConfigVersion = NonNullable<ConfigEntry["published"]>;

interface ServiceRow {
  /** The catalogue ENTRY's id: what a compliance filing is linked to (T6.16).
   *  The entry, not a version, because a link is not part of a frozen body. */
  readonly id: string;
  readonly key: string;
  readonly published: ConfigVersion | null;
  readonly draft: ConfigVersion | null;
  /** The body the record shows: what is in force, or the draft when nothing is. */
  readonly body: ServiceRecord;
  /** Whether this entry's versions have been read yet. It separates "this
   *  service states no scope" from "this screen has not read it", which are the
   *  same empty record and very different facts. */
}

/**
 * One row of the list, read straight from the list.
 *
 * This used to fetch every service again, one request each, because
 * `GET /config/{kind}` returned only what was IN FORCE — so a pending draft was
 * invisible, and once a service had a published version there was nowhere to
 * publish its revision from. The list now carries `pendingDraft`, so the per-row
 * lookup this app's own rules warn about is gone, and with it the interval where
 * the screen showed "Reading its draft…".
 */
function serviceRow(entry: ConfigEntry): ServiceRow {
  const published = entry.published;
  const draft = entry.pendingDraft;
  const source = published ?? draft;
  return {
    id: entry.entry.id,
    key: entry.entry.key,
    published,
    draft,
    body: readServiceRecord(source?.body),
  };
}

interface AxisCount {
  readonly label: string | null;
  readonly count: number;
}

/** How many services sit on each value of one axis, with the unfiled ones
 *  counted as their own bucket rather than dropped. */
function countBy(rows: ServiceRow[], pick: (b: ServiceRecord) => string | null): AxisCount[] {
  const counts = new Map<string, number>();
  let unfiled = 0;
  for (const row of rows) {
    const value = pick(row.body);
    if (value === null) {
      unfiled += 1;
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const filed: AxisCount[] = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
  return unfiled > 0 ? [...filed, { label: null, count: unfiled }] : filed;
}

/** The list, grouped by the axis the firm reports revenue by. Services filed
 *  under no Dept go last and are never dropped: that bucket needs a home. */
function byModule(rows: ServiceRow[]): { module: string | null; rows: ServiceRow[] }[] {
  const buckets = new Map<string, ServiceRow[]>();
  const unfiled: ServiceRow[] = [];
  for (const row of rows) {
    const dept = row.body.module;
    if (dept === null) {
      unfiled.push(row);
      continue;
    }
    const bucket = buckets.get(dept);
    if (bucket === undefined) buckets.set(dept, [row]);
    else bucket.push(row);
  }
  const groups = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([module, list]) => ({ module: module as string | null, rows: list }));
  return unfiled.length > 0 ? [...groups, { module: null, rows: unfiled }] : groups;
}

const BILLING_BASES = ["fixed", "hourly", "retainer", "per_unit"] as const;
const RECURRENCES = ["one_time", "monthly", "quarterly", "annually", "custom"] as const;

/**
 * A service body as this screen reads it — every one of the sixteen fields.
 *
 * WHY IT IS READ BY HAND AND WHY THAT IS THE ONE PLACE THIS APP HAS NO COMPILE
 * CHECK. The registry stores a body as free-form JSON, because each kind has its
 * own shape and they grow as their consumers land, so the OpenAPI document types
 * it as `{ [key: string]: unknown }`. None of these field names exists in
 * `schema.d.ts`, and `npm run typecheck` therefore cannot catch a misspelt one.
 * The API is the check instead: it refuses an unknown key outright rather than
 * storing it, and this screen shows that refusal verbatim.
 *
 * Every field but the name falls back to null rather than to a value — mirroring
 * the backend's own reader — because null is a REAL answer here: "the firm has
 * not stated this". `slaDays: null` is not zero and `recurrence: null` is not
 * one_time, and a screen that rendered either as a default would be inventing a
 * commitment out of silence.
 *
 * `client.ts` has a `readServiceBody` that reads the name and the price, which
 * is all the proposal and letter screens need. This is the full record, and it
 * lives beside the only screen that shows one.
 */
interface ServiceRecord {
  readonly name: string;
  readonly ref: string | null;
  readonly description: string | null;
  readonly category: string | null;
  readonly module: string | null;
  readonly group: string | null;
  readonly jurisdictions: readonly string[];
  readonly billingBasis: string | null;
  readonly recurrence: string | null;
  readonly slaDays: number | null;
  readonly listPrice: { readonly amount: string; readonly currency: string } | null;
  readonly pricingNote: string | null;
  readonly scope: string | null;
  readonly clientObligations: string | null;
  readonly volumeLimits: string | null;
  readonly exclusions: string | null;
  /** The process that says HOW this service is delivered (T2.7). A key, not a
   *  version: the catalogue points at the firm's CURRENT process and the job is
   *  what pins the version it started on. */
  readonly workflowTemplateKey: string | null;
}

function readServiceRecord(body: Record<string, unknown> | undefined): ServiceRecord {
  const jurisdictions = body?.["jurisdictions"];
  const slaDays = body?.["slaDays"];
  return {
    name: readText(body?.["name"]) ?? "",
    ref: readText(body?.["ref"]),
    description: readText(body?.["description"]),
    category: readText(body?.["category"]),
    module: readText(body?.["module"]),
    group: readText(body?.["group"]),
    jurisdictions: Array.isArray(jurisdictions)
      ? jurisdictions.filter((j): j is string => typeof j === "string")
      : [],
    billingBasis: readOneOf(body?.["billingBasis"], BILLING_BASES),
    recurrence: readOneOf(body?.["recurrence"], RECURRENCES),
    slaDays:
      typeof slaDays === "number" && Number.isInteger(slaDays) && slaDays >= 0 ? slaDays : null,
    listPrice: readListPrice(body?.["listPrice"]),
    pricingNote: readText(body?.["pricingNote"]),
    scope: readText(body?.["scope"]),
    clientObligations: readText(body?.["clientObligations"]),
    volumeLimits: readText(body?.["volumeLimits"]),
    exclusions: readText(body?.["exclusions"]),
    workflowTemplateKey: readText(body?.["workflowTemplateKey"]),
  };
}

interface JurisdictionalTerm {
  readonly jurisdiction: string;
  readonly text: string;
}

interface ClauseRecord {
  readonly title: string;
  readonly text: string;
  readonly jurisdictions: readonly string[];
  readonly governingLaw: JurisdictionalTerm | null;
  readonly courts: JurisdictionalTerm | null;
}

function readClauseRecord(body: Record<string, unknown> | undefined): ClauseRecord {
  const jurisdictions = body?.["jurisdictions"];
  return {
    title: readText(body?.["title"]) ?? "",
    text: readText(body?.["text"]) ?? "",
    jurisdictions: Array.isArray(jurisdictions)
      ? jurisdictions.filter((j): j is string => typeof j === "string")
      : [],
    governingLaw: readTerm(body?.["governingLaw"]),
    courts: readTerm(body?.["courts"]),
  };
}

/**
 * A jurisdictional term out of a stored body. Absent, malformed and HALF-STATED
 * all read as null, because neither half is a statement on its own: a code
 * nobody can print, or a sentence nobody can compare.
 *
 * The code is normalised for display, like a currency and unlike the words — it
 * is the comparable half, and "us" and "US" are the same country beyond any
 * doubt. The words are shown exactly as the firm wrote them: they go on a signed
 * document, and this is not the place to re-render that.
 */
function readTerm(raw: unknown): JurisdictionalTerm | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const term = raw as Record<string, unknown>;
  const jurisdiction = readText(term["jurisdiction"]);
  const text = readText(term["text"]);
  if (jurisdiction === null || text === null) return null;
  const code = jurisdiction.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? { jurisdiction: code, text } : null;
}

function readListPrice(raw: unknown): { amount: string; currency: string } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const price = raw as Record<string, unknown>;
  const amount = price["amount"];
  const currency = price["currency"];
  return typeof amount === "string" && typeof currency === "string"
    ? { amount, currency: currency.toUpperCase() }
    : null;
}

/** A stored string, or null when there is nothing to print. Blank collapses to
 *  null on purpose: absent and "" are the same fact to every reader here, and
 *  keeping them as two states means every caller writes the same test and one
 *  of them eventually forgets. */
function readText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** A stored value narrowed to one of a closed set, or null. A value outside the
 *  set is not rendered as itself: these sets are branched on downstream, so a
 *  hand-edited body naming something else has said nothing this app can read. */
function readOneOf(v: unknown, allowed: readonly string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null;
}

/** Whole days from signing of the engagement letter, or the fact that nobody
 *  committed to any. Null is NOT zero: zero is a commitment to the day of
 *  signing, and "0 days" where nobody committed would be a lie on a screen. */
function slaSentence(days: number | null, recurrence: string | null): ReactNode {
  if (days === null) return <NotStated>no turnaround stated</NotStated>;
  // A recurring service counts from the end of each period (T6.13): "by the
  // 10th of the following month" is exactly ten days after a month ends.
  const recurring = recurrence === "monthly" || recurrence === "quarterly" || recurrence === "annually";
  if (days === 0) return recurring ? "Due the day each period ends" : "Due on the day the letter is signed";
  const unit = days === 1 ? "day" : "days";
  return recurring ? `${days} ${unit} after each period ends` : `${days} ${unit} from signing`;
}

// ── Failures ─────────────────────────────────────────────────────────────────

/** What adding a service did, filings included: the sentence, the service to
 *  go to, and each filing the API refused after the service went in. */
interface Defined {
  readonly key: string;
  readonly sentence: string;
  readonly failed: readonly { readonly name: string; readonly message: string }[];
}

/** "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/**
 * After "Add as a draft". A NEW service has no client yet, so nothing reaches
 * the calendar, and the sentence says so: "3 filings added" with an unchanged
 * calendar reads as a press that half worked.
 */
function definedSentence(name: string, added: readonly string[], confirmed: readonly string[]): string {
  if (added.length === 0) {
    return `${name} is added as a draft. It carries no compliance filings yet; add them on its card.`;
  }
  const filings = `${String(added.length)} compliance ${added.length === 1 ? "filing" : "filings"}`;
  const sure =
    confirmed.length === 0
      ? ""
      : ` The dates of ${listed(confirmed)} are confirmed now.`;
  return (
    `${name} is added as a draft with ${filings}: ${listed(added)}.${sure}` +
    " No client is on it yet, so nothing goes on the calendar until one signs for it."
  );
}

interface Failure {
  readonly at: string;
  readonly message: string;
  readonly reason: string | null;
}

function failureOf(at: string, error: unknown): Failure {
  const envelope = apiError(error);
  return { at, message: envelope.message, reason: envelope.reason ?? null };
}

/**
 * What the API said, where it was said.
 *
 * Rendered next to the form that caused it rather than only at the top of the
 * page: this screen has one form per service plus one to define with, and an
 * error that appears three screens above the button somebody pressed is an error
 * nobody reads. The message is the API's own — several of these are the only
 * place a firm learns a rule, and none of them is improved by a local rewrite.
 */
function FailureNote({ failure }: { failure: Failure }) {
  return (
    <Notice tone="danger">
      <p>
        {failure.message}
        {failure.reason !== null && (
          <>
            {" "}
            <span className="mono">({failure.reason})</span>
          </>
        )}
      </p>
    </Notice>
  );
}

/**
 * One of the two axis fields — a picker when the firm has written that list, a
 * free text box when it has not.
 *
 * BOTH halves are the API's own rule rendered honestly, not a convenience:
 *
 *   A firm with no Depts is checked against nothing, and its `module` field
 *   behaves exactly as it did before the lists existed. Rendering a disabled,
 *   empty dropdown there would say "you cannot file this service" when the truth
 *   is "you can file it anywhere until you decide what your Depts are".
 *
 *   Once the list exists it is CLOSED, so a text box would be an invitation to
 *   type something the API will refuse.
 *
 * The awkward case is a service already naming a code that is retired, or one
 * typed before the list was written. It is offered as a disabled-looking option
 * marked as such rather than dropped: silently blanking a field on a form whose
 * submit rewrites the whole body is how a Dept disappears from a service nobody
 * meant to refile. The firm sees what it says and chooses.
 */
function AxisPicker({
  id,
  field,
  label,
  rows,
  current,
  placeholder,
  hint,
}: {
  id: string;
  field: "module" | "group";
  label: string;
  rows: readonly ServiceAxis[];
  current: string | null;
  placeholder: string;
  hint: string;
}) {
  const known = rows.some((r) => r.code === current);
  const stale = current !== null && current !== "" && !known;

  if (rows.length === 0) {
    return (
      <Field
        id={`${id}-${field}`}
        label={label}
        hint={
          <>
            {hint} Your firm has not set up its list yet, so type a code in capital letters. Once
            the list exists on <Link href="/admin/structure">firm structure</Link>, this becomes
            a drop-down.
          </>
        }
      >
        {/* Sent VERBATIM. The API demands the canonical form at the WRITE rather
            than normalising at the read — a body is stored as written, and this
            axis is GROUPED BY in SQL — so upper-casing it here would hide a rule
            the firm needs to know about behind a silent fix. */}
        <Input name={field} placeholder={placeholder} defaultValue={current ?? ""} />
      </Field>
    );
  }

  return (
    <Field
      id={`${id}-${field}`}
      label={label}
      hint={
        <>
          {hint}
          {stale && " This service uses a code that is no longer on the list. Pick one from the list before saving."}
        </>
      }
    >
      {/* `width: 100%` was on this select inline; `.select` already is. */}
      <Select name={field} defaultValue={current ?? ""}>
        <option value="">not stated</option>
        {rows.map((r) => (
          <option key={r.id} value={r.code}>
            {r.name === r.code ? r.code : `${r.code}: ${r.name}`}
            {r.isActive ? "" : " (retired)"}
          </option>
        ))}
        {stale && (
          <option value={current}>{current} (no longer on this firm&apos;s list)</option>
        )}
      </Select>
    </Field>
  );
}
