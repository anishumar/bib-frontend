"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ServiceAxis, ServiceAxisKind, WorkSplitAxis, RequestRouting } from "@/lib/api/client";
import {
  Button,
  Field,
  Input,
  Radio,
  Select,
  Card,
  CardTitle,
  ErrorNotice,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";

/**
 * The firm's own delivery structure — its Depts, its delivery teams, and how it
 * cuts one client's work into separate jobs (G2.4).
 *
 * ── Why two lists and not one ───────────────────────────────────────────────
 *
 * A **Dept** answers "whose revenue is this" — the firm's dashboard splits
 * income by it and a client gets a SPOC per Dept. A **delivery team** answers
 * "who actually does the work". They CROSS: one team commonly delivers under
 * several Depts, which is why this screen shows them side by side rather than
 * as a tree. Nesting them would force a duplicate catalogue row per Dept and
 * count that service's revenue twice.
 *
 * ── Why the split axis is on this screen and not in the catalogue ───────────
 *
 * It is the one setting here that changes what the ENGINE does: it decides how
 * many jobs a signed engagement becomes. Putting it beside the lists it names is
 * the only place it can be understood, and the API refuses to select a list with
 * nothing on it precisely so that this screen cannot offer a setting that would
 * silently do nothing.
 *
 * ── What this screen does not offer ─────────────────────────────────────────
 *
 * There is no delete, and no way to edit a code. Retiring is not deleting: a
 * Dept that existed in 2026 is part of why a service was filed where it was
 * filed, so it stays readable forever and only stops being offered for anything
 * new. A code cannot move because every published service body names it and
 * those bodies are frozen — a firm that wants a different code adds a row and
 * retires the old one, which leaves the history intact.
 */
export default function StructurePage() {
  const router = useRouter();
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  const [split, setSplit] = useState<WorkSplitAxis>("none");
  // UTC until the firm chooses, which is what every firm had before 0071.
  const [zone, setZone] = useState<string>("UTC");
  const [routing, setRouting] = useState<RequestRouting>("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [structure, inbox] = await Promise.all([
      api.GET("/api/v1/tenancy/structure", {}),
      api.GET("/api/v1/client-requests", {}),
    ]);
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (structure.response.status === 401) {
      router.push("/login");
      return;
    }
    if (structure.error) {
      setError(apiError(structure.error).message);
      setLoaded(true);
      return;
    }
    setAxes(structure.data.axes);
    setSplit(structure.data.workSplitAxis);
    setZone(structure.data.timeZone);
    // The routing setting is read off the INBOX rather than from a settings
    // route of its own: `GET /client-requests` already carries it, because a
    // screen showing that list has to be able to say why nothing is assigned.
    // One source, and this page cannot disagree with the one that acts on it.
    if (!inbox.error) setRouting(inbox.data.routing);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every mutation funnels through here so one place owns the busy flag, the
   *  error message and the reload. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      // Verbatim. The API's refusal is the whole explanation — "that list has
      // nothing active on it, and every job would land in the same unfiled
      // group" — and a local "something went wrong" would throw away the only
      // sentence that says how to fix it.
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  function rename(axisId: string, name: string): void {
    void act(axisId, () =>
      api.PUT("/api/v1/tenancy/structure/axes/{axisId}", {
        params: { path: { axisId } },
        body: { name },
      }),
    );
  }

  function reorder(axisId: string, sortOrder: number): void {
    void act(axisId, () =>
      api.PUT("/api/v1/tenancy/structure/axes/{axisId}", {
        params: { path: { axisId } },
        body: { sortOrder },
      }),
    );
  }

  function setActive(axisId: string, isActive: boolean): void {
    void act(axisId, () =>
      api.PUT("/api/v1/tenancy/structure/axes/{axisId}/active", {
        params: { path: { axisId } },
        body: { isActive },
      }),
    );
  }

  function chooseSplit(workSplitAxis: WorkSplitAxis): void {
    void act("split", () =>
      api.PUT("/api/v1/tenancy/structure/work-split", { body: { workSplitAxis } }),
    );
  }

  function chooseZone(timeZone: string): void {
    void act("zone", () =>
      api.PUT("/api/v1/tenancy/structure/time-zone", { body: { timeZone } }),
    );
  }

  function chooseRouting(next: RequestRouting): void {
    void act("routing", () =>
      api.PUT("/api/v1/tenancy/client-request-routing", { body: { routing: next } }),
    );
  }

  if (!loaded) return <Loading />;

  const depts = axes.filter((a) => a.axis === "dept");
  const teams = axes.filter((a) => a.axis === "team");

  return (
    <Page>
      <PageHeader
        eyebrow="The firm"
        title="Firm structure"
        lede="Most firms have one of these layers, some have both, and plenty have neither. Fill in
        what your firm actually uses and leave the rest empty — nothing here is required."
      />
      <ErrorNotice error={error} />

      {/* T6.8's inbox, and its one setting. It sits on THIS screen because it
          is the same kind of fact as the split above it — how the firm is
          shaped, decided once and applied to everything that arrives after —
          and because a single field does not earn an admin screen of its own.
          That is the "control that looks live and is inert" trap read from the
          other end: a page for one switch is a page nobody finds. */}
      <RequestRoutingChooser
        chosen={routing}
        hasKeyManagers={true}
        busy={busy === "routing"}
        onChoose={chooseRouting}
      />

      <TimeZoneChooser chosen={zone} busy={busy === "zone"} onChoose={chooseZone} />

      <WorkSplitChooser
        chosen={split}
        deptCount={depts.filter((d) => d.isActive).length}
        teamCount={teams.filter((t) => t.isActive).length}
        busy={busy === "split"}
        onChoose={chooseSplit}
      />

      <AxisList
        axis="dept"
        title="Depts"
        blurb="The revenue axis — what the dashboard splits income by, and what a SPOC covers. FRC, TRC, RAA."
        rows={depts}
        busy={busy}
        onRename={rename}
        onReorder={reorder}
        onSetActive={setActive}
        onAdded={() => void load()}
        onError={setError}
      />

      <AxisList
        axis="team"
        title="Delivery teams"
        blurb="Who actually does the work. FINCOMPLIANCE, VCFO CONSOLE, PAYROLL. Independent of the Depts, never nested under them — one team commonly delivers under several."
        rows={teams}
        busy={busy}
        onRename={rename}
        onReorder={reorder}
        onSetActive={setActive}
        onAdded={() => void load()}
        onError={setError}
      />
    </Page>
  );
}

