# Writing for the screen (Wave 4, 2026-09-28)

The readers are staff of CA and professional-services firms: about 90% over 35, at a desktop,
reading figures all day, not technical. The user's words: *"extra extra heading nhi chaiye … user
ko samjh aye krna kya hai … ai generated nhi dikhana hai … placeholder text ko distinguish krna
hai … har column k neeche jo description hai usko short and non ai generated banana hai"*. Full
brief: `bib/prompts/entity-proposal-builder/W4-UX-BRIEF.md`.

**This overrides the older habit of "saying it on screen".** Reasoning belongs in `docs/claude/`
and in code comments. The screen says what is set and what to do.

## The rules

1. **One primary action per screen**, in the brand colour, where the eye lands (top right, or the
   section's head). Everything else is secondary or quiet.
2. **The title says what the page is for** ("Your firm", "Proposals"); no paragraph follows it, no
   eyebrow repeating the sidebar section. Guidance, if any, is ONE line where the user acts.
3. **Fewer headings.** None repeating the page title; no card title + subtitle + hint stacks; a
   section heading only when the page has two or more sections.
4. **Short, specific, active, second person**: "Add a company", "Who signs your letters". None of
   "This is where…", "Note that…", "deliberately", "honest", "on purpose", "because…".
5. **A hint is one line, ~10 words at most**, only where the label is not enough.
6. **An error says what is wrong and how to fix it**, in one sentence. The API's own message is
   still shown verbatim where it arrives.
7. **A placeholder is an EXAMPLE and starts with "e.g."** ("e.g. 10x Global FZCO"). Never a
   plausible value or a default in disguise; prefill a box only with the real default. One
   exception: a placeholder showing what a BLANK box prints starts **"Blank prints:"** (the
   letter page's "Tailor the wording" boxes show the catalogue's words, the real default).
8. **An empty value reads "Not set"** (`<NotSet />`), muted italic: never a blank, an em dash or a
   zero. Be more precise when it helps ("Not sent", "Not yet"). A money value that may be
   redacted reads "Hidden", not "Not set" (see `money-and-dates.md`).
9. **Words, not codes.** "New", "Referral", "Declined", "Monthly", never `new` / `referral` /
   `rejected` / `one_time`. A firm's own names (Depts, services, states) are shown as the firm
   wrote them. Nothing compares or prints a firm-owned state's code: branch on its flags, print
   its name.
10. **No em dashes** in UI text.

## Enforced and shared pieces

- **The placeholder check** runs in `npm run check` (`check:copy`,
  `scripts/check-placeholders.mjs`): it parses every `.tsx` with the TypeScript compiler and flags
  a literal `placeholder` inside a `<Field>` that does not start with "e.g.". Older screens are in
  `scripts/placeholder-baseline.json` with their 2026-09-28 count: a file may go down, never up.
  **After fixing a screen, lower its number** (or `node scripts/check-placeholders.mjs --update`).
  It only reads literal placeholders, so it never sees the "Blank prints:" exception.
- **Product enums → words**: `codeLabel(code)` in `client.ts` ("one_time" → "One time");
  `PROPOSAL_STATUS_WORDS` where the word differs (`rejected` → "Declined", the client's own
  button); `BRAND_ASSET_HINTS`, `HOW_WORDS`, `CAUGHT_UP_WORDS`, `flagWords`/`noteWords` likewise.
- **Codes are never printed** (audit 2026-10-03): a rule pack key is `rulePackLabel()`, a country
  `countryName()`, a kind of company `entityKindLabel()`, a permission its sentence (Roles and
  `Denied` no longer show `tenant:admin`); the audit trail maps `jurisdiction*` / `rung*` keys to
  words; a catalogue pin reads `H1 · catalogue version 3`, never `key@version`; engine states are
  a dot and a word ("Waiting on someone").
- **Counts are one string**: `plural(n, "client")` from `@/lib/plural`. `{n} client{n === 1 ? "" :
  "s"}` is three text nodes and in a flex container with a gap read "4 client s".
- **Two labels must not collide**: the sidebar's search box is "Search the menu", so a page's own
  is named for what it searches ("Search services").

## What goes wrong with words, and no gate sees it

- **A sentence that enumerates ABSENCES goes stale** every time somebody removes one ("sending
  files across is not here yet" one paragraph below a working file picker; rewritten, then false
  again inside one task). Point at where things ARE, or let the nav say it.
- **Saying one thing twice** is this app's recurring bug: the same request in the action centre
  and in "Held up"; a filing listed as the law's row and the firm's task; "Waiting on us" beside a
  raw `open`; an owner note in the fact grid and again in a callout. Say each fact once.
- **A pointer to a heading must be checked after the state changes** ("it is under Waiting on
  you" on an ask that had moved to "Sent — with the firm").
- **A promise to a read-only reader** ("you can still send another" beside a card with no
  controls) is a lie: write copy per permission.
- **Never imply a feature works that does not** (no virus scan, no e-signature service, Copilot
  not live): say it where the reader would assume otherwise.

## Before and after (the three reference screens)

| Where | Before | After |
|---|---|---|
| `/leads`, under the title | "Every prospect the firm is talking to, the stage each one is at, and who is handling it. Capture a new lead at the bottom of the page." | Nothing. **Capture a lead** is the brand button top right and opens the form. |
| `/admin/firm`, Deadlines hint | "The day you went live on this system. A filing whose legal due date falls before this day is not created and is not flagged as missed … bring in four hundred clients and the first morning is four hundred filings to decide on." | "The day you started on BiB. Older deadlines are skipped." (Reasoning: `shell-and-navigation.md` (Admin and record screens).) |
| `/leads`, filter box | label "Value at least", `placeholder="100000"`: an empty box that looked filled | label "Value from", `placeholder="e.g. 1,00,000"`, muted italic |
