"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  FilingLinkEffect,
  FilingUnlinkEffect,
  ObligationRule,
} from "@/lib/api/client";
import {
  Button,
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
  describeRule,
  draftOf,
  MONTHS,
  RuleEditor,
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
 */
export function ComplianceFilings({
  service,
  filings,
  canWrite,
  busy,
  working,
  note,
  onAdd,
  onRemove,
  onWrite,
}: {
  service: { readonly id: string; readonly key: string; readonly name: string };
  /** Null when this session may not read the library at all. */
  filings: readonly ObligationRule[] | null;
  canWrite: boolean;
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
  const headingId = useId();
  // What the last press DID, in words. Cleared before every call, so the same
  // sentence arriving twice is two appearances and focus moves both times.
  const [said, setSaid] = useState<string | null>(null);
  const saidRef = useAppearFocus(said);
  const [pending, setPending] = useState<ObligationRule | null>(null);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(draftOf(null));

  if (filings === null) {
    return (
      <section aria-labelledby={headingId} className="stack snug border-t border-line pt-4">
        <h4 id={headingId}>Compliance filings</h4>
        <p className="text-sm text-muted">
          Your role cannot see the firm&rsquo;s compliance filings, so they are not listed here.
        </p>
      </section>
    );
  }

  const linked = sorted(filings.filter((f) => carries(f, service.id)));
  const offered = sorted(filings.filter((f) => f.isActive && !carries(f, service.id)));

  async function add(rule: ObligationRule): Promise<void> {
    setSaid(null);
    const done = await onAdd(rule);
    if (done === null) return;
    setPending(null);
    setSaid(addedSentence(done.rule, done.effect));
  }

  async function remove(rule: ObligationRule): Promise<boolean> {
    setSaid(null);
    const done = await onRemove(rule);
    if (done === null) return false;
    setSaid(removedSentence(done.rule, done.effect));
    return true;
  }

  async function write(): Promise<void> {
    setSaid(null);
    const done = await onWrite(draft);
    if (done === null) return;
    setWriting(false);
    setSaid(writtenSentence(done.rule, done.effect.spawned));
  }

  return (
    <section aria-labelledby={headingId} className="stack snug border-t border-line pt-4">
      <h4 id={headingId}>
        Compliance filings{" "}
        <span className="annot">
          · {linked.length} {linked.length === 1 ? "filing" : "filings"}
        </span>
      </h4>
      <p className="text-sm text-muted">
        {linked.length === 0
          ? "None yet, so this service puts nothing on the compliance calendar. Add the filings a client on this service owes, and each client gets them on the calendar."
          : "What the law asks of every client on this service, and by when. Each filing is written once in your firm's library and can be on as many services as owe it: a client holding two of them still gets one filing per period."}
      </p>

      {linked.length > 0 && (
        <ul className="stack tight">
          {linked.map((rule) => (
            <LinkedFiling
              key={rule.lineageId}
              rule={rule}
              serviceId={service.id}
              canWrite={canWrite}
              busy={busy}
              working={working}
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
      {note}

      {canWrite && (
        <AddControls
          serviceName={service.name}
          offered={offered}
          busy={busy}
          working={working}
          pending={pending}
          onChoose={(rule) => {
            // THE CONFIRMATION IS ONLY FOR A RULE NOBODY HAS CHECKED. A
            // confirmed one is the firm's own statement already, and asking
            // again before every add would be a second click that says nothing.
            if (willConfirm(rule)) {
              setSaid(null);
              setPending(rule);
            } else {
              void add(rule);
            }
          }}
          onConfirm={(rule) => void add(rule)}
          onCancelConfirm={() => { setPending(null); }}
          onBegin={() => { setSaid(null); }}
          writing={writing}
          onToggleWrite={() => {
            // THE LAST SENTENCE GOES WHEN A NEW ACT STARTS. "13 filings added"
            // left under a form for a different filing, or beside a removal's
            // confirmation, reads as the answer to the thing now on screen.
            setSaid(null);
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
              onCancel={() => { setWriting(false); }}
              saveLabel="Write it and add it to this service"
              cancelLabel={`Cancel the new filing for ${service.name}`}
            />
          }
        />
      )}
    </section>
  );
}

// ── One filing the service carries ────────────────────────────────────────

function LinkedFiling({
  rule,
  serviceId,
  canWrite,
  busy,
  working,
  onBegin,
  onRemove,
}: {
  rule: ObligationRule;
  serviceId: string;
  canWrite: boolean;
  busy: boolean;
  working: boolean;
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

  return (
    <li className="stack tight border-t border-line pt-3">
      <div className="cluster">
        <strong>{rule.name}</strong>
        <Pill tone={standing.tone}>{standing.label}</Pill>
      </div>
      {about !== "" && <p className="text-xs text-muted">{about}</p>}
      {/* The due rule in the words a partner checks against the statute. */}
      <p className="mono text-xs">{describeRule(rule)}</p>
      <p className="text-sm text-muted">{standing.sentence}</p>
      {elsewhere.length > 0 && (
        <p className="text-sm text-muted">
          Also used in:{" "}
          {elsewhere.map((u, i) => (
            <span key={u.serviceEntryId}>
              {i > 0 && ", "}
              {/* The same page, so a plain anchor: every service card carries
                  its key as an id. */}
              <a href={`#service-${u.serviceKey}`}>{u.serviceName ?? u.serviceKey}</a>
            </span>
          ))}
        </p>
      )}

      {canWrite &&
        (confirming ? (
          <div ref={panel} tabIndex={-1} className="stack tight">
            {/* THE EFFECT BEFORE THE PRESS. The sentence after it gives the
                numbers; this one says which kinds of filing go and which stay,
                so nobody learns the rule by watching a deadline disappear. */}
            <Notice tone="warn" eyebrow="REMOVE FROM THIS SERVICE">
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
          </div>
        ) : (
          <div className="cluster">
            <Button
              ref={trigger}
              variant="ghost"
              size="sm"
              disabled={busy}
              /* NAMED BY THE FILING. A service with six filings has six of
                 these, and six identical "Remove from this service" buttons
                 are indistinguishable to somebody moving between them by name.
                 The visible words lead the name, on this and on the two
                 buttons that replace it, so a person who says what they see
                 to voice control still reaches it. */
              aria-label={`Remove from this service: ${rule.name}`}
              onClick={() => {
                onBegin();
                setConfirming(true);
              }}
            >
              Remove from this service
            </Button>
          </div>
        ))}
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
  onChoose: (rule: ObligationRule) => void;
  onConfirm: (rule: ObligationRule) => void;
  onCancelConfirm: () => void;
  onBegin: () => void;
  writing: boolean;
  onToggleWrite: () => void;
  writeForm: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

  const groups = byModule(offered);

  return (
    <div className="stack snug">
      <div className="cluster">
        {offered.length === 0 ? (
          <p className="text-sm text-muted">
            Every filing in your firm&rsquo;s library is already on this service.
          </p>
        ) : (
          <Popover
            open={open}
            onOpenChange={(next) => {
              if (next) onBegin();
              setOpen(next);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                ref={pickerTrigger}
                variant="secondary"
                size="sm"
                disabled={busy || pending !== null}
                aria-label={`Add a filing to ${serviceName}`}
              >
                Add a filing
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-96 max-w-[calc(100vw_-_2rem)] p-0"
              align="start"
              onCloseAutoFocus={(event) => {
                if (confirmingNext.current) {
                  confirmingNext.current = false;
                  event.preventDefault();
                }
              }}
            >
              {/* SEARCHABLE AND GROUPED, because the library is fifty-seven
                  rules on the first day and the person adding one knows its
                  NAME ("GSTR-3B") or its law ("TDS"), not where it sits in a
                  list. Grouped by the statute's own grouping, the rule's
                  `module`, which is not the firm's Dept. */}
              <Command>
                <CommandInput placeholder="Search by name, law or authority…" />
                <CommandList>
                  <CommandEmpty>Nothing in the library matches.</CommandEmpty>
                  {groups.map((group) => (
                    <CommandGroup key={group.module ?? ""} heading={group.module ?? "Other filings"}>
                      {group.rules.map((rule) => (
                        <CommandItem
                          key={rule.lineageId}
                          /* The id, not the name, is the item's VALUE: cmdk
                             treats two items with one value as one item, and a
                             firm may well hold two rules called "TDS return"
                             in two countries. The words are the keywords. */
                          value={rule.id}
                          keywords={[rule.name, rule.module ?? "", rule.authority ?? ""]}
                          onSelect={() => {
                            if (willConfirm(rule)) confirmingNext.current = true;
                            setOpen(false);
                            onChoose(rule);
                          }}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="text-sm text-ink">{rule.name}</span>
                            <span className="mono text-xs text-muted">{describeRule(rule)}</span>
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
          <Notice eyebrow="YOU ARE CONFIRMING">
            <p>
              <strong>{pending.name}</strong>: {describeRule(pending)}.
            </p>
            {pending.exceptions.length > 0 && (
              <p>
                Except:{" "}
                {pending.exceptions
                  .map((e) => `the period ending ${MONTHS[e.periodEndMonth - 1] ?? "?"}, ${e.note}`)
                  .join("; ")}
                .
              </p>
            )}
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
 */
function willConfirm(rule: ObligationRule): boolean {
  return (
    rule.isActive &&
    rule.status === "unconfirmed" &&
    rule.dueRule !== null &&
    rule.recurrence !== "event"
  );
}

/** The option's second line: how widely it is used, and what adding it will
 *  do when that is not simply "its filings arrive". */
function optionNote(rule: ObligationRule): string {
  const used =
    rule.usedIn.length === 0
      ? "Not used by any service yet"
      : `Used in ${String(rule.usedIn.length)} ${rule.usedIn.length === 1 ? "service" : "services"}`;
  if (willConfirm(rule)) return `${used} · not confirmed yet, adding it confirms it`;
  if (rule.dueRule === null) return `${used} · cannot work out a date yet`;
  if (rule.recurrence === "event") return `${used} · due when something happens`;
  return used;
}

/** What a filing on this service is doing, as a pill and a sentence. */
function standingOf(rule: ObligationRule): { tone: PillTone; label: string; sentence: string } {
  switch (rule.coverage) {
    case "generating":
      return {
        tone: "ok",
        label: "on the calendar",
        sentence: `On the calendar for this service's clients ${reachOf(rule)}.`,
      };
    case "needs_formula":
      return {
        tone: "warn",
        label: "date not known yet",
        sentence:
          `Date not known yet: ${rule.unresolvedReason ?? "it cannot work out a date"}. ` +
          "It adds nothing to the calendar until somebody answers it in the library.",
      };
    case "event_driven":
      return {
        tone: "neutral",
        label: "event-driven",
        sentence:
          "Due when something happens rather than every period, so nothing goes on the calendar from it yet.",
      };
    case "unconfirmed":
      return {
        tone: "warn",
        label: "not confirmed",
        sentence:
          "Marked as not yet checked against the law, so it adds nothing to the calendar until somebody confirms it in the library.",
      };
    case "retired":
      return {
        tone: "danger",
        label: "retired",
        sentence: "Retired, so it adds nothing new. The filings it already produced stay.",
      };
    case "unlinked":
      // Not reachable for a filing this service carries; the switch is total
      // so that a new coverage value is a compile error here, not a blank.
      return {
        tone: "neutral",
        label: "not used",
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
