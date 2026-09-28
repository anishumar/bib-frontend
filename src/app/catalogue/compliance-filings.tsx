"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import Link from "next/link";
import type { Route } from "next";
import type {
  FilingLinkEffect,
  FilingUnlinkEffect,
  ObligationRule,
} from "@/lib/api/client";
import {
  Button,
  LinkButton,
  Notice,
  Pill,
  useAppearFocus,
  useSwapFocus,
  type PillTone,
} from "@/components/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/shadcn/command";
import {
  describeDraft,
  describeNextChange,
  describeToday,
  draftOf,
  MONTHS,
  RuleEditor,
  todayOf,
  type RuleDraft,
} from "../admin/obligation-rules/rule-editor";

/**
 * A service's compliance filings, on the service itself (T6.16).
 *
 * ── WHY THIS IS HERE AND NOT ON THE RULES SCREEN ────────────────────────────
 *
 * A compliance rule used to name AT MOST ONE service from the rule editor, and
 * naming none meant "every service". That blank is how 98 GST filings reached a
 * bookkeeping-only client on 2026-09-18, and "at most one" meant a filing two
 * services owe had to be written twice. The firm's own idea (2026-09-26) is the
 * shape this section has: when you build a service, you say what it files; a
 * service carries any number of filings; and a filing written once for one
 * service is in the list for the next, so it is never written again.
 *
 * Three decisions the section renders rather than makes:
 *
 *   A RULE ON NO SERVICE ADDS NOTHING. So this is the one place a filing
 *   reaches a client, and the list says so when it is empty.
 *
 *   ADDING AN UNCONFIRMED RULE CONFIRMS IT. The shipped India pack is
 *   unconfirmed, because its dates came from a document and not from the
 *   firm. Confirming is "somebody here checked this against the law", so the
 *   dates are shown in WORDS, inline, before the press that confirms them:
 *   no `window.confirm`, which is a box nobody reads.
 *
 *   REMOVING ONE WITHDRAWS WHAT NOBODY STARTED. Upcoming filings nobody has
 *   touched come off the calendar for this service's clients, unless another
 *   service the same client holds still includes the filing. Everything else
 *   stays and is COUNTED, and the sentence after the press says which half is
 *   which: a partial change reported as a whole one is how a deadline moves
 *   without anybody being told. The effect is stated before the press too.
 *
 * ── NOT VERSIONED, AND THAT IS NOT AN OVERSIGHT ─────────────────────────────
 *
 * Everything else on a service card is a published VERSION, frozen, and an
 * edit is a new one. A filing is not part of that body: the link hangs off the
 * service's identity (its catalogue entry), not off a version, so adding one
 * needs no new version and a draft-only service can carry filings already. A
 * proposal pins a version for its PRICE; nothing pins the filings, because
 * what the law asks of a client is not a term the firm agreed with them.
 *
 * ── ONE READ FOR THE WHOLE PAGE ─────────────────────────────────────────────
 *
 * `filings` is the firm's whole library, one row per chain, read once by the
 * page (`GET /obligation-filings`); this section finds its own by `usedIn`.
 * One request per service is the per-row lookup this app's rules warn about,
 * and the catalogue already removed one of those (see `serviceRow`).
 *
 * ── A REFUSAL IS DRAWN BESIDE THE PRESS THAT CAUSED IT ──────────────────────
 *
 * The section drew the API's refusal once, above the add controls. That is
 * below every filing in the list and above the whole new-filing form, about
 * 900px of it, so a refused "Write it and add it to this service" or a refused
 * "Remove it" on an early row showed off screen and the press looked as if it
 * did nothing (measured in review, 2026-09-26). So the section remembers WHICH
 * act was pressed and draws the refusal there: inside the removal's
 * confirmation, inside the adding confirmation, above the new filing's save
 * row, or by the add controls for a plain add. It also takes focus when it
 * appears (`Refusal`), which scrolls it into view: the page's own rule, stated
 * on `FailureNote`, that an error three screens above the button is an error
 * nobody reads.
 *
 * ── A TAB OF THE SERVICE'S OWN PAGE SINCE W4B (2026-09-28) ──────────────────
 *
 * It was the last block of every service card on one long `/catalogue`. It is
 * now the "Compliance filings" tab of `/catalogue/[serviceKey]`, with every
 * sentence, focus rule and confirmation as it was; what changed is where it
 * sits: no heading of its own (the tab names it), no paragraph explaining the
 * library above a non-empty list, dates in the sans face rather than mono,
 * and "Also used in" is a link to the other service's page (its filings tab)
 * rather than an in-page anchor to a card that no longer shares the page.
 */