// ── How work is split ────────────────────────────────────────────────────────

/**
 * The one control here that changes what the engine does.
 *
 * An option whose list is empty is DISABLED rather than hidden, with the reason
 * beside it. Hiding it would leave somebody looking for a setting they were told
 * exists; offering it would produce the API's refusal, which is a worse way to
 * learn the same thing.
 */
/**
 * Which calendar this firm's months and days are cut on.
 *
 * A LABELLED select, not a bare one: T6.9's walk found an unlabelled full-width
 * picker on the request inbox and it read as decoration. The list is short and
 * curated rather than all 400-odd zones — a firm picks this once, and a
 * scrolling wall of them is harder to answer than five names.
 *
 * The firm's CURRENT value is always in the list even when it is not one of the
 * five, so opening this screen can never silently offer to change a setting
 * somebody made deliberately.
 */
const COMMON_ZONES: readonly { readonly value: string; readonly label: string }[] = [
  { value: "Asia/Kolkata", label: "India — Asia/Kolkata" },
  { value: "Asia/Dubai", label: "United Arab Emirates — Asia/Dubai" },
  { value: "Asia/Singapore", label: "Singapore — Asia/Singapore" },
  { value: "Europe/London", label: "United Kingdom — Europe/London" },
  { value: "America/New_York", label: "United States (Eastern) — America/New_York" },
  { value: "UTC", label: "UTC — no country's calendar" },
];

