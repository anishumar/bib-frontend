"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { ServiceAxis } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import {
  Button,
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
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [catalogue, library, policy, me, structure, processes] = await Promise.all([
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

  function noteFor(at: string): ReactNode {
    return failure !== null && failure.at === at ? <FailureNote failure={failure} /> : null;
  }

  function define(form: FormData): void {
    void act("define", () =>
      api.POST("/api/v1/config/{kind}", {
        params: { path: { kind: "service" } },
        body: { key: String(form.get("key")).trim(), body: serviceBody(form) },
      }),
    );
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
        lede="The firm&apos;s own record of what it sells. A published version is frozen — every
        proposal and letter quoted from it resolves that exact version forever — so a change
        is a new version, never an edit."
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
                <NotStated>filed under no Dept</NotStated>
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
              />
            ))}
          </section>
        ))
      )}

      {canWrite && (
        <Card>
          <CardTitle level={2}>Add a service</CardTitle>
          <p className="text-md text-muted">
            Everything but the name, the handle and how it is charged is optional, and blank
            means the firm has not stated it — which is a real answer the record will show as
            such. Nothing blank is sent.
          </p>
          <form
            action={(form) => {
              define(form);
            }}
          >
            <FieldRow>
              {/* The key is a HANDLE, not a title, and not the firm's service
                  code either: pins are written against it, so it never moves.
                  Lower case by rule — the code that prints on a proposal is
                  `ref` below. */}
              <Field
                label="Handle"
                hint="Lower case, url-safe, permanent. Every issued document resolves through it."
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
            {noteFor("define")}
            <div className="cluster">
              <Button type="submit" disabled={busy !== null}>
                Add as a draft
              </Button>
            </div>
            <p className="text-sm text-muted">
              Defining does not put it in force. Publish it, and from then on the version it
              was quoted at is frozen — which is what lets a proposal reopened next year still
              show the price it was sent at.
            </p>
          </form>
        </Card>
      )}

      <Card>
        <CardTitle level={2}>Standard terms</CardTitle>
        <p className="text-md text-muted">
          The clause library an engagement letter is assembled from. Each clause carries where
          it may be USED (its jurisdictions) and, separately, what it SAYS — whose law governs
          and which courts hear a dispute. Those are not the same fact: a clause applicable in
          India and naming Indian law is entirely correct until it goes out on a letter issued
          by the firm&apos;s US entity.
        </p>
        {clauses.length === 0 ? (
          <p className="text-sm text-muted">No clauses defined yet.</p>
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
              Put in force the moment it is saved. A letter pins the version it was drafted from,
              so editing the wording later is a new clause or a new version — never a change to a
              letter already out.
            </p>
            <FieldRow>
              <Field label="Handle" hint="Lower case, permanent. A letter pins it by this.">
                <Input name="key" placeholder="governing-law-in" required />
              </Field>
              <Field label="Title">
                <Input name="title" placeholder="Governing law and jurisdiction" required />
              </Field>
            </FieldRow>
            <Field label="The clause, as it prints">
              <Textarea name="text" rows={4} required />
            </Field>
            <FieldRow>
              <Field
                label="Usable in"
                optional
                hint="Country codes, comma-separated. Blank means everywhere."
              >
                <Input name="jurisdictions" placeholder="IN, AE" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Governing law — country" optional hint="Only on the clause that names whose law governs.">
                <Input name="lawJurisdiction" maxLength={2} placeholder="IN" style={{ textTransform: "uppercase" }} />
              </Field>
              <Field label="Governing law — the words" optional>
                <Input name="lawText" placeholder="the laws of the Republic of India" />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Courts — country" optional>
                <Input name="courtsJurisdiction" maxLength={2} placeholder="IN" style={{ textTransform: "uppercase" }} />
              </Field>
              <Field label="Courts — the words" optional>
                <Input name="courtsText" placeholder="the courts at New Delhi" />
              </Field>
            </FieldRow>
            {noteFor("clause")}
            <div className="cluster">
              <Button type="submit" disabled={busy !== null}>
                Write it and put it in force
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card>
        <CardTitle level={2}>Discount limit</CardTitle>
        <p className="text-md text-muted">
          {discountLimit === null || discountLimit === ""
            ? "None published — so ANY discount needs sign-off from somebody holding proposal:approve. A firm that has never set a limit has not decided that anything goes."
            : `${discountLimit}% off without sign-off. Past it, a proposal cannot be sent until somebody holding proposal:approve has approved it.`}
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
                A new version is a draft until it is published — the limit in force does not
                move until then.
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
}: {
  row: ServiceRow;
  canWrite: boolean;
  busy: string | null;
  note: (at: string) => ReactNode;
  onPublish: (key: string, version: number) => void;
  onNewVersion: (key: string, form: FormData) => void;
  axes: readonly ServiceAxis[];
  workflows: readonly ConfigEntry[];
}) {
  const { body, published, draft } = row;
  const draftBody = draft === null ? null : readServiceRecord(draft.body);
  return (
    <article className="card stack">
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
            <Pill tone="danger">draft only — never in force</Pill>
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
          Its versions could not be read, so what this service says is unknown here.
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
              ? `Draft v${draft.version} is what would go in force. Nothing is quoting this service until it is published.`
              : `A draft v${draft.version} is waiting. It changes nothing until it is published — v${published.version} above is what proposals still resolve.`}
          </p>
          {published !== null && draftBody !== null && (
            // Side by side, never merged: what is in force is above, and this is
            // what would replace it. Blurring the two is the one thing this
            // screen must not do.
            <details style={{ marginTop: "var(--s-2)" }}>
              <summary>What the pending draft v{draft.version} says</summary>
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
                  Publish v{draft.version} — put it in force
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
              A new version is a WHOLE new body, so this starts as a copy of what is in force.
              Clearing a field here means the new version does not state it — which is a
              change, not a blank.
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
    </article>
  );
}

/** The short facts: how it is filed, how it is sold, what it promises. */
function ServiceFacts({ body }: { body: ServiceRecord }) {
  return (
    <Meta>
      {/* Two axes, never a tree — see Axes below. */}
      <MetaItem label="Dept (module)">
        {body.module === null ? <NotStated>filed under no Dept</NotStated> : body.module}
      </MetaItem>
      <MetaItem label="Delivery team (group)">
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
          <NotStated>not stated — not the same as one-off</NotStated>
        ) : (
          body.recurrence.replace("_", " ")
        )}
      </MetaItem>
      <MetaItem label="Turnaround">{slaSentence(body.slaDays, body.recurrence)}</MetaItem>
      <MetaItem label="List price">
        {/* Null is "we quote it", never zero and never free. */}
        {body.listPrice === null ? (
          <NotStated>no list price — quoted per engagement</NotStated>
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
      <Prose heading="What the firm will do" field="scope" text={body.scope} />
      <Prose
        heading="What the client must do"
        field="clientObligations"
        text={body.clientObligations}
      />
      <Prose
        heading="What the price assumes"
        field="volumeLimits"
        text={body.volumeLimits}
      />
      <Prose heading="What is not included" field="exclusions" text={body.exclusions} />
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
        <MetaItem label="By Dept — what revenue is reported by">
          <AxisChips counts={countBy(rows, (b) => b.module)} />
        </MetaItem>
        <MetaItem label="By delivery team — who does the work">
          <AxisChips counts={countBy(rows, (b) => b.group)} />
        </MetaItem>
      </Meta>
      <p className="text-sm text-muted">
        Two independent dimensions, not a hierarchy: one delivery team works under more than
        one Dept, so a service has each of these separately.
      </p>
    </Card>
  );
}

function AxisChips({ counts }: { counts: AxisCount[] }) {
  if (counts.length === 0) return <NotStated>nothing filed</NotStated>;
  return (
    <span className="cluster">
      {counts.map((c) => (
        <Pill key={c.label ?? ""} tone={c.label === null ? "neutral" : "code"}>
          {c.label ?? "not filed"} · {c.count}
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
            <Pill tone="danger">draft only — never in force</Pill>
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
          Never published, so what it says is not on this list. No letter can pin it.
        </p>
      ) : (
        <>
          <Meta>
            <MetaItem label="Applicable in">
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
              <Term term={body.governingLaw} absent="this clause names no law" />
            </MetaItem>
            <MetaItem label="Courts">
              <Term term={body.courts} absent="this clause names no forum" />
            </MetaItem>
          </Meta>
          <Prose
            heading="The clause"
            field="text"
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
          hint="What the price is a price OF."
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
            label="Dept (module)"
            rows={axes.filter((a) => a.axis === "dept")}
            current={defaults?.module ?? null}
            placeholder="FRC"
            hint="The revenue axis. Independent of the delivery team, not above it."
          />
        </div>
        <div>
          <AxisPicker
            id={id}
            field="group"
            label="Delivery team (group)"
            rows={axes.filter((a) => a.axis === "team")}
            current={defaults?.group ?? null}
            placeholder="FINCOMPLIANCE"
            hint="Who does the work. One team commonly delivers under several Depts."
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
              <Link href="/admin/workflows">Write one</Link> if it is not here yet. Blank is a
              real answer — the work is created and waits, visibly, rather than running a
              process nobody wrote.
            </>
          }
        >
          <Select
            name="workflowTemplateKey"
            defaultValue={defaults?.workflowTemplateKey ?? ""}
          >
            <option value="">not stated — work for this service will wait</option>
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
          hint="How often the work comes round. Not how it is billed."
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
          hint="From signing for a one-time service; from the END of each period for a monthly, quarterly or annual one — 10 means by the 10th of the following month. Blank is NO turnaround. It is not 0 — 0 commits the firm to the day itself."
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
              Why there is no list price — and allowed beside one, for &quot;plus statutory
              fees at actuals&quot;.
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
          hint="ISO codes, comma separated. Blank means everywhere."
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
            label={
              <>
                {block.heading} <span className="mono">{block.field}</span>
              </>
            }
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
        The firm&apos;s own words, as the firm states them — &quot;under 1,000 entries; under 8
        bank accounts&quot;. Nothing is metered against them: past a ceiling the firm
        re-assesses the engagement.
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
  if (days === null) return <NotStated>no turnaround stated — not the same as none</NotStated>;
  // A recurring service counts from the end of each period (T6.13): "by the
  // 10th of the following month" is exactly ten days after a month ends.
  const recurring = recurrence === "monthly" || recurrence === "quarterly" || recurrence === "annually";
  if (days === 0) return recurring ? "Due the day each period ends" : "Due on the day the letter is signed";
  const unit = days === 1 ? "day" : "days";
  return recurring ? `${days} ${unit} after each period ends` : `${days} ${unit} from signing`;
}

// ── Failures ─────────────────────────────────────────────────────────────────

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
            {hint} This firm has not defined its list yet, so anything upper-case is accepted —
            define it on <Link href="/admin/structure">firm structure</Link> and this becomes a
            picker.
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
          {stale && " This service names a code that is not on the list; saving it as-is will be refused."}
        </>
      }
    >
      {/* `width: 100%` was on this select inline; `.select` already is. */}
      <Select name={field} defaultValue={current ?? ""}>
        <option value="">not stated</option>
        {rows.map((r) => (
          <option key={r.id} value={r.code}>
            {r.name === r.code ? r.code : `${r.code} — ${r.name}`}
            {r.isActive ? "" : " (retired)"}
          </option>
        ))}
        {stale && (
          <option value={current}>{current} — no longer on this firm&apos;s list</option>
        )}
      </Select>
    </Field>
  );
}