export function ComplianceFilings({
  service,
  filings,
  unread,
  canWrite,
  canReadLibrary,
  busy,
  working,
  note,
  onAdd,
  onRemove,
  onWrite,
}: {
  service: { readonly id: string; readonly key: string; readonly name: string };
  /** Null when this session may not read the library at all, or when the
   *  first read of it failed (then `unread` says so). */
  filings: readonly ObligationRule[] | null;
  /** The latest read of the library FAILED (a throttle, a server error),
   *  which is not a question of permission. With a list from an earlier read
   *  the section still shows it, saying it may be out of date. */
  unread: boolean;
  canWrite: boolean;
  /** Whether this session may open `/admin/obligation-rules` (`party:read`),
   *  which decides whether each filing offers the way there. */
  canReadLibrary: boolean;
  /** Any write on the page is in flight: every control waits. */
  busy: boolean;
  /** THIS section's write is in flight: its button shows it. */
  working: boolean;
  /** The API's refusal, when it was this section's press that was refused. */
  note: ReactNode;
  onAdd: (rule: ObligationRule) => Promise<{ rule: ObligationRule; effect: FilingLinkEffect } | null>;
  onRemove: (
    rule: ObligationRule,
  ) => Promise<{ rule: ObligationRule; effect: FilingUnlinkEffect } | null>;
  onWrite: (
    draft: RuleDraft,
  ) => Promise<{ rule: ObligationRule; effect: { spawned: number } } | null>;
}) {
  // What the last press DID, in words. Cleared before every call, so the same
  // sentence arriving twice is two appearances and focus moves both times.
  const [said, setSaid] = useState<string | null>(null);
  const saidRef = useAppearFocus(said);
  const [pending, setPending] = useState<ObligationRule | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));
  // Which press the refusal, if one comes back, belongs to. Set before the
  // call, so it names the act the API answered.
  const [act, setAct] = useState<Act | null>(null);

  if (filings === null) {
    return (
      <section className="stack snug">
        <p className="text-md">
          {/* NOT A PERMISSION, when the read simply failed. A throttled read
              (the local limit is about 300 requests a minute) once drew
              "your role cannot see" on every card for an admin. */}
          {unread
            ? "The firm's compliance filings could not be read just now, so they are not listed here. Reload the page to try again."
            : "Your role cannot see the firm's compliance filings, so they are not listed here."}
        </p>
      </section>
    );
  }

  const linked = sorted(filings.filter((f) => carries(f, service.id)));
  const offered = sorted(filings.filter((f) => f.isActive && !carries(f, service.id)));
  const refusedAt = (at: Act["kind"], lineageId?: string): ReactNode =>
    act !== null && act.kind === at && (lineageId === undefined || act.lineageId === lineageId)
      ? note
      : null;

  async function add(rule: ObligationRule, how: "add" | "confirm"): Promise<void> {
    setSaid(null);
    setAct({ kind: how, lineageId: rule.lineageId });
    const done = await onAdd(rule);
    if (done === null) return;
    setPending(null);
    setSaid(addedSentence(done.rule, done.effect));
  }

  async function remove(rule: ObligationRule): Promise<boolean> {
    setSaid(null);
    setAct({ kind: "remove", lineageId: rule.lineageId });
    const done = await onRemove(rule);
    if (done === null) return false;
    setSaid(removedSentence(done.rule, done.effect));
    return true;
  }

  async function write(): Promise<void> {
    setSaid(null);
    setAct({ kind: "write", lineageId: "" });
    const done = await onWrite(draft);
    if (done === null) return;
    setWriting(false);
    setSaid(writtenSentence(done.rule, done.effect.spawned));
  }

  return (
    <section className="stack snug">
      {linked.length === 0 && (
        <p className="text-md">
          None yet, so this service puts nothing on the compliance calendar.
        </p>
      )}

      {unread && (
        <Notice tone="warn">
          The list of filings could not be refreshed just now, so it may not show the latest
          change. Reload the page to see it.
        </Notice>
      )}

      {linked.length > 0 && (
        <ul className="stack tight m-0 list-none pl-0">
          {linked.map((rule) => (
            <LinkedFiling
              key={rule.lineageId}
              rule={rule}
              serviceId={service.id}
              canWrite={canWrite}
              canReadLibrary={canReadLibrary}
              busy={busy}
              working={working}
              refusal={refusedAt("remove", rule.lineageId)}
              onBegin={() => { setSaid(null); }}
              onRemove={remove}
            />
          ))}
        </ul>
      )}

      {said !== null && (
        <Notice tone="ok" ref={saidRef} tabIndex={-1}>
          {said}
        </Notice>
      )}
      {/* A plain add has no panel of its own: its refusal sits by the
          controls it was pressed from. */}
      <Refusal note={refusedAt("add")} />

      {canWrite && (
        <AddControls
          serviceName={service.name}
          offered={offered}
          busy={busy}
          working={working}
          pending={pending}
          confirmRefusal={refusedAt("confirm")}
          onChoose={(rule) => {
            // THE CONFIRMATION IS ONLY FOR A RULE NOBODY HAS CHECKED. A
            // confirmed one is the firm's own statement already, and asking
            // again before every add would be a second click that says nothing.
            if (willConfirm(rule)) {
              setSaid(null);
              setPending(rule);
            } else {
              void add(rule, "add");
            }
          }}
          onConfirm={(rule) => void add(rule, "confirm")}
          onCancelConfirm={() => { setPending(null); }}
          onBegin={() => { setSaid(null); }}
          writing={writing}
          onToggleWrite={() => {
            // THE LAST SENTENCE GOES WHEN A NEW ACT STARTS. "13 filings added"
            // left under a form for a different filing, or beside a removal's
            // confirmation, reads as the answer to the thing now on screen.
            // The last REFUSAL goes too (review): a fresh, empty form opened
            // after Cancel still showed the 409 the old draft was given.
            setSaid(null);
            setAct(null);
            if (!writing) setDraft(draftOf(null));
            setWriting((w) => !w);
          }}
          writeForm={
            <RuleEditor
              bare
              creating
              draft={draft}
              onChange={setDraft}
              rule={null}
              busy={working}
              onSave={() => void write()}
              onCancel={() => {
                setAct(null);
                setWriting(false);
              }}
              saveLabel="Write it and add it to this service"
              cancelLabel={`Cancel the new filing for ${service.name}`}
              refusal={<Refusal note={refusedAt("write")} />}
              // The form's own refusal replaces the API's: that one answered
              // the body before this edit, and the two side by side read as
              // two reasons for one press.
              onRefused={() => { setAct(null); }}
            />
          }
        />
      )}
    </section>
  );
}