function TimeZoneChooser({
  chosen,
  busy,
  onChoose,
}: {
  chosen: string;
  busy: boolean;
  onChoose: (zone: string) => void;
}) {
  const options = COMMON_ZONES.some((z) => z.value === chosen)
    ? COMMON_ZONES
    : [...COMMON_ZONES, { value: chosen, label: chosen }];
  return (
    <Card>
      <CardTitle level={2}>Which calendar are your months counted on?</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        This decides which month a document falls into on a client&rsquo;s{" "}
        <strong>Month by month</strong> page, and which day the client chaser counts from. It
        does <strong>not</strong> change how any date is displayed — everybody always sees dates
        in their own local time.
      </p>
      {/* This was a <span className="field-label"> over a bare <select>, and
          NEITHER of those is a thing: `.field-label` is defined in no
          stylesheet in the repo — it was used here and nowhere else — and the
          select carried no `.select`, so it drew as a raw browser control
          among styled ones. Both are what `<Field>`/`<Select>` are for. */}
      <div style={{ maxWidth: "42ch" }}>
        <Field id="firm-timezone" label="The firm’s time zone">
          <Select
            value={chosen}
            disabled={busy}
            /* The consequence below is deliberately WIDER than this 42ch
               column, so it cannot be the field's `hint` without re-wrapping
               it to three lines. Pointed at by id instead. */
            aria-describedby="firm-timezone-hint"
            onChange={(e) => { onChoose(e.target.value); }}
          >
            {options.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="muted text-sm" id="firm-timezone-hint">
        Changing this re-cuts what a past month page <em>shows</em> at its edges, because that
        page is worked out when it is opened. Nothing stored moves.
      </p>
    </Card>
  );
}

function WorkSplitChooser({
  chosen,
  deptCount,
  teamCount,
  busy,
  onChoose,
}: {
  chosen: WorkSplitAxis;
  deptCount: number;
  teamCount: number;
  busy: boolean;
  onChoose: (axis: WorkSplitAxis) => void;
}) {
  const splitId = useId();
  const options: {
    value: WorkSplitAxis;
    label: string;
    hint: string;
    disabledBecause: string | null;
  }[] = [
    {
      value: "none",
      label: "Keep it all together",
      hint: "One client, one job, whatever they bought. What most firms want.",
      disabledBecause: null,
    },
    {
      value: "dept",
      label: "Split by Dept",
      hint: "A client buying work in two Depts gets two jobs — one per Dept.",
      disabledBecause: deptCount === 0 ? "no Depts defined yet" : null,
    },
    {
      value: "team",
      label: "Split by delivery team",
      hint: "A client's services are grouped by the team that delivers them.",
      disabledBecause: teamCount === 0 ? "no delivery teams defined yet" : null,
    },
  ];

  return (
    <Card>
      <CardTitle level={2}>When a client signs, how is the work split up?</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        A client signs one engagement letter for several services. This decides whether that
        becomes one job with everything in it, or several — one per group.
      </p>
      {/* The flex row, the gap, the 4px nudge on the radio and the dimming of
          a disabled option were all typed out here; `.check` does every one of
          them, and `.check input:disabled ~ *` does the dimming without the
          component having to work out whether it is disabled twice. */}
      {/* A RADIO GROUP WITH NO GROUP. The two sentences under these options —
          that changing this restates nothing, and that it is not in effect yet
          — describe the CHOICE, not any one option, and sat loose so that
          nothing announced them. A <fieldset> with no legend is what carries
          both: the name is the card's own question, the description is the two
          paragraphs, and each is read ONCE on entering the group rather than
          appended to every option and repeated on every arrow key. */}
      <fieldset
        className="fieldset"
        style={{ display: "grid", gap: "var(--s-2)" }}
        aria-label="When a client signs, how is the work split up?"
        aria-describedby={`${splitId}-restates ${splitId}-not-live`}
      >
        {options.map((o) => (
          <Radio
            key={o.value}
            name="work-split"
            value={o.value}
            label={<strong>{o.label}</strong>}
            note={
              o.disabledBecause === null ? o.hint : `${o.hint} — ${o.disabledBecause}.`
            }
            checked={chosen === o.value}
            disabled={busy || o.disabledBecause !== null}
            onChange={() => { onChoose(o.value); }}
          />
        ))}
      </fieldset>
      <p id={`${splitId}-restates`} className="muted text-sm">
        Changing this restates nothing. Work already under way keeps the shape it started
        with; the next engagement is split the new way.
      </p>
      {/* Said out loud rather than left for somebody to discover. The setting is
          stored and audited today; the orchestrator that reads it is T2.7. A
          control that looks live and is not is exactly the "feature that looks
          finished" this codebase has been caught by before — a registered event
          verb with no writer — so the screen says which half exists. */}
      <p id={`${splitId}-not-live`} className="muted text-sm">
        <strong>Not in effect yet.</strong> Your answer is saved and will be used the moment
        delivery scheduling goes live. Until then every signed engagement produces one job,
        whatever is chosen here.
      </p>
    </Card>
  );
}

// ── One list ─────────────────────────────────────────────────────────────────

function AxisList({
  axis,
  title,
  blurb,
  rows,
  busy,
  onRename,
  onReorder,
  onSetActive,
  onAdded,
  onError,
}: {
  axis: ServiceAxisKind;
  title: string;
  blurb: string;
  rows: ServiceAxis[];
  busy: string | null;
  onRename: (axisId: string, name: string) => void;
  onReorder: (axisId: string, sortOrder: number) => void;
  onSetActive: (axisId: string, isActive: boolean) => void;
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  return (
    <Card>
      <CardTitle level={2}>{title}</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        {blurb}
      </p>

      {rows.length === 0 ? (
        <p className="muted">
          None defined. While this list is empty a service&apos;s {title.toLowerCase()} field
          takes any code the firm types — the moment there is one row, the list is closed and
          only these codes are accepted.
        </p>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th style={{ width: 110 }}>Order</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-inactive={!r.isActive}>
                  <Td>
                    <CommittedText
                      key={`${r.id}:${r.name}`}
                      value={r.name}
                      /* Named by the CODE, not by the name: this is the field
                         that changes the name, so naming it after its own value
                         would rename the control every time somebody types. The
                         code is immutable and shown in the next cell. */
                      label={`Name of ${r.code}`}
                      disabled={busy === r.id}
                      onCommit={(name) => { onRename(r.id, name); }}
                    />
                  </Td>
                  {/* The code never changes — every published service body names
                      it and those bodies are frozen. Shown, not editable. */}
                  <Td className="mono muted">{r.code}</Td>
                  <Td>
                    <CommittedNumber
                      key={`${r.id}:${String(r.sortOrder)}`}
                      value={r.sortOrder}
                      label={`Order of ${r.code}`}
                      disabled={busy === r.id}
                      onCommit={(sortOrder) => { onReorder(r.id, sortOrder); }}
                    />
                  </Td>
                  <Td>
                    <Pill tone={r.isActive ? "ok" : "danger"}>
                      {r.isActive ? "in use" : "retired"}
                    </Pill>
                  </Td>
                  <Td align="right">
                    {/* By the CODE, which is permanent — the name in the box
                        beside it is not, and a button that renames itself on
                        every keystroke is not named. */}
                    <Button
                      size="sm"
                      variant={r.isActive ? "destructive-quiet" : "secondary"}
                      loading={busy === r.id}
                      aria-label={`${r.isActive ? "Retire" : "Bring back"} ${r.code}`}
                      onClick={() => { onSetActive(r.id, !r.isActive); }}
                    >
                      {r.isActive ? "Retire" : "Bring back"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <AddAxis axis={axis} onAdded={onAdded} onError={onError} />
    </Card>
  );
}

function AddAxis({
  axis,
  onAdded,
  onError,
}: {
  axis: ServiceAxisKind;
  onAdded: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function add(form: FormData): Promise<void> {
    setBusy(true);
    const result = await api.POST("/api/v1/tenancy/structure/axes", {
      body: {
        axis,
        // Sent VERBATIM, lower case and all. The API normalises it and answers
        // with what it stored — upper-casing here would hide the rule behind a
        // silent fix, and the rule is one the firm needs to know about.
        code: String(form.get("code")).trim(),
        name: String(form.get("name")).trim(),
        sortOrder: Number(form.get("sortOrder") ?? 0),
      },
    });
    setBusy(false);
    if (result.error) {
      onError(apiError(result.error).message);
      return;
    }
    onAdded();
  }

  return (
    <details style={{ marginTop: "var(--s-4)" }}>
      <summary>Add one</summary>
      <form
        style={{ marginTop: "var(--s-4)" }}
        action={(form) => {
          void add(form);
        }}
      >
        {/* `.field-row` is a GRID. The three `flex:` declarations that used to
            sit on these columns — 1 1 160px, 2 1 220px, 0 1 100px — were read
            by nothing: measured on the page, all three columns came out 362px
            wide, so the layout has never done what the code described. */}
        {/* NAMED, no legend. This one form renders TWICE on the page, once for
            Depts and once for delivery teams, so "Code, edit" and "Name, edit"
            each came up twice with nothing saying which axis they belonged to —
            and the two axes CROSS: filing a Dept as a delivery team is the exact
            confusion this screen exists to prevent. */}
        <fieldset
          className="fieldset"
          aria-label={axis === "dept" ? "Add a Dept" : "Add a delivery team"}
        >
        <div className="field-row">
          <Field
            id={`add-${axis}-code`}
            label="Code"
            hint="Permanent. Upper case, spaces allowed. Every service filed here names it."
          >
            <Input
              name="code"
              placeholder={axis === "dept" ? "FRC" : "FINCOMPLIANCE"}
              required
            />
          </Field>
          <Field
            id={`add-${axis}-name`}
            label="Name"
            hint="What people read. Changeable later."
          >
            <Input
              name="name"
              placeholder={axis === "dept" ? "Financial Reporting & Compliance" : "FinCompliance"}
              required
            />
          </Field>
          <Field id={`add-${axis}-order`} label="Order">
            <Input name="sortOrder" type="number" defaultValue={0} />
          </Field>
        </div>
        <div className="cluster" style={{ marginTop: "var(--s-4)" }}>
          <Button
            type="submit"
            disabled={busy}
            aria-label={axis === "dept" ? "Add a Dept" : "Add a delivery team"}
          >
            Add
          </Button>
        </div>
        </fieldset>
      </form>
    </details>
  );
}

// ── Two inputs that commit on blur or Enter, not per keystroke ───────────────
//
// Per-keystroke saving would write a row per letter into an append-only ledger,
// which is how a rename becomes twelve audit events nobody can read past. Both
// are seeded ONCE: the caller gives them a `key` derived from the committed
// value, so a successful write remounts them with the new text rather than
// syncing it back through an effect that would fight the user's typing.

function CommittedText({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  /** The control's accessible name. A cell in a table has no <label> above it,
   *  so without this it is announced as "edit text, Payroll" — the value read
   *  back with no statement of what it IS. Required, not optional: every one
   *  of these was unnamed, and an optional prop is how that happens again. */
  label: string;
  disabled: boolean;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  function commit(): void {
    const next = draft.trim();
    if (next === "" || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  }

  return (
    <Input
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

function CommittedNumber({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  /** See CommittedText. */
  label: string;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  function commit(): void {
    const next = Number(draft);
    if (!Number.isInteger(next) || next === value) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  }

  return (
    <Input
      type="number"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => { setDraft(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(String(value));
      }}
    />
  );
}

/**
 * How an arriving client request is routed (T6.8, migration 0070).
 *
 * TWO OPTIONS, AND A SPOC IS NOT ONE OF THEM — which the page says out loud,
 * because a partner reading a list that offers "the Key Manager" and not "the
 * SPOC" will assume the second is missing rather than impossible. A SPOC covers
 * a Dept or a delivery team; a client's request names no service, so there is
 * no axis to look one up by, and choosing an axis would be this product
 * deciding something the firm never said.
 *
 * `none` LEADS, because it is the default and because it is a real answer
 * rather than an unconfigured one — the same position `WorkSplitChooser` takes
 * about "keep it all together".
 */
function RequestRoutingChooser({
  chosen,
  busy,
  onChoose,
}: {
  chosen: RequestRouting;
  hasKeyManagers: boolean;
  busy: boolean;
  onChoose: (routing: RequestRouting) => void;
}) {
  const routingId = useId();
  const options: { value: RequestRouting; label: string; hint: string }[] = [
    {
      value: "none",
      label: "Leave them for anyone to pick up",
      hint: "Requests arrive on nobody's desk and whoever gets to one takes it. What the inbox does today.",
    },
    {
      value: "key_manager",
      label: "Send them to the client's Key Manager",
      hint: "A client with no Key Manager gets a request that waits under Unassigned, saying so — never one guessed onto somebody else's desk.",
    },
  ];

  return (
    <Card>
      <CardTitle level={2}>When a client asks you for something, whose is it?</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        Clients raise requests from their own portal — a document they cannot find, a copy of
        something, a correction. This decides whether one arrives on a named desk.
      </p>
      {/* Named and DESCRIBED as a group, for the reason the work-split card
          above is: the paragraph under these options is about the choice, not
          about any one of them. */}
      <fieldset
        className="fieldset stack tight"
        style={{ marginTop: "var(--s-3)" }}
        aria-label="When a client asks you for something, whose is it?"
        aria-describedby={`${routingId}-note`}
      >
        {options.map((o) => (
          /* Was a hand-rolled <label className="choice">, and `.choice` is
             defined in no stylesheet — used here and nowhere else. With no
             rule behind it the label stayed `display: inline` and the note,
             an inline <span>, ran straight into the end of the label:
             "Leave them for anyone to pick upRequests arrive on nobody's
             desk". Visible on the page for as long as it has existed. */
          <Radio
            key={o.value}
            name="client-request-routing"
            value={o.value}
            label={<strong>{o.label}</strong>}
            note={o.hint}
            checked={chosen === o.value}
            disabled={busy}
            onChange={() => {
              onChoose(o.value);
            }}
          />
        ))}
      </fieldset>
      <p id={`${routingId}-note`} className="field-hint" style={{ marginTop: "var(--s-3)" }}>
        There is no &ldquo;send it to the SPOC&rdquo; here, and that is deliberate: a SPOC
        covers a Dept or a delivery team, and a request names no service — so there would be
        nothing to pick one by. Changing this setting restates nothing: requests already on a
        desk keep their owner, and the next one is routed the new way.
      </p>
    </Card>
  );
}