/** Which press a refusal answers. `lineageId` names the filing for the two
 *  acts that are about one (removing, and adding from the list). */
interface Act {
  readonly kind: "add" | "confirm" | "remove" | "write";
  readonly lineageId: string;
}

/**
 * The API's refusal, where it is drawn, and focused as it APPEARS.
 *
 * Focus scrolls it into view and puts the next Tab beside it, `useAppearFocus`'s
 * reason. Every press here clears the refusal before it calls (the page's
 * `answered`), so a second refused press is another appearance and focus moves
 * again.
 */
function Refusal({ note }: { note: ReactNode }) {
  const shown = note !== null && note !== undefined && note !== false;
  const ref = useAppearFocus(shown ? "refused" : null);
  if (!shown) return null;
  return (
    <div ref={ref} tabIndex={-1}>
      {note}
    </div>
  );
}

// ── One filing the service carries ────────────────────────────────────────

function LinkedFiling({
  rule,
  serviceId,
  canWrite,
  canReadLibrary,
  busy,
  working,
  refusal,
  onBegin,
  onRemove,
}: {
  rule: ObligationRule;
  serviceId: string;
  canWrite: boolean;
  canReadLibrary: boolean;
  busy: boolean;
  working: boolean;
  /** The API's refusal of THIS filing's removal, drawn inside its
   *  confirmation, beside the button that was pressed. */
  refusal: ReactNode;
  /** A new act is starting on this section: the last one's sentence goes. */
  onBegin: () => void;
  onRemove: (rule: ObligationRule) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  // "Remove from this service" is REPLACED by its confirmation, so the button
  // that had focus is unmounted by its own press. See `useSwapFocus`.
  const { panel, trigger } = useSwapFocus(confirming);
  const standing = standingOf(rule);
  const elsewhere = rule.usedIn.filter((u) => u.serviceEntryId !== serviceId);
  // Who it is filed with, and the statute's grouping, once each: the shipped
  // pack names both "GST" for every GST return, and "GST · GST" read as a typo.
  const about = [...new Set([rule.authority, rule.module].filter((s): s is string => s !== null))].join(
    " · ",
  );
  const next = describeNextChange(rule);

  return (
    <li className="stack tight border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="cluster">
        <strong>{rule.name}</strong>
        <Pill dot tone={standing.tone}>
          {standing.label}
        </Pill>
      </div>
      {about !== "" && <p className="text-sm text-muted">{about}</p>}
      {/* The due rule in the words a partner checks against the statute, and
          it is TODAY's: the rule governing the period containing the firm's
          today, not the chain's newest row. After "the law changed from April
          2027" the newest row is the successor, and this line said September
          was due on the 22nd while the calendar dated it the 20th. What
          changes, and from when, is the line under it. */}
      <p className="text-md">{describeToday(rule)}</p>
      {next !== null && <p className="text-md">{next}</p>}
      <p className="text-sm text-muted">{standing.sentence}</p>
      {elsewhere.length > 0 && (
        <p className="text-sm text-muted">
          Also used in:{" "}
          {elsewhere.map((u, i) => (
            <span key={u.serviceEntryId}>
              {i > 0 && ", "}
              {/* The other service's own page, on its filings tab (W4B): the
                  services no longer share one page, so the in-page anchor
                  this was would land nowhere. */}
              <Link href={`/catalogue/${u.serviceKey}?tab=filings` as Route}>
                {u.serviceName ?? u.serviceKey}
              </Link>
            </span>
          ))}
        </p>
      )}

      {canWrite && confirming ? (
          <div ref={panel} tabIndex={-1} className="stack tight">
            {/* THE EFFECT BEFORE THE PRESS. The sentence after it gives the
                numbers; this one says which kinds of filing go and which stay,
                so nobody learns the rule by watching a deadline disappear. */}
            <Notice tone="warn" eyebrow="Remove from this service">
              <p>
                Its upcoming filings that nobody has started come off the calendar for this
                service&rsquo;s clients, unless another service the same client holds still
                includes it. They are kept on record, not deleted, and adding it back brings them
                back.
              </p>
              <p>
                Anything already started, filed, decided, or past its date stays as it is, and you
                will be told how many.
              </p>
            </Notice>
            <div className="cluster">
              <Button
                variant="destructive"
                size="sm"
                loading={working}
                disabled={busy && !working}
                aria-label={`Remove it: ${rule.name}`}
                onClick={() => {
                  void (async () => {
                    // On success the row itself goes, and the section's result
                    // sentence takes focus. On a refusal it stays open, so the
                    // person can read the reason beside what they pressed.
                    if (await onRemove(rule)) setConfirming(false);
                  })();
                }}
              >
                Remove it
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={working}
                aria-label={`Keep it: ${rule.name}`}
                onClick={() => { setConfirming(false); }}
              >
                Keep it
              </Button>
            </div>
            <Refusal note={refusal} />
          </div>
        ) : (
          (canWrite || canReadLibrary) && (
            <div className="cluster">
              {canWrite && (
                <Button
                  ref={trigger}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  /* NAMED BY THE FILING. A service with six filings has six of
                     these, and six identical "Remove from this service" buttons
                     are indistinguishable to somebody moving between them by
                     name. The visible words lead the name, on this and on the
                     two buttons that replace it, so a person who says what they
                     see to voice control still reaches it. */
                  aria-label={`Remove from this service: ${rule.name}`}
                  onClick={() => {
                    onBegin();
                    setConfirming(true);
                  }}
                >
                  Remove from this service
                </Button>
              )}
              {/* THE WAY TO THE RULE ITSELF. The due formula, its exceptions,
                  its lead time and "the law changed" are written once, in the
                  library, and a partner reading a date here that is wrong
                  otherwise has to find the rule again among fifty-seven. The
                  anchor is the CHAIN (`lineageId`), not this row's id: a law
                  change gives the chain a new newest row, and a link naming
                  the old one would land nowhere. Offered to whoever may read
                  the library; worded for somebody who cannot write there as
                  "see", because "edit" would promise controls the library
                  does not give them. Named by the filing, like Remove. */}
              {canReadLibrary && (
                <LinkButton
                  variant="ghost"
                  size="sm"
                  href={`/admin/obligation-rules#rule-${rule.lineageId}`}
                  aria-label={`${canWrite ? "Edit" : "See it"} in the library: ${rule.name}`}
                >
                  {canWrite ? "Edit in the library" : "See it in the library"}
                </LinkButton>
              )}
            </div>
          )
        )}
    </li>
  );
}

// ── Adding: from the library, or written here ─────────────────────────────

function AddControls({
  serviceName,
  offered,
  busy,
  working,
  pending,
  confirmRefusal,
  onChoose,
  onConfirm,
  onCancelConfirm,
  onBegin,
  writing,
  onToggleWrite,
  writeForm,
}: {
  serviceName: string;
  offered: readonly ObligationRule[];
  busy: boolean;
  working: boolean;
  pending: ObligationRule | null;
  /** The API's refusal of "Confirm and add it", drawn in the confirmation. */
  confirmRefusal: ReactNode;
  onChoose: (rule: ObligationRule) => void;
  onConfirm: (rule: ObligationRule) => void;
  onCancelConfirm: () => void;
  onBegin: () => void;
  writing: boolean;
  onToggleWrite: () => void;
  writeForm: ReactNode;
}) {
  // Set as an option that needs confirming is chosen, and read as the list
  // closes: Radix hands focus back to the trigger on close, which is right for
  // an add that happened and wrong for one that is waiting on the confirmation
  // below, where focus has to go instead.
  const confirmingNext = useRef(false);
  // The confirmation and the new-filing form both unmount under the button
  // that closes them, so each hands focus back to the control that opened it.
  const confirmSwap = useSwapFocus(pending !== null);
  const writeSwap = useSwapFocus(writing);
  const { panel: confirmPanel, trigger: pickerTrigger } = confirmSwap;
  const { panel: writePanel, trigger: writeTrigger } = writeSwap;

  // FOCUS THE CONFIRMATION WHEN IT APPEARS, unconditionally. `useSwapFocus`
  // only moves focus that was LOST, and here it is not lost yet: the list is
  // still animating closed with focus inside its search box when this renders.
  useEffect(() => {
    if (pending !== null) confirmPanel.current?.focus();
  }, [pending, confirmPanel]);

  return (
    <div className="stack snug">
      <div className="cluster">
        {offered.length === 0 ? (
          <p className="text-sm text-muted">
            Every filing in your firm&rsquo;s library is already on this service.
          </p>
        ) : (
          <LibraryPicker
            offered={offered}
            triggerRef={pickerTrigger}
            disabled={busy || pending !== null}
            ariaLabel={`Add a filing to ${serviceName}`}
            onOpen={onBegin}
            onPick={(rule) => {
              if (willConfirm(rule)) confirmingNext.current = true;
              onChoose(rule);
            }}
            keepFocusOnClose={() => {
              const keep = confirmingNext.current;
              confirmingNext.current = false;
              return keep;
            }}
          />
        )}
        <Button
          ref={writeTrigger}
          variant="ghost"
          size="sm"
          disabled={busy && !writing}
          /* IT STAYS AND A FORM APPEARS UNDER IT, so the state is announced,
             the same as the library's "Write a rule". */
          aria-expanded={writing}
          aria-label={writing ? `Cancel the new filing for ${serviceName}` : undefined}
          onClick={onToggleWrite}
        >
          {writing ? "Cancel" : "Write a new filing"}
        </Button>
      </div>

      {pending !== null && (
        <div ref={confirmPanel} tabIndex={-1} className="stack tight">
          <Notice eyebrow="You are confirming">
            {/* TODAY's dates and exceptions, then what changes: the same two
                lines the service's list will show once it is added. */}
            <p>
              <strong>{pending.name}</strong>: {describeToday(pending)}.
            </p>
            {todayOf(pending).exceptions.length > 0 && (
              <p>
                Except:{" "}
                {todayOf(pending)
                  .exceptions.map(
                    (e) => `the period ending ${MONTHS[e.periodEndMonth - 1] ?? "?"}, ${e.note}`,
                  )
                  .join("; ")}
                .
              </p>
            )}
            {pending.nextChange !== null && <p>{describeNextChange(pending)}</p>}
            <p>
              Nobody at your firm has checked these dates against the law yet. Adding it confirms
              them, and your firm&rsquo;s clients on this service get these filings on the
              calendar now.
              {pending.usedIn.length > 0 &&
                ` It is confirmed for ${pending.usedIn
                  .map((u) => u.serviceName ?? u.serviceKey)
                  .join(", ")} too, which already use it.`}
            </p>
            {/* T–X ships at zero, and a confirmed rule with a zero lead time
                raises its task on the legal date itself. Said here because this
                is the moment the rule starts producing work. */}
            {pending.leadTimeDays === 0 && (
              <p>
                Work on each one starts on the legal date itself until you set how many days early
                to start, on its row in the library.
              </p>
            )}
          </Notice>
          <div className="cluster">
            <Button
              loading={working}
              disabled={busy && !working}
              onClick={() => { onConfirm(pending); }}
            >
              Confirm and add it
            </Button>
            <Button
              variant="ghost"
              disabled={working}
              aria-label={`Cancel adding ${pending.name}`}
              onClick={onCancelConfirm}
            >
              Cancel
            </Button>
          </div>
          <Refusal note={confirmRefusal} />
        </div>
      )}

      {writing && (
        <div ref={writePanel} tabIndex={-1} className="stack snug">
          <p className="text-sm text-muted">
            It goes into your firm&rsquo;s library and onto this service in one step, and this
            service&rsquo;s clients get its filings on the calendar now. Another service can then
            add it from the list without writing it again.
          </p>
          {writeForm}
        </div>
      )}
    </div>
  );
}

/**
 * The firm's library as a searchable list: one press picks a filing.
 *
 * Shared by a service's card and the "Add a service" form, so the two cannot
 * word, group or search the options differently. What a pick then DOES is the
 * caller's: the card adds it (or opens its confirmation), the form puts it on
 * the list the new service will be added with.
 */
function LibraryPicker({
  offered,
  triggerRef,
  disabled,
  ariaLabel,
  onOpen,
  onPick,
  keepFocusOnClose,
}: {
  offered: readonly ObligationRule[];
  triggerRef: Ref<HTMLButtonElement>;
  disabled: boolean;
  ariaLabel: string;
  onOpen?: () => void;
  onPick: (rule: ObligationRule) => void;
  /** Asked as the list closes. True keeps focus where the pick put it (the
   *  card's confirmation below) instead of Radix's return to the trigger,
   *  which is right for a pick that finished and wrong for one still waiting. */
  keepFocusOnClose?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const groups = byModule(offered);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant="secondary" size="sm" disabled={disabled} aria-label={ariaLabel}>
          Add a filing
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-w-[calc(100vw_-_2rem)] p-0"
        align="start"
        /* THE PHONE'S SIDE GUTTER. Aligned to a trigger 32px in, the list ran
           to the screen's edge and lost its right border on a 375px phone;
           Radix shifts it back inside a 16px margin. */
        collisionPadding={16}
        onCloseAutoFocus={(event) => {
          if (keepFocusOnClose?.() === true) event.preventDefault();
        }}
      >
        {/* SEARCHABLE AND GROUPED, because the library is fifty-seven rules on
            the first day and the person adding one knows its NAME ("GSTR-3B")
            or its law ("TDS"), not where it sits in a list. Grouped by the
            statute's own grouping, the rule's `module`, which is not the
            firm's Dept. */}
        <Command>
          <CommandInput placeholder="Search by name, law or authority…" />
          <CommandList>
            <CommandEmpty>Nothing in the library matches.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.module ?? ""} heading={group.module ?? "Other filings"}>
                {group.rules.map((rule) => (
                  <CommandItem
                    key={rule.lineageId}
                    /* The id, not the name, is the item's VALUE: cmdk treats
                       two items with one value as one item, and a firm may
                       well hold two rules called "TDS return" in two
                       countries. The words are the keywords. */
                    value={rule.id}
                    keywords={[rule.name, rule.module ?? "", rule.authority ?? ""]}
                    onSelect={() => {
                      onPick(rule);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-md text-ink">{rule.name}</span>
                      {/* Worded as the service's list words it, today's rule
                          and then what changes, so the option and the row it
                          becomes say one date. */}
                      <span className="text-sm text-ink-2">{describeToday(rule)}</span>
                      {rule.nextChange !== null && (
                        <span className="text-sm text-ink-2">{describeNextChange(rule)}</span>
                      )}
                      <span className="text-xs text-muted">{optionNote(rule)}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── A service that does not exist yet ──────────────────────────────────────

/**
 * The compliance filings a NEW service will be added with, on the "Add a
 * service" form (2026-09-26).
 *
 * The firm's idea was "when you build a service, you say what it files", and
 * the section above only exists on a service's CARD, which appears after the
 * service is saved: a partner filling in the form looked for the filings on it
 * and found none. So the form has the same two ways in, the library's list and
 * "Write a new filing", and nothing is sent until "Add as a draft": this is a
 * LIST the page adds the service with, one link (or one written rule) per
 * line, after the service exists, because a link hangs off the service's
 * catalogue entry and there is no entry yet.
 *
 * Two things are said on the list rather than after the press, because the
 * press is the one that does them: a filing nobody has checked is CONFIRMED by
 * adding the service (the card's own rule: the dates in words before the
 * press that confirms them), and a filing written here goes into the firm's
 * library, where the next service finds it.
 *
 * It sits OUTSIDE the service's `<form>`. The rule editor is a column of text
 * boxes, and Enter in any box inside a form submits it: typing a filing's
 * name and pressing Enter would have added the half-written service.
 */
export function NewServiceFilings({
  filings,
  unread,
  busy,
  chosen,
  drafts,
  onChosen,
  onDrafts,
}: {
  /** The firm's library, as the page read it; null when it cannot be read. */
  filings: readonly ObligationRule[] | null;
  unread: boolean;
  busy: boolean;
  /** Filings from the library, to be linked once the service exists. */
  chosen: readonly ObligationRule[];
  /** Filings written here, to be written (and linked) once it exists. */
  drafts: readonly RuleDraft[];
  onChosen: (next: readonly ObligationRule[]) => void;
  onDrafts: (next: readonly RuleDraft[]) => void;
}) {
  const headingId = useId();
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));
  // A filing this form refuses to put on the list, and why. Only what the
  // form can know: the API's own refusals arrive when the service is added.
  const [refused, setRefused] = useState<string | null>(null);
  const { panel: writePanel, trigger: writeTrigger } = useSwapFocus(writing);
  // Taking a line off the list unmounts the button that was pressed, so focus
  // goes to the picker rather than falling to the top of the document.
  const picker = useRef<HTMLButtonElement>(null);

  const listed = new Set(chosen.map((r) => r.lineageId));
  const offered =
    filings === null ? [] : sorted(filings.filter((f) => f.isActive && !listed.has(f.lineageId)));
  const total = chosen.length + drafts.length;

  function putOnList(): void {
    const name = draft.name.trim().toLowerCase();
    const country = draft.jurisdiction.trim().toUpperCase();
    // WRITTEN ONCE, FOUND IN THE LIST AFTER. A filing the library already
    // holds, written again here, is the duplicate the whole design exists to
    // stop, and the API would only refuse it in the same pack.
    const held = (filings ?? []).find(
      (f) => f.isActive && f.jurisdiction === country && f.name.trim().toLowerCase() === name,
    );
    if (held !== undefined) {
      setRefused(
        `Your library already has ${held.name} for ${countryName(country)}. Choose it from “Add a filing” instead of writing it again.`,
      );
      return;
    }
    const twice = drafts.some(
      (d) => d.jurisdiction.trim().toUpperCase() === country && d.name.trim().toLowerCase() === name,
    );
    if (twice) {
      setRefused(`${draft.name.trim()} is already on this list.`);
      return;
    }
    setRefused(null);
    onDrafts([...drafts, draft]);
    setDraft(draftOf(null));
    setWriting(false);
  }

  return (
    /* A PANEL OF ITS OWN, sunk, because it is a different kind of thing from
       the fields above it: those are the service's frozen terms, this is a
       list the service is added WITH. Flat on the card, its buttons ran
       straight into "Add as a draft" and read as one row of four. */
    <section aria-labelledby={headingId} className="stack snug">
      <div className="row">
        <h2 id={headingId} className="card-title">
          Compliance filings <span className="text-md font-normal text-muted">(optional)</span>
        </h2>
        <span className="text-md">
          {total} {total === 1 ? "filing" : "filings"} added
        </span>
      </div>

      {filings === null && (
        <p className="text-sm text-muted">
          {unread
            ? "The firm's library of filings could not be read just now, so it cannot be chosen from. Reload the page to try again, or write a new filing here."
            : "Your role cannot see the firm's library of filings, so it cannot be chosen from here."}
        </p>
      )}

      {total === 0 ? (
        // AN EMPTY LIST SAYS WHAT EMPTY MEANS: a service with no filings puts
        // nothing on the calendar, which is right for advisory work and a
        // mistake for a GST service, and only the partner knows which this is.
        <p className="rounded-sm border border-dashed border-line p-3 text-sm text-muted">
          None added yet. A service with no filings puts nothing on the compliance calendar.
        </p>
      ) : (
        <ul className="stack tight m-0 list-none pl-0">
          {/* ONE ROW PER FILING, the name and its date on the left and the one
              action at the far end, so a list of six reads down one column
              instead of a button on a line of its own under every filing. */}
          {chosen.map((rule) => {
            const today = todayOf(rule);
            return (
              <li key={rule.lineageId} className="rounded-sm border border-line bg-surface p-3">
                <div className="row">
                  <div className="stack tight">
                    <div className="cluster">
                      <strong>{rule.name}</strong>
                      {willConfirm(rule) && (
                        <Pill dot tone="warn">
                          Not confirmed yet
                        </Pill>
                      )}
                    </div>
                    <span className="text-md">{describeToday(rule)}</span>
                    {rule.nextChange !== null && (
                      <span className="text-md">{describeNextChange(rule)}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove from this list: ${rule.name}`}
                    onClick={() => {
                      onChosen(chosen.filter((r) => r.lineageId !== rule.lineageId));
                      picker.current?.focus();
                    }}
                  >
                    Remove
                  </Button>
                </div>
                {today.exceptions.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    Except:{" "}
                    {today.exceptions
                      .map((e) => `the period ending ${MONTHS[e.periodEndMonth - 1] ?? "?"}, ${e.note}`)
                      .join("; ")}
                    .
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">{chosenNote(rule)}</p>
              </li>
            );
          })}
          {drafts.map((d, i) => (
            <li key={`new-${String(i)}-${d.name}`} className="rounded-sm border border-line bg-surface p-3">
              <div className="row">
                <div className="stack tight">
                  <div className="cluster">
                    <strong>{d.name.trim()}</strong>
                    <Pill tone="neutral">New</Pill>
                  </div>
                  <span className="text-md">{describeDraft(d)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Remove from this list: ${d.name.trim()}`}
                  onClick={() => {
                    onDrafts(drafts.filter((_, j) => j !== i));
                    picker.current?.focus();
                  }}
                >
                  Remove
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Written here. It goes into your firm&rsquo;s library with the service, so the next
                service can choose it.
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="cluster">
        {offered.length > 0 && (
          <LibraryPicker
            offered={offered}
            triggerRef={picker}
            disabled={busy || writing}
            ariaLabel="Add a filing to the new service"
            onPick={(rule) => {
              onChosen([...chosen, rule]);
            }}
          />
        )}
        <Button
          ref={writeTrigger}
          variant="ghost"
          size="sm"
          disabled={busy && !writing}
          aria-expanded={writing}
          aria-label={writing ? "Cancel the new filing" : undefined}
          onClick={() => {
            setRefused(null);
            if (!writing) setDraft(draftOf(null));
            setWriting((w) => !w);
          }}
        >
          {writing ? "Cancel" : "Write a new filing"}
        </Button>
      </div>

      {writing && (
        <div ref={writePanel} tabIndex={-1} className="stack snug rounded-sm border border-line bg-surface p-4">
          <RuleEditor
            bare
            creating
            draft={draft}
            onChange={setDraft}
            rule={null}
            busy={busy}
            onSave={putOnList}
            onCancel={() => {
              setRefused(null);
              setWriting(false);
            }}
            saveLabel="Put it on this service's list"
            cancelLabel="Cancel the new filing"
            refusal={<Refusal note={refused === null ? null : <Notice tone="danger">{refused}</Notice>} />}
            onRefused={() => {
              setRefused(null);
            }}
          />
        </div>
      )}
    </section>
  );
}

/** What a filing on the new service's list will do, said before the press. */
function chosenNote(rule: ObligationRule): string {
  if (willConfirm(rule)) {
    const early =
      rule.leadTimeDays === 0
        ? " Work on each one starts on the legal date itself until you set how many days early to start, on its row in the library."
        : "";
    return `Nobody at your firm has checked these dates against the law yet. Adding the service confirms them.${early}`;
  }
  if (todayOf(rule).dueRule === null) {
    return "Its date is not known yet, so it adds nothing to the calendar until somebody answers it in the library.";
  }
  if (rule.recurrence === "event") {
    return "Due when something happens rather than every period.";
  }
  return rule.usedIn.length === 0
    ? "Not used by any service yet."
    : `Also used in: ${rule.usedIn.map((u) => u.serviceName ?? u.serviceKey).join(", ")}.`;
}

// ── Reading a rule ────────────────────────────────────────────────────────

/** Whether a rule's chain is on this service. `usedIn` is per CHAIN, so every
 *  row of one chain answers the same. */
function carries(rule: ObligationRule, serviceId: string): boolean {
  return rule.usedIn.some((u) => u.serviceEntryId === serviceId);
}

/**
 * Whether adding it would CONFIRM it. The API's own test: it confirms a rule
 * that is active, unconfirmed, has a formula and is not event-driven. A rule
 * still waiting on a fact has no date to confirm, so adding it confirms
 * nothing, and the screen must not claim it did.
 *
 * Read off THIS row, the chain's newest, and not today's (review asked; kept):
 * the link confirms the chain's newest row, so this is a prediction of what
 * the API will do, and reading today's row would mispredict it after a law
 * change. What the confirmation panel shows is today's dates AND the change,
 * so the row being confirmed is on it.
 */
export function willConfirm(rule: ObligationRule): boolean {
  return (
    rule.isActive &&
    rule.status === "unconfirmed" &&
    rule.dueRule !== null &&
    rule.recurrence !== "event"
  );
}

/** The option's second line: how widely it is used, and what adding it will
 *  do when that is not simply "its filings arrive". "Cannot work out a date"
 *  is TODAY's row's (review): it sits under today's date, and after a law
 *  change waiting on a fact it contradicted "the 20th" printed above it. */
function optionNote(rule: ObligationRule): string {
  const used =
    rule.usedIn.length === 0
      ? "Not used by any service yet"
      : `Used in ${String(rule.usedIn.length)} ${rule.usedIn.length === 1 ? "service" : "services"}`;
  if (willConfirm(rule)) return `${used} · not confirmed yet, adding it confirms it`;
  if (todayOf(rule).dueRule === null) return `${used} · cannot work out a date yet`;
  if (rule.recurrence === "event") return `${used} · due when something happens`;
  return used;
}

/**
 * What a filing on this service is doing TODAY, as a pill and a sentence: the
 * standing of the row governing today's periods, the same row whose date the
 * line above it prints (review). The newest row's own standing is what the
 * "From April 2027" line says, in its own words.
 */
function standingOf(rule: ObligationRule): { tone: PillTone; label: string; sentence: string } {
  const today = todayOf(rule);
  switch (today.coverage) {
    case "generating":
      return {
        tone: "ok",
        label: "On the calendar",
        sentence: `On the calendar for this service's clients ${reachOf(rule)}.`,
      };
    case "needs_formula":
      return {
        tone: "warn",
        label: "Date not known yet",
        sentence:
          // The reason is the firm's own sentence and often ends in a full
          // stop already: "yet.." on the card was found by the review walk.
          `Date not known yet: ${(today.unresolvedReason ?? "it cannot work out a date").replace(/\.$/, "")}. ` +
          "It adds nothing to the calendar until somebody answers it in the library.",
      };
    case "event_driven":
      return {
        tone: "neutral",
        label: "Event-driven",
        sentence:
          "Due when something happens rather than every period, so nothing goes on the calendar from it yet.",
      };
    case "unconfirmed":
      return {
        tone: "warn",
        label: "Not confirmed",
        sentence:
          "Marked as not yet checked against the law, so it adds nothing to the calendar until somebody confirms it in the library.",
      };
    case "retired":
      return {
        tone: "danger",
        label: "Retired",
        sentence: "Retired, so it adds nothing new. The filings it already produced stay.",
      };
    case "unlinked":
      // Not reachable for a filing this service carries; the switch is total
      // so that a new coverage value is a compile error here, not a blank.
      return {
        tone: "neutral",
        label: "Not used",
        sentence: "Not used by any service, so it adds nothing to the calendar.",
      };
  }
}

/** Which of the service's clients a rule reaches: "registered in India", and
 *  narrower when the rule names an entity type. A rule matches a company's
 *  registered country exactly, so a client registered elsewhere gets none. */
function reachOf(rule: ObligationRule): string {
  const where = `registered in ${countryName(rule.jurisdiction)}`;
  return rule.entityType === null
    ? where
    : `${where}, ${rule.entityType.replace(/_/g, " ")} companies only`;
}

/** "IN" as "India". The browser knows every region's name; falling back to the
 *  code is right for anything it does not. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** By module (the statute's grouping), then name; a rule with none goes last,
 *  never dropped. */
function sorted(rules: readonly ObligationRule[]): ObligationRule[] {
  return [...rules].sort((a, b) => {
    if (a.module !== b.module) {
      if (a.module === null) return 1;
      if (b.module === null) return -1;
      return a.module.localeCompare(b.module);
    }
    return a.name.localeCompare(b.name);
  });
}

function byModule(rules: readonly ObligationRule[]): { module: string | null; rules: ObligationRule[] }[] {
  const groups: { module: string | null; rules: ObligationRule[] }[] = [];
  for (const rule of rules) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.module === rule.module) last.rules.push(rule);
    else groups.push({ module: rule.module, rules: [rule] });
  }
  return groups;
}

// ── What a press did, in words ────────────────────────────────────────────

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/**
 * After adding. "12 filings added to the calendar for 4 companies", and when
 * nothing arrived, WHY, because "added" over an unchanged calendar reads as a
 * press that did nothing. The count is of COMPANIES: a client group files per
 * company, and that is what the API counts.
 */
function addedSentence(rule: ObligationRule, e: FilingLinkEffect): string {
  if (!e.linked) return `${rule.name} was already on this service. Nothing changed.`;
  const lead = e.confirmed
    ? `${rule.name} is confirmed and added to this service.`
    : `${rule.name} is added to this service.`;
  const companies = count(e.companies, "company", "companies");
  if (e.spawned > 0 && e.restored > 0) {
    return `${lead} ${count(e.spawned, "filing", "filings")} added to the calendar and ${String(e.restored)} taken off earlier put back, for ${companies}.`;
  }
  if (e.spawned > 0) {
    return `${lead} ${count(e.spawned, "filing", "filings")} added to the calendar for ${companies}.`;
  }
  if (e.restored > 0) {
    return `${lead} ${count(e.restored, "filing", "filings")} taken off earlier ${e.restored === 1 ? "is" : "are"} back on the calendar, for ${companies}.`;
  }
  return `${lead} ${nothingArrived(rule)}`;
}

/** After writing a new filing here. The create answers with the new filings
 *  only; there is nothing to restore for a rule that did not exist. */
function writtenSentence(rule: ObligationRule, spawned: number): string {
  const lead = `${rule.name} is written into your firm's library and added to this service.`;
  if (spawned > 0) return `${lead} ${count(spawned, "filing", "filings")} added to the calendar.`;
  return `${lead} ${nothingArrived(rule)}`;
}

function nothingArrived(rule: ObligationRule): string {
  switch (rule.coverage) {
    case "needs_formula":
      return "Nothing went on the calendar: it cannot work out a date until somebody answers it in the library.";
    case "event_driven":
      return "Nothing goes on the calendar from it: it is due when something happens, not every period.";
    case "unconfirmed":
      return "Nothing went on the calendar: it is not confirmed yet.";
    case "retired":
      return "Nothing went on the calendar: it is retired.";
    default:
      return `No new filings: this service's clients ${reachOf(rule)} already have them on the calendar, or none has a live engagement for it yet.`;
  }
}

/** After removing. The three reasons a filing stayed are said apart, because
 *  "kept because work started" and "kept because another service still owes
 *  it" are different things for a partner to know. */
function removedSentence(rule: ObligationRule, e: FilingUnlinkEffect): string {
  if (!e.unlinked) return `${rule.name} was not on this service. Nothing changed.`;
  const parts = [`${rule.name} is removed from this service.`];
  parts.push(
    e.withdrawn > 0
      ? `${count(e.withdrawn, "upcoming filing", "upcoming filings")} taken off the calendar.`
      : "No filings were taken off the calendar.",
  );
  if (e.keptStarted > 0) {
    parts.push(
      `${String(e.keptStarted)} kept because work on ${e.keptStarted === 1 ? "it" : "them"} has started.`,
    );
  }
  if (e.keptPastDue > 0) {
    parts.push(
      `${String(e.keptPastDue)} kept because ${e.keptPastDue === 1 ? "its" : "their"} date has passed or a decision is waiting.`,
    );
  }
  if (e.keptCoveredElsewhere > 0) {
    parts.push(
      `${String(e.keptCoveredElsewhere)} kept because another service the same client holds still includes it.`,
    );
  }
  return parts.join(" ");
}
