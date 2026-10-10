# CLAUDE.md — bib-frontend

The **10X Workspace** (staff) and, later, the **client portal** — the browser half of BiB.
The backend is a separate service in a separate repo (`../bib-backend`); read its
`CLAUDE.md` for the architecture those APIs come from. This file is the rules for this app.

## The one rule: the API's shapes are generated, never retyped

`src/lib/api/schema.d.ts` is generated from the backend's `/openapi.json`, which is itself
generated from the zod schemas that validate the requests. So every request and response
shape has **exactly one definition, in the backend**.

```bash
npm run api:generate    # backend must be running on :8080
```

- **Never hand-write an API type.** Import it from `@/lib/api/client`, which re-exports off
  the generated schema. A renamed backend field then becomes a compile error here instead of
  an `undefined` at runtime.
- **Never edit `schema.d.ts`.** It is overwritten, and it is gitignored from linting for the
  same reason.
- Regenerate after any backend API change. It is one command, deliberately.

## The API is a different origin. Always.

Not a local quirk — the arrangement in every environment. Consequences, all deliberate:

- **No dev proxy / rewrite.** A proxy would make local development work under rules that
  apply nowhere else (same-origin, no preflight, no cookie policy), so the first environment
  to exercise the real rules would be production.
- **`credentials: "include"` on every call**, set once in `client.ts`. Without it the browser
  withholds the session cookie cross-origin and every authenticated request silently becomes
  anonymous.
- **This app's origin must be in the backend's `BIB_CORS_ORIGINS`**, or the browser discards
  responses before this code sees them.

## The session is not ours to hold

The API sets an **httpOnly** cookie. No script can read it — including this one. So there is
no token in `localStorage`, no auth header to attach, and no "log out" that clears a client
store: sign-out is a call the server acts on. If you find yourself wanting to read the
session, the answer is `GET /api/v1/auth/me`.

A 401 mid-session is ordinary, not an error to display: the session expired, was revoked, or
the user's membership was deactivated (the API re-checks it on every request). Route to
`/login`.

## What the API tells the user, we show

Failures come back in one envelope: `{ error: { code, message, reason? } }`. Show `message`.
Do not improve on it — several messages are deliberately vague because the API must not
confirm who holds an account, and a friendlier local rewrite would leak exactly what the
backend refused to.

## Styling — read `src/design/README.md` before writing any UI

There is a design system, and it is the DEFAULT way to build a screen here, not a set of
optional helpers sitting beside the old way. It is the **same design language as 10x CRM**
(`../10xcrm`): same blue-green-biased neutrals, same teal accent, same spacing. Where a token
name exists in both, it means the same thing. **Two things have left it on purpose (Wave 4,
2026-09-28):** the face is Source Sans 3 rather than IBM Plex, and the type scale moved up a rung,
both for readers over 35 (see "The Wave 4 foundation" below).

```
src/design/     tokens.css · base.css · layout.css · components.css
src/components/ ui/ · layout/ · states/
```

The rules, in short:

- **Import the component, never type the class.** `<Button>`, `<Field>`, `<Pill>`, `<Card>`,
  `<Table>`, `<Tabs>`, `<Dialog>` — all from `@/components/ui`. The class names are an
  implementation detail, and keeping them so is what stops a sixth button appearing the week
  after the fifth was consolidated.
- **Colour means one thing: status — and `--brand` is the ONE exception, deliberately.**
  `--accent` is also `--ok`, so it says "done / in force / this held"; `--warn` and `--danger`
  say the other two things. Nothing else may touch those three. `--brand` (maroon) is not a
  status at all — it says whose product this is, and it is spent in exactly three places: the
  mark, the sidebar, and a screen's one committing action. **The primary button is brand, not
  ink and never accent** (that reverses an earlier rule and the reason is written in
  `tokens.css`). Destructive stays `--danger`, which is why the brand is plum rather than
  brick: an escalation queue puts maroon chrome around red "nobody" pills, and if those blur
  the one that stops mattering is the one that means something.
- **The category tints are the SECOND exception, and a category tint never means good or bad.**
  `--cat-1…--cat-4` (each with `-wash` and `-ink`) tell GROUPS apart, first the Catalogue's Depts
  (FRC, TRC, RAA and a spare): a chip and a thin left edge. They sit where the status colours are
  not (blue, violet, olive, orchid, all desaturated) so a Dept can never read as "done", "late"
  or "wrong". Never use one for a state, and never use a status colour for a group. They are
  spent through two props, `<Pill cat={1..4}>` and `<Tr cat={1..4}>` (a 3px inset edge on the
  row's first cell); the Catalogue's `deptTint` picks the number from the firm's Dept order.
- **Nothing invents a value.** Type comes off the scale (`--t-xs`…`--t-2xl`, or the
  `.text-*` classes: 14, 15, 16, 16, 20, 24, 32 since Wave 4), spacing off `--s-1`…`--s-7`,
  shape off `--r`/`--r-sm`. `12px`, `13px` and `17px` are not on the ladder, and nothing a user
  must read is below 14.
- **No hex values in components**, and no inline `fontSize`, `color`, `borderRadius` or
  `boxShadow`. All of these are **lint errors** — `eslint.config.mjs` names what to use
  instead in each message.
- **A component never branches on theme.** Light and dark redefine only the semantic colour
  tokens; everything else appears once. If you want a dark-mode rule inside a component, the
  token is missing — add it to `tokens.css`.
- **Navigation lives in `AppShell`, once.** A page does not list its own links. It is
  **collapsible groups over a search box**, not a flat column: twenty-six links in one list is
  something a reader scans top to bottom every time, because nothing in it is nearer than
  anything else. Four rules make it work, and each was a decision:
  - **The group holding the current page opens on its own**, until the reader toggles
    something — absent from the toggle map is "untouched", which is not the same as closed. So
    the sidebar shows you where you are without being asked, and stops guessing the moment you
    disagree.
  - **A search opens everything and hides non-matches — it never restructures the nav.** The
    first version decided "dropdown or plain link" from the FILTERED count, so typing "escal"
    turned Administration into a top-level "Escalation ladder" link and the one thing a result
    should tell you (which section it lives in) was what the search removed.
  - **The search matches a label, its PATH, and its section name — but the section only when
    that name is drawn.** The path costs no data to keep in step and is what makes `admin` find
    all thirteen settings screens after the sections were renamed, and `obligation` find
    Calendar words, whose label says nothing about obligations. The section is excluded for a
    one-screen group because its name is never on screen: typing `work` returned Home, which
    lives in a section called Workspace, and a hit that cannot explain itself is the same fault
    as one that moves the furniture.
  - **A group of one is a plain link.** Home behind a chevron is a click added to reach the
    thing a sidebar is most used to reach.
  - **Children carry no icon.** An icon separates things sitting beside each other at the same
    level; inside an open group they would be five marks in a column repeating what the head
    already said.
  - **Below 60rem the sidebar folds into a horizontal strip, and the groups FLATTEN into it**
    (`display: contents`) rather than rendering a vertical block inside a row. A collapsed
    group still renders no children, so tapping its head is how the strip reveals them — which
    is why the chevron stays. Watch `width` rules here: `.nav-top { width: 100% }` was
    invisible in the column (a flex column stretches its items anyway) and made every row
    2100px wide in the strip. One rule, two layouts, wrong only in the one nobody looks at.
- **A ROW OF BUTTONS IS `.cluster`, NEVER `.row`.** `.row` is `justify-content: space-between`
  — right for a heading with a control at the far end, and it flings two buttons to opposite
  edges of a card. `.cluster` is the one that sits things beside each other with a gap. **And
  `.gap` does not exist**: `className="row gap"` reads like it asks for spacing, was in
  committed code in five files, and put Approve 941px from Decline on a client's own page. A
  class that is not defined fails silently, which is why this is written down rather than
  assumed.
- **Accessibility comes from the components.** `<Field>` wires label/hint/error and the ARIA
  that goes with them; `<Tabs>` is a real tablist with arrow keys; `<Dialog>` is the native
  element. Do not hand-roll any of the three.

If a screen needs something the system does not have, add it to the system — deliberately,
in one place, for everybody. Do not solve it locally.

**Everything above still describes screens that have not been migrated, which is most of them.
There is now a SECOND vocabulary beside it — read the next section before touching either, and
in particular before putting a Tailwind class on an element that already has a design-system
one, which silently does nothing.**

## Tailwind and shadcn — the SECOND vocabulary, and the rules that make it safe

There are now two ways to build a screen here, both live, and which one a file imports says how
far it has been migrated:

```
@/components/ui  + src/design/*.css     the design system. Unlayered CSS, class per component.
@/components/tw                          the same ideas in Tailwind utilities.
@/components/shadcn                      Radix-backed components the design system does not have.
```

**Neither is deprecated yet.** A screen imports one or the other; see the mixing rule below.

### Preflight is OFF, and `data-tw` is the other half of that

Tailwind's global reset would land on 2,844 lines of hand-written element styling and change
every screen at once, silently — so `src/design/tailwind.css` imports `theme` and `utilities`
and never `preflight`.

The consequence people miss: **a bare `<button>` therefore keeps the browser's own grey
`outset` chrome**, because resetting that is exactly what preflight does. The product's own
buttons never noticed — `.btn` resets them. A shadcn component has none, and the first rebuilt
screen came out looking like Windows 98.

So a scoped reset lives in `@layer base`, gated on `[data-tw]`, and **`<Page>` from
`@/components/tw` carries that attribute**. A migrated screen starts with `<Page>` or its
controls are unstyled. That attribute is the migration boundary, visible in the markup.

### Utilities are LAYERED, and that is the safety model

`components.css` and `layout.css` are unlayered; utilities are in `@layer utilities`; `base.css`
is in `@layer base`. **Unlayered CSS beats layered CSS whatever the specificity**, so:

- the design system wins every collision, and adding Tailwind could not disturb an unmigrated
  screen — which was proved by diffing the emitted stylesheet, not by looking;
- utilities beat `base.css`'s element defaults, which is what stops `button { color: inherit }`
  putting dark ink on a maroon button;
- **a utility loses to a design-system class ON THE PROPERTIES THAT CLASS DECLARES.**
  `className="card p-4"` silently keeps the card's padding, and `<Meta className="mb-6">` gets
  no margin at all because `.meta` sets `margin: 0`. This is the one that will bite you — and
  it bit twice in one file on 2025-09-05, both times invisibly.

  The corollary matters as much and reads the other way: a utility for a property the class
  says NOTHING about DOES land. `.btn` never declares `justify-self`, so
  `<Button className="justify-self-start">` is the right way to stop a button being stretched
  by a `.field-row` grid — measured, 68px against the 551px cell. Read the class before
  assuming either outcome; the answer is per PROPERTY, never per element.

**Mixing is fine at the COMPONENT level and not at the ELEMENT level.** `<Tabs>` or `<Button>`
from `@/components/ui` inside a `<Page>` works, because `.tab` and `.btn` set their own padding,
background and border and the scoped reset cannot reach them.

### `@theme` maps onto the real tokens, and two names are traps

Tailwind's default palette, type scale, radius and shadow scales are **deleted** with
`--color-*: initial` and friends. `bg-red-500` is a build error, not a second palette. Spacing
is not remapped because it did not need to be: `--s-1`…`--s-7` is exactly `p-1 p-2 p-3 p-4 p-6
p-8 p-12`, and those seven numbers are the whole ladder.

Two names do NOT mean here what they mean in shadcn's own docs, and both were bugs first:

- **`accent` is shadcn's neutral hover ground**, mapped to `--surface-hover`. This product's
  status teal is `ok` / `ok-wash` / `ok-ink`. Wiring them together painted "today" on the
  calendar as a solid green block — a status colour spent on furniture, which `tokens.css`
  forbids outright.
- **`--font-*` is deleted entirely.** Tailwind's font namespace is spelled `--font-sans` /
  `--font-mono`, which are the exact variables `next/font` defines in the root layout. Not
  declaring them is not enough — Tailwind's default theme ships both, and only the cascade was
  keeping the webfont alive.

### shadcn writes to `src/components/shadcn/`, never `components/ui/`

`components.json` says so, and it matters: the CLI overwrites by filename, and `ui/button.tsx`
already exists. **Never run `npx shadcn init`** — it rewrites `globals.css` with its own
palette, which is the second palette this whole file exists to prevent. The project was wired by
hand; `shadcn add <name>` is fine, and read the diff.

**No `lucide-react`.** `@/components/ui/icon` is the icon set — one family, 24-unit box, 1.75
stroke. When grepping it for what exists, match `[a-zA-Z]`: half the names are camelCase and a
lowercase-only pattern reports an empty set, which is how three chevrons got drawn twice.

**`ui/dialog.tsx` stays.** It is the native `<dialog>` driven by `showModal()`, so the browser
owns the focus trap, Escape, the inert background and the top layer. Radix reimplements all of
that on a `<div>`. `ui/tabs.tsx` likewise already has the full ARIA tablist with arrow keys,
Home/End and a roving tabindex. The hand-rolled one genuinely worth replacing is `menu.tsx`.
Since the audit of 2026-10-03 (CA#17) it is at least never clipped: a button with a
`popover="auto"` panel in the TOP LAYER, placed under its button when it opens, so a `.tablewrap`
(overflow plus paint containment) can no longer cut "More" down to a 10px strip. The browser
gives it light dismiss and Escape; arrow keys are still not there.

**Who can supply what a letter lacks (CA#2 / CA#3).** `lib/ui/who-may.tsx`: `useWhoMay(permission)`
names the active colleagues whose role holds a permission (roles and colleagues the login can
already read), and `StandardsHelp` says, on the send panel, the letter page and an empty "Add all
standard terms", where a missing opening or missing terms come from: links to Standard wording and
Standard terms for a login with `tenant:admin`, the names of who has it for anybody else.

### Dates live in `@/lib/day`, and two of the four are opposites

`browserDay` · `longDay` · `longInstant` · `localDate`, defined once each.

- **`longDay` SPLITS a `YYYY-MM-DD`.** A statutory deadline is the same day for everybody, and
  `new Date("2026-09-20")` is UTC midnight, which prints as the 19th west of Greenwich.
- **`longInstant` PARSES a `...At`.** One moment lands on different days in different places and
  the reader's own is the right one. It formats by hand rather than through
  `toLocaleDateString`, whose ORDER is the reader's locale.
- **`browserDay` is never `new Date().toISOString().slice(0, 10)`.** That is the UTC day, and a
  firm in India is on the next date from 00:00 to 05:30 every morning — five screens shipped
  with it and under-reported what was overdue for five and a half hours a day.

Before this there were six `browserDay`s and nine `longDay`s in four versions. If you need a
date formatter, import it; do not copy the nearest one you find.

- **A company's document is NOT dated on `browserDay` (0337).** Each of the firm's companies has
  its own year and time zone, and the API dates its invoices, letters, acceptances, credit notes
  and raised bills on THAT company's day. So Issue, the due date, credit notes, Raise, refunds,
  every letter Send (builder and letter page), a signature recorded by hand and the letter
  preview send no `asOf`; a sentence that names the day Issue will use reads the invoice's
  `issuesOn`. **A recorded acceptance is the exception:** its date is the RECORDER's statement,
  so it sends `asOf=browserDay()` (letters and proposals), which the API holds to the company's
  day or one either side. A year label is the API's (`financialYearLabel` on an
  invoice, `label` on a series: `2026-27`, or `2027` for a calendar-year company), never built
  from `financialYear`. Reminders and buckets ("Overdue", "Today") stay on `browserDay`.
  Your firm → Companies shows "Year and clock" and sets both in Add / Change
  (`src/app/admin/firm/company-calendar.tsx`).

### The heading ladder is part of the component API

`PageHeader` gives `h1`, `Section` gives `h2` at `level={2}` and `h3` otherwise, `CardTitle`
gives `h3`. **`Section` defaults to `h3`, so a page whose one section forgets `level={2}` jumps
`h1` → `h3`** — which is what three portal screens were doing. Read the ladder off the DOM after
porting a screen; it is invisible in the source.

## Writing for the screen (Wave 4, 2026-09-28)

The people using this are staff of CA and professional-services firms, about 90% of them over
35, at a desktop, reading figures all day, and not technical. The user's words: *"extra extra
heading nhi chaiye … user ko samjh aye krna kya hai … ai generated nhi dikhana hai …
placeholder text ko distinguish krna hai … har column k neeche jo description hai usko short
and non ai generated banana hai"*. The full brief is
`bib/prompts/entity-proposal-builder/W4-UX-BRIEF.md`; these are its rules for WORDS.

**This overrides the older habit, all over this file, of "saying it on screen".** The reasoning
a screen used to carry in a paragraph belongs HERE, in CLAUDE.md, and in the code's comments.
The screen says what is set and what to do.

1. **One primary action per screen**, in the brand colour, where the eye lands (top right, or
   the section's head). Everything else is secondary or quiet.
2. **The title says what the page is for** ("Your firm", "Proposals"), and no paragraph follows
   it. No eyebrow repeating the sidebar section. If a screen needs a sentence of guidance it is
   ONE line, placed where the user acts, not at the top.
3. **Fewer headings.** None that repeats the page title; no card title + subtitle + hint stacked
   up; a section heading only when the page has two or more sections.
4. **Short, specific, active, second person**: "Add a company", "Who signs your letters". None
   of "This is where…", "Note that…", "deliberately", "honest", "on purpose", "because…". No
   justification sentences.
5. **A hint is one line, about 10 words at most**, and only where the label is not enough. Most
   fields need none.
6. **An error says what is wrong and how to fix it**, in one sentence. The API's own message is
   still shown verbatim where it arrives (see "What the API tells the user, we show").
7. **A placeholder is an EXAMPLE and starts with "e.g."** ("e.g. 10x Global FZCO"). Never a
   plausible value, never a default in disguise: prefill a box only with the real default.
   `npm run check` enforces it inside a `<Field>` (`scripts/check-placeholders.mjs`).
8. **An empty value reads "Not set"** (`<NotSet />`), muted italic: never a blank, never an em
   dash, never a zero. Say it more precisely only when it helps ("Not sent", "Not yet").
9. **Words, not codes.** "New", "Referral", "Declined", "Monthly", never `new` / `referral` /
   `rejected` / `one_time`. A firm's own names (its Depts, services, states) are shown as the
   firm wrote them; `codeLabel` or a words map in `client.ts` is for the product's own enums.
10. **No em dashes** in UI text.

Before and after, from the three reference screens:

| Where | Before | After |
|---|---|---|
| `/leads`, under the title | "Every prospect the firm is talking to, the stage each one is at, and who is handling it. Capture a new lead at the bottom of the page." | Nothing. **Capture a lead** is the brand button top right, and opens the form. |
| `/admin/firm`, Deadlines hint | "The day you went live on this system. A filing whose legal due date falls before this day is not created and is not flagged as missed, because it was handled the old way. If you leave it blank, every past deadline is treated as open: bring in four hundred clients and the first morning is four hundred filings to decide on." | "The day you started on BiB. Older deadlines are skipped." (The reasoning is in the `/admin/firm` section below.) |
| `/leads`, filter box | label "Value at least", `placeholder="100000"`: an empty box that looked filled in | label "Value from", `placeholder="e.g. 1,00,000"`, muted italic |

## The Wave 4 foundation: type, tables, pills, empty values (2026-09-28)

What the three reference screens (`/leads`, `/admin/firm`, `/proposals`) are built from, and
what every later screen reuses. **Add a prop; do not rename one**: the sweeps depend on these.

- **Type.** Source Sans 3 (400/600/700, italic loaded, `latin-ext` for ₹) through `next/font`,
  base 16px, line height 1.5 (`--leading`), and nothing a user must read below 14px: the scale is
  `--t-xs` 14 · `--t-sm` 15 · `--t-md` 16 · `--t-base` 16 · `--t-lg` 20 · `--t-xl` 24 · `--t-2xl`
  32. IBM Plex Mono stays for TRUE code only: money, dates, counts and references are never in
  `.mono`. `.num` and `<time>` are the sans face with tabular figures now.
- **Contrast.** `--ink` is 17.7:1 on a card, `--ink-2` 9.9:1, `--muted` 5.5:1, `--faint` 5.0:1;
  in dark `--muted` is 6.4:1. **A data value is never painted `--muted` or `--faint`**: grey is
  for labels and meta. Measured with a script, both themes, 2026-09-28.
- **The Table** (`@/components/ui`): heads are sentence case 14/600 in `--ink-2` over one
  `--line-strong` rule (they were 10px mono capitals in `--faint` on a grey band); cells 16px
  full ink, rows at least 52px with a hover ground; `align="right"` is tabular figures.
  - **A whole-row link** is `<Tr linked>` with one `<RowLink href>` in it (the row's name), plus
    `<ThChevron />` / `<RowChevron />` at the end. The link's `::after` covers the row, so a click
    anywhere opens the item while it stays ONE link to a keyboard; any other control in the row
    is lifted above it. A Playwright `.click()` on another cell of such a row is refused
    ("subtree intercepts pointer events"): that IS the link under the pointer, so walks click by
    position (`clickAt` in `bib/demo-assets/tools/w4a-walk.mjs`).
  - **No card-in-card:** a `<TableWrap>` that is a DIRECT child of a padded `<Card>` drops its
    frame and runs to the card's edges, its first and last columns taking the card's padding.
  - **No bordered select in every row:** `<Select variant="quiet">` reads as its value with a
    frame only on hover and focus; `<Select variant="pill">` is a stage changed in place. Both
    are native selects, and both need an `aria-label` in a row.
  - **Free text in a cell** goes in `<span className="cell-text">` (capped at 24rem so it wraps):
    `max-width` on the `<td>` itself is ignored.
  - **Measure 1280, and measure `.tablewrap`.** The first pipeline hid 127px of columns at 1280
    (its owner and stage selects) while the page reported 0 overflow. Cell padding is 10px
    across for that reason. `bib/demo-assets/tools/w4a-cols.mjs <path>` prints each column.
- **Pills:** a wash and a word at 14/600, no border. `<Pill dot>` is a STATE (a dot and a word:
  "New", "Sent", "Lost"); leave the dot off a label or a count. `tone="code"` is a small outlined
  badge for an identifier ("IN", "AE") in the sans face.
- **Empty values:** `<NotSet />` ("Not set", muted italic). `<NotStated>` renders the same and now
  defaults to "Not set" too.
- **Placeholders:** muted italic everywhere (`base.css` `::placeholder` and `.input`), and an
  "e.g." inside a `<Field>` (the check below).
- **The placeholder check** runs in `npm run check` (`check:copy`). It parses every `.tsx` with the
  TypeScript compiler and flags a literal `placeholder` inside a `<Field>` that does not start
  with "e.g.". Older screens are listed in `scripts/placeholder-baseline.json` with their count
  on 2026-09-28: a file may go down from its number, never up. **After fixing a screen, lower its
  number** (or run `node scripts/check-placeholders.mjs --update`).
- **Words:** `codeLabel(code)` in `client.ts` ("one_time" → "One time") for the product's own
  enums; `PROPOSAL_STATUS_WORDS` for the one that reads differently (`rejected` → "Declined", the
  client's own button).
- **Category tints** `--cat-1…--cat-4` (each with `-wash` and `-ink`) for GROUPS, first the
  Catalogue's Depts: see the colour rule above. They never mean good or bad.

## Wave 4 brought together, and what walking it found (W4D, 2026-09-28)

`feat/w4-ux` is `feat/w4-foundation` with `feat/w4-catalogue`, `feat/w4-commercial`,
`feat/w4-delivery` and `feat/w4-admin-portal` merged in (two conflicts: the placeholder baseline,
re-run with `--update`, and one hint on the letter page). Over the merged branch:

- **Consistency is measured from the rendered page, not the source.**
  `bib/demo-assets/tools/w4final-sweep.mjs` opens 79 screens at 1280 and 1440 on the four
  sessions' own firms and counts computed styles. On 2026-09-28: 620 table heads in ONE style
  (14/600, `--ink-2`; the other 20 are the chevron column's quiet "Open"), 632 pills in one
  style, the calendar's weekday letters moved up from 12.8px to 14px, data cells 16px in full ink, and 0 of: rupees in
  western grouping, `.00` figures, "Rs", em dashes, page overflow, hidden table columns. What it
  still lists is deliberate: mono on true code (a content hash, permission keys, the audit
  record's event codes, ids in a support disclosure), the import template's example dates and
  entity-type words (they describe the sheet), and a vocabulary screen's own codes.
- **A placeholder that shows what a BLANK box prints starts "Blank prints:"**, not "e.g.". The
  letter page's "Tailor the wording" boxes show the catalogue's words there, because that is the
  real default and not an example. It is the one exception to rule 7 of "Writing for the
  screen"; the check only reads literal placeholders, so it never sees this one.
- **The client's page (`/p/[token]`) totals per frequency (D8).** It drew one "Total ₹70,000"
  for ₹45,000 a month and ₹25,000 once, a number nobody is ever billed, and no line said how
  often it fell due. Lines now carry "How often", and the totals are one per frequency. The
  shared read has no per-frequency sum, so the nets are added in the browser with
  `addDecimals` (`lib/money`), which takes the API's four-place strings (`"25000.0000"`) exactly;
  `toMinorUnits` is for what a person types and refuses them. With one frequency the API's own
  total and its discount note stand.
- **The Files panel (`lib/ui/documents`) is four columns**: title (file name, size, day and who
  filed it on the line under it), what, client can see, actions. As seven it hid the Download
  button on the proposal page (149px at 1440). Its day is "28 Sep 2026" like every other date.
- **A long company name is the test a table has to pass.** "W4D Walk Traders … Private Limited"
  put `/proposals` 76px and `/leads` 11px past a 1280 screen that every seeded firm passed. The
  first column of both is capped (`block max-w-* whitespace-normal`, as the Catalogue's). Seed a
  client with a real-length name before measuring a list.
- **Money on the screen is `formatMoney` only.** The proposal and letter documents keep the
  PDFs' own words (`pdfMoney`, `letterMoney`: "INR 1,250,000", en-US grouping), because the
  preview must say what the paper says. The PDFs themselves group INR the western way; that is
  the renderer's choice (`render-source.ts`), a backend question, and it is written into the
  handover rather than changed here.
- **Found by the walk, fixed 2026-09-28:** "Raise an invoice" opened "Charged by" on the first
  company in the list (the Gulf one in the test firm), so an Indian client's invoice was
  numbered in the Gulf company's series unless somebody changed the select. It now follows the
  client's letters (the company that signed them charges); see "The billing screens" below.
- **The email's Accept link names the API's `BIB_APP_BASE_URL`.** The shared Wave 4 API was
  started with W4A's web port, so a walk on another port follows the token path, not the origin.

## Wave 5: the Aurora shell, quiet motion, and our own charts (2026-09-29)

The user's cut, and it binds: on the frontend QA runs, **only the sidebar and the page ground
change** (Aurora glass), no text, no font, no other redesign; then **decent, not bold** motion on
buttons and headline numbers, and **charts in shadcn's look without its library**. Brief:
`bib/prompts/entity-proposal-builder/W5-AURORA-SHELL.md`.

- **The ground and the glass are atmosphere.** `--aurora` (a mesh of four soft lights, a shine and
  a fine grain; a low cool version in dark) is painted ONCE on a fixed `body::before`, never
  `background-attachment: fixed` (repaints on scroll; iPhone Safari stretches it). The sidebar is
  frosted glass (`--glass-*`, `--r-lg` 18px, the one third radius). Nothing on a card, pill, button
  or line of text takes a colour from either, so the status and brand rules stand. The builder's
  sticky footer and the cards were left as they were: the user's call, not W5's.
- **The top bar is glass on the sidebar's line** (the user, after the first build: the full-width
  band met the floating sidebar in a notch at the top-left). Both panes start one gutter down, same
  radius and glass, one gutter apart. The header is sticky at 0 and `--topbar-h` + a gutter tall;
  its `::before` is the bar, its `::after` the body's own ground (same fixed full-window box, same
  background) clipped to the header's corner of the window, so a scrolled page never shows in the
  gutter. Measured pixel-identical to the ground. Folded (60rem) the bar is a second strip under
  the first and scrolls away with it.
- **The sidebar's LIST scrolls, not the sidebar.** As the scroller, the whole sidebar pushed the
  account block (name, Your account, Sign out) under the window's bottom edge as soon as a group was
  opened. The brand, search box and account block stay put; `.sidebar > .nav` scrolls, with 4px of
  padding for the focus ring. The Next dev badge sits bottom-right (`devIndicators`), off Sign out.
- **The page mounts once.** `AppShell` used to return the page bare until `/auth/me` answered and
  then again inside the frame, so every screen was built twice per load (two "Loading"s, its reads
  twice, a count-up run twice). The frame now renders from the first paint with the page in the
  same place; only the links, the account and the firm's name wait for the answer.
- **Motion lives in three places and nowhere else.** A `.btn` (and the shadcn button) rises 1px onto
  `--shadow-sm` under the pointer and settles to `scale(.98)` pressed, quicker than it rose; never
  on a disabled, `aria-disabled` or busy button, never on `link`, no shadow on `ghost`. A headline
  figure counts up ONCE (`<CountUp>`, `--dur-count` 500ms). A chart draws itself in once. All three
  stop under reduced motion (`useReducedMotion` in `src/lib`, plus the CSS blocks).
- **`<CountUp>` never makes money a JS number.** Each frame is the amount's `bigint` units at its own
  scale (`scaledUnits` in `lib/money`, which takes the API's four-place strings that `toMinorUnits`
  refuses) times an eased per-mille step, printed by `formatMoney`; the last frame is the final text.
  The final text holds the width invisibly under the counting one; a screen reader hears only the
  final value. `<Stat>` (both) counts a NUMBER value on its own and money when given `figure`, and
  prints exactly what it did before at rest. Never in a table cell, pill, date, tab count or the nav.
- **The chart kit is ours** (`src/components/ui/chart`, `<BarChart>` / `<AreaChart>`), and a screen
  imports each chart's own FILE, not `@/components/ui`: that barrel is not tree-shaken, and
  re-exporting the kit there put ~4 KB gzip on every route (measured). Plain SVG in
  real pixels from a `ResizeObserver`, the words as HTML over it, no dependency. Geometry is a per
  mille of a round axis worked out on `bigint` (`commonUnits`, `perMille`); ticks are `axisMoney`
  ("₹1 L", "₹50K", "AED 5K"); every figure a person reads is `formatMoney`. Pointer and keyboard
  (arrow keys between marks) show the same tooltip; "Show as a table" under every chart, so a tooltip
  never gates a number. The drawn marks are pointer-transparent: a bar that swallowed the pointer
  showed no tooltip when hovered, found by probing it.
- **`--chart-1`** (#2f6fe0 / #5b8fe8) is ONE data series, never good or bad and never a Dept; where a
  chart's colour IS a status (the ageing bars) it is `--muted` / `--danger`, with a legend in words.
- **`/receivables`**: a strip (Outstanding, Overdue, each with its invoices) and "How late the money
  is" (the dashboard's six buckets, lateness from `browserDay()` via `daysBefore`) beside "Who owes
  it" (top six, then Everyone else), from the SAME rows as the table, no new call. **Different
  currencies are never added together**: the rows carry no rate, so a firm owed in several gets a tab
  per currency. Nothing when nothing is owed, or when the amounts are hidden from the login.
- **`/dashboard` "Billing by company"**: small multiples, one area chart per company in its own
  currency (they cannot share an axis; four hues on one chart failed a colour-blind check), four in
  a row at 1440, and "All companies, in INR" above them from the API's per-month total. A company
  with fewer than two months that have invoices says "Charts appear once two months have invoices."
  instead of drawing empty axes. The read is `GET /dashboard/revenue/by-company` (backend CLAUDE.md,
  "Billing by company").
- **Weight**: no new package. First-load JS, gzip, before and after W5: `/receivables` 151.5 ->
  156.5 KB, `/dashboard` 159.9 -> 166.0 KB (page code plus the area chart), every other screen about
  +1.4 KB (`CountUp`, which `<Stat>` uses). Measured from `.next/diagnostics/route-bundle-stats.json`
  (Next 16 prints no sizes); `bib/bib-wt/w5-route-sizes.mjs`. Fixture: `bib/demo-assets/tools/w5-fixture.mjs` (four
  companies, six months, a credit note, a cancelled invoice, 16 clients owing in four currencies).

## The screens, and what they are for

| Route | Is |
|---|---|
| `/login` | email + password → the httpOnly session cookie |
| `/` | **My day** (V2.1), where staff land: everything on the reader's desk (tasks, steps, checks to decide, client requests, escalations) as ONE list in Overdue / Today / This week / Later. Clients land on `/portal` |
| `/copilot` | **AI Copilot** — answers 404 unless `NEXT_PUBLIC_BIB_COPILOT=on` (S7, 2026-10-05: unreleased features are not shown); no sidebar link. The screen is kept in `copilot-chat.tsx` |
| `/admin/firm` | **Your firm** (Wave 4: "The firm itself" and "Our companies" merged): **Setup** first (V2.6: eight readiness lines, each Done or To do with what is missing and a link to the screen that fixes it, `#setup`), then **Companies** (the firm's own companies, **Add a company** in a dialog, Change, a More menu to each one's logo and wording, and the country-to-company table, where a pick saves), **Signing** (who signs and as what), **Deadlines** (count from, and the financial year's first month), and the **discount limit** (moved from the Catalogue; published in the same act). One sidebar link |
| `/admin/companies` | redirects to `/admin/firm#companies` so old links land |
| `/admin/people` | the firm's roster — add somebody, change a role or grade, say who they report to, revoke or restore access |
| `/admin/roles` | what the firm's roles MEAN: permissions per role, published as versions |
| `/admin/grades` | the firm's seniority ladder — add a rung, rename it, re-rank it, retire it |
| `/admin/structure` | the firm's Depts and delivery teams, and which of them (if either) splits a client's work |
| `/admin/workflows` | how the firm does its work — the steps a job walks, written once, each with its sub-steps and, where somebody checks it, the checker's review points |
| `/admin/request-templates` | **what clients are asked for each period, and by when** (F1.7): each template's items (what the client reads, document / question / approval, what a file is filed as, ask and due days after the period ends), drafted then published. A process step names a published one under "Ask the client for" |
| `/admin/verification` | who may check somebody else's work — the firm picks the rule; maker≠checker is not on the page |
| `/admin/escalation-ladder` | when the firm hears that its own work has gone quiet — the rungs, and who each one tells |
| `/admin/client-reminders` | when a CLIENT hears from the firm — the chase ladder (forward from the day we asked, stopped by a freeze) and the heads-up ladder (back from a statutory date, not stopped by one). Two config kinds, one screen. |
| `/clients` | the firm's book — every counterparty, and the caller's OWN clients |
| `/clients/[partyId]` | party 360: the account team, identifiers, registrations, relationships |
| `/clients/import` | **bring in the book** — the firm's existing clients, people and engagements from spreadsheets: templates, upload, the report (blocking / warnings), confirm, and what each row became. `tenant:admin`; offered from `/clients` |
| `/leads` | the pipeline — capture with dedup, stage, ownership |
| `/proposals` | what the firm has quoted; **New proposal** opens the builder |
| `/proposals/new` | the builder's step 1 for a proposal not yet drafted (T6.18): the client (or a new prospect, who becomes a lead), which of the firm's companies issues it, the currency, the cover. `?clientPartyId=` / `?leadId=` arrive with the client chosen |
| `/proposals/[proposalId]/build` | the builder on a draft, `?step=client\|services\|preview` (T6.18): the catalogue by country with prices in the document's currency, then the document itself editable in place with the Send panel under it. A sent proposal opens on the preview |
| `/proposals/[proposalId]` | one proposal AS A DOCUMENT, editable in place on a draft (T6.18), and the Send panel under it (email, WhatsApp, PDF, the client's answer); below them its services with the catalogue version and list price each was pinned to, its files, and deleting a draft made by mistake (0086). A draft's header offers **Edit in the builder** |
| `/p/[token]` | **PUBLIC** — the proposal as its recipient reads it, where they accept or decline it and download its PDF (0085). No session. |
| `/engagement-letters` | what the firm has AGREED, and drafting a new letter |
| `/engagement-letters/[letterId]` | one letter: its sections and fees, its services and their wording, its terms (and **Add all standard terms for <issuer>**, T6.18 D6), its signature, and the engagements it created — and deleting a draft made by mistake (0086) |
| `/catalogue` | what the firm sells, as ONE table (W4B): code, service, Dept (a tinted chip and row edge), countries, price ("AED 4,000 / month"), filings, status (Live / Draft / Unpublished changes). Search, country chips and a Dept filter, the last two in the URL. Read on `config:read`; **Add a service** (the brand button) on `tenant:admin` |
| `/catalogue/new` | **Add a service**: Basics, Price (the currency follows the country), What's included, and the compliance filings (`NewServiceFilings`, sent once the service exists). **Add the service** publishes it; **Save as draft** does not. The key is made from the name |
| `/catalogue/[serviceKey]` | one service: tabs **Overview · Price & billing · Compliance filings · History** (`?tab=`). **Edit** opens the form and saves a new version (a draft, "Unpublished changes", with what it changes listed) or saves and publishes; **Publish** puts a waiting draft in force. The compliance filings tab is the ONE place a filing is linked to a service (T6.16) |
| `/admin/standard-terms` | the clauses letters are built from (moved from the Catalogue, W4B): tabs **Default · <each company>**; Default = terms naming no law (on every letter), a company = terms under its country's law (D6). **Write a term** writes and publishes in one act; read on `config:read` |
| `/invoices` | what the firm has BILLED, and raising one. Tabs (`?tab=`): **Invoices** · **To raise** (bills that have fallen due, auto-invoice 0318) · **Billing not set up** (recurring engagements with no schedule) |
| `/invoices/[invoiceId]` | one invoice: its lines, what has been paid and credited, and what is left |
| `/receivables` | who owes money — and the dunning steps waiting for a partner's decision |
| `/admin/document-blocks` | the firm's standard prose, copied onto every new document — including the cover letter and the acceptance every engagement letter opens with. Tabs **Default · <each company>** (T6.18): per kind, a company uses the Default until it writes its own (`?company=<partyId>` picks the tab) |
| `/admin/brand` | the logo, signature and letterhead each of the firm's own companies issues under |
| `/dashboard` | the firm's own numbers — MRR, what it is owed, how long it waits, and what the figures could NOT count |
| `/admin/territories` | whose desk covers which country |
| `/work-items` | the board — what is owed, whose desk it is on, what is late, what is waiting to be checked, and what the ladder has escalated |
| `/work-items/[workItemId]` | one task: its checklist, what it waits on, what the firm has asked the CLIENT for, and every review it has been through |
| `/admin/work-vocabulary` | the firm's own words for work — the states a task moves through and how urgent it can be |
| `/calendar` | the compliance calendar — what each company owes and by when, WHY an engagement produced nothing, and the deadlines waiting on a partner's decision. A filing taken off when a service stopped including it is not shown (the API leaves it out) |
| `/admin/obligation-vocabulary` | the firm's own words for that calendar — the states a filing moves through, and what may be decided about one that was missed |
| `/admin/obligation-rules` | **the LIBRARY**: what the law asks of a client, and when — write the due formula, add a carve-out, confirm a date, set T–X, retire a rule, and see where each rule is USED. No service is chosen here, and a rule no service uses adds nothing to the calendar |
| `/work` | the delivery board — what a signed engagement turned into |
| `/work/[jobId]` | one job's process: its steps, who each is waiting on, each step's sub-steps to tick (or mark not applicable with a reason), the Done button, and Approve / Send back with the check's review points |
| `/audit` | every state transition, and any object's own timeline via `?type=&id=` |
| `/portal` | **THE CLIENT'S APP** — what the firm has ASKED THEM FOR and where to answer it, **what they have asked the FIRM for**, what it is doing for the companies this contact was granted, what is held up, and what has been filed. A CLIENT_PORTAL session only; a staff one is sent back to the workspace |
| `/portal/documents` | **THE CLIENT'S LIBRARY** — every document the firm has shared with them, searchable, and each one downloads. NOT windowed: the whole point is finding last year's challan |
| `/portal/invoices` | what the firm has billed them and what is still outstanding. Drafts are not here; a cancelled invoice IS, and is marked |
| `/portal/month` | one calendar month of what the firm did — filed, added, billed, and what the client sent back. A SCREEN, not an email |
| `/client-requests` | **THE OTHER DIRECTION** — what clients have asked the FIRM for, unprompted. Mine / Unassigned / Everything, with the reply box, the attachment picker and Take it on the row |
| `/fin/intake` | **Files received** (FinCompliance F0.8): every file clients sent for their books since fin was switched on, which reader it goes to and why, counts per reader ("Needs a person" highlighted), client and reader filters in the URL, Show more. Only while `GET /fin/status` answers 200 and the role holds `books:read`; `app/fin/layout.tsx` says plainly when fin is off |
| `/portal/accept-invite` | **NO SESSION** — where an emailed invitation lands. Setting a password is what creates the login |
| `/auth/forgot-password` | **NO SESSION** — ask for a reset link. Answers the same sentence whatever happened, because the API answers 202 to everything: a friendlier "we found your account" is exactly the leak the 202 prevents |
| `/auth/reset-password` | **NO SESSION** — where a reset link lands. Choosing a password replaces the old one, revokes every session the account held, and signs this one in. A FORM, not an effect: nothing is spent by arriving, so a mail scanner that follows the link burns nothing |
| `/account` | **yours, not the firm's** — your password, and only that. Role, grade, reporting line and access are the firm's and live on `/admin/people` |
| `/portal/account` | the client's half of the same card. The audience that most reliably HAS a password, and before this the only one that could not change it |

## The client portal is a SECOND AUDIENCE'S APP (T6.5)

Everything above is the **10X Workspace**, read by the firm. `/portal` is read by the firm's
CLIENTS, and the two share a design language and nothing else.

- **`AppShell` treats every `/portal` route as bare**, and `src/app/portal/layout.tsx` renders
  its own frame instead. The staff sidebar is a map of twenty-six screens and an org switcher;
  a client has one screen and no map, so that nav would be a column of links they cannot follow
  — the same argument `isBare` already makes about `/login`, reached from the other end.
- **The frame names the FIRM and the COMPANY, and both matter.** A portal is a page about
  somebody's own affairs sent by somebody else: without the firm's name the reader does not
  know who is doing the work, and without the company's a contact for two group companies
  cannot tell which set of filings is on screen. Both come off `/auth/me`, resolved once by the
  API — `portalScope` is `[{clientPartyId, clientName}]`, the same shape the portal home's
  `companies` uses, deliberately.
- **`/login` routes by AUDIENCE.** A client contact sent to `/` lands on the staff home with an
  empty sidebar and every screen behind it answering 403 — the audience gate working exactly as
  designed, and reading as a broken app. `audience` answers it when a firm is chosen; when it is
  null (somebody in more than one firm) the memberships decide, and only when EVERY one of them
  is a portal login.
- **`/portal/accept-invite` renders with no session and must keep doing so.** The token IS the
  authorisation — setting a password is what creates the login — so the frame exempts that one
  route rather than bouncing an anonymous visitor to `/login` at the moment the emailed link is
  being used.
- **NULL and `[]` on `portalScope` are different facts and must never draw the same.** Null is a
  staff session (the question does not apply); empty is a contact who has been invited and
  granted nothing, and the page says so at length, naming the firm to ask. A blank page there is
  indistinguishable from broken software, which is the whole reason this screen exists.
- **NO DEADLINE THIS PRODUCT INVENTED.** A statutory date is shown because the law set it;
  everything else shows how long the work has been open. The API carries `statutoryDueOn` as null
  on the rest, and the screen must not fill it in.
- **A date is split, never parsed.** `new Date("2026-09-20")` is UTC midnight and prints as the
  19th west of Greenwich, which on this screen moves a statutory deadline by a day. `longDay`
  splits the string; comparisons are string comparisons on `YYYY-MM-DD`.

**What opening it found, and no gate could have:** a heading reading "Filings coming up" over
five rows already past their date and marked Missed; the same filing listed twice, once as the
law's row and once as the firm's task; and two chip tones for the same kind of fact in two
tables. All three fixed, and all three invisible to typecheck, lint and the API.

## The self-serve library, and the nav the portal grew (T6.7)

**THE FRAME'S "ONE SCREEN, NO MAP" RULE STOPPED BEING TRUE, and it took two turns to land.** The
note above says a client's contact has one screen and that a staff-style column of links would
tell them how much of the product is not for them. Right for T6.5, wrong the moment the library
existed: **a library reachable only by scrolling past four sections of today's news is not
self-serve.**

The first attempt was a tab strip. **Then looking at it settled it (Shrestha, 2026-09-01):
"everything looks messy"** — the strip ran the full width of the window with four small labels
jammed at the far left, above a centred column of content, so the navigation and the thing it
navigated did not line up and the page read as half-built. Four sections is enough to deserve a
real frame, and the staff shell already IS that frame.

So the portal is `.shell` + `.sidebar` + `.main`, reusing `.brand`, `.nav`, `.nav-link`,
`.nav-icon`, `.sidebar-foot`, `.who`, `.avatar`, `.topbar` and `.crumb` **with not one line of new
CSS** — the rule `.portal` was written under, applied properly: *a different audience, not a
different design language.* What it does NOT copy is as deliberate: **no groups** (four items have
no structure to hide), **no search box** (searching four things implies there is more behind it —
the library has its own, over the thing a client actually hunts through), and **no firm switcher**
(a contact belongs to one firm's portal). It DOES carry icons, because the staff nav's own rule
says an icon separates things at the same level and it is nested children that carry none.

**The sidebar's foot names the COMPANY where the staff one names a role**, and that is the one
place the two shells say different things. `client_contact` / `client_viewer` is the firm's word
for what somebody may do; printing it would show a client a label about their own permissions that
they cannot act on. Which company they are looking at is the fact they need.

- **`/portal/documents` IS NOT WINDOWED.** The status home shows ninety days because it answers
  "what is happening now"; the acceptance line here is *"a client finds LAST YEAR's challan"*, and
  a window would make the one question the page exists for unanswerable. Filtered in the BROWSER
  across the title, filename and what it is about — a client has tens of documents, not hundreds
  of filings, and a round trip per keystroke would feel worse than scrolling.
- **IT IS A TABLE, and the search only appears above eight rows.** The first version drew a card
  per document, which reads well for three and is a two-minute scroll at thirty — and thirty is
  ordinary after a year on a list with no window. It also matches `/portal/invoices`: two lists of
  the client's own records drawn two different ways is how a portal starts to look assembled
  rather than designed. The search threshold is the sidebar's own argument again — a box over one
  document implies there is more behind it.
- **AND THE CLIENT'S OWN COMPANY NAME IS SHOWN ONCE.** A calendar-raised task is titled *"Quarterly
  TDS statements — Cobalt Foods Private Limited — Q1 FY2026-27"*, which is right on the firm's
  board where a hundred clients' work sits together and is the least useful third of the string on
  a page that client opened — it is already in the rail and the topbar. It was also wide enough to
  push the table into a horizontal scrollbar with ONE row in it.
- **THE DOWNLOAD IS A `fetch`, NEVER AN `<a href>`** — the same rule the staff `<Documents>` panel
  follows, and for one more reason on this side: there is no pre-signed URL in this product and
  there will not be one, so the bytes come back through a route that has passed every scoping
  rule, with the session cookie. It is also why the button can show that it is working and can
  show a refusal, neither of which a link can.
- **TWO EMPTY STATES, TWO SENTENCES.** "Nothing shared with you yet" tells a client to ask;
  "nothing matches what you typed" tells them to search differently. Drawing both as a blank page
  is the screen declining to say which is true — T6.5's own finding, applied a third time.
- **AND THE PAGE SAYS WHAT IS NOT IN IT.** A document appears because the firm marked it
  client-visible (migration 0066), so a client who cannot find something has to be told whether to
  look harder or to ask. That sentence is not a list of absences — see the footer note below.
- **`/portal/invoices` DOES NO ARITHMETIC.** Four figures per row, each a decimal string computed
  by `crm.invoice_balance`, printed as they arrived. There is deliberately no total across rows:
  adding money in a browser, across currencies this page cannot convert, is exactly what the
  money rule exists to prevent. There is no "pay" button either — payments are P11 and nothing in
  this product takes money, so a button would be the screen promising what the system cannot do.
  `dueOn` IS shown, and it is the one invented date this portal carries: it is already printed on
  the invoice the client holds, and hiding it would make the page disagree with a document the
  firm has already sent.
- **`/portal/month` SAYS IT IS A PAGE AND NOT AN EMAIL.** The board asks for a "monthly digest";
  transport is P10, so nothing is sent anywhere and the page says so rather than leaving a client
  wondering why their inbox is empty on the first. The months are built by decrementing an
  INTEGER, never `setMonth(m - 1)`, which on the 31st lands in the wrong month entirely — a bug
  that only shows for three days a quarter.

**THE FOOTER ON `/portal` HAS NOW GONE STALE TWICE, and the fix is not a third rewrite.** It said
*"sending files across is not here yet"* one paragraph below a working file picker (T6.6), was
rewritten to say invoices and documents were not here yet, and T6.7 built both — false again
inside one task. **A sentence that enumerates ABSENCES goes stale every time somebody removes
one, and nothing in a typecheck, a lint or a test can see it happen.** It points at where things
ARE now, which stays true as more arrives — and the nav is the actual fix.

### The two reminder dates, and why neither is a count

`lastRemindedAt` on an ask and `lastNudgedAt` on a filing are both dates, and both deliberately
omit the tally the database holds. *"We have reminded you 4 times"* is an accusation printed on
somebody's own page, and on a daily rung it reads "9 times" within a fortnight; what a client can
act on is WHEN — whether they missed a message. Null draws as nothing at all (an ask) or an em
dash (a filing), because a firm that has published no ladder reminds nobody and that is the
shipped state, not a failure to report.

**The FIRM's side is the opposite and that is the point.** `ClientAsks` on
`/work-items/[workItemId]` prints *"Reminded 3 times — first on …, second on …"*, because a
colleague who cannot see that the sweep has already chased this client will chase it again by
hand, and because "we asked you four times" is the sentence that needs evidence behind it.

### The client-visibility switch, and the panel that had to exist for it

`files.document.is_client_visible` decides whether a file is in the client's library, and it is
enforced by a database policy. **T6.5 named the failure this avoids on the work item's copy of the
same flag** — *a flag the portal enforces and no screen can change is a wall built against a value
nobody can move* — so the switch ships in the same task as the policy, as a column on
`<Documents>`.

That forced a second thing: **`/work-items/[workItemId]` had no `<Documents>` panel at all.**
`subject_kind = 'work_item'` exists so a client's uploaded answer files itself against the job that
asked for it, and the only thing on that page listing a file was the ask panel naming each
response's filename. The panel is mounted there now, with the task's client as `partyId` — which is
what makes the switch mean anything, since a document with no client belongs to the firm and has
nobody to share it with. The cell says so rather than offering a control the API would 404.

Flipping it RELOADS the list rather than patching the row: the flag is enforced by a policy, and
the one place a local guess must not stand is a control that decides who outside the firm can read
a file.

## The action centre — the only part of this product a client can DO (T6.6)

`src/app/portal/action-centre.tsx`, at the TOP of `/portal`, and it takes that place from "Held
up".

"Held up" was first because it was the only section a reader could act on, and it was doing that
badly: `blockedReason` is a note the firm wrote to itself, and it reads *"the client has not sent
the register"* as readily as *"the GST portal is down"*, with nowhere to reply either way. These
rows were addressed to this client deliberately and each carries the control that answers it.
Both sections stay — a firm may be waiting on more than one thing at a time.

- **Three kinds, three controls, and a fourth thing they all do.** `document` draws a file
  picker, `question` a text box, `approval` two buttons — and every one of them ALSO offers the
  text box, because *"we hold none, the shop closed in 2019"* is a real answer to a request for a
  document and the API accepts it. Making the honest answer unsayable sends it back to email.
- **`portal:respond` decides what to OFFER; the API's refusal is what gets shown.** A contact
  without it (`client_viewer`) sees every ask and is given no control. That is the whole
  difference between the two portal roles, and the reason reading is not behind a permission:
  being granted a company is the authorisation to read it. `/auth/me` reports a REAL permission
  list for a portal session now — it was a blanket `[]` until T6.6.
- **"Sent — with the firm" is a second section, not a filter.** A client's reply does not close
  an ask: the firm looks at what arrived and decides. Removing an ask the moment it was answered
  would leave somebody who sent the wrong file with no way to see what they sent.
- **THE FILE IS NOT SCANNED AND THE PAGE SAYS SO**, on the upload control and again beside the
  file on the firm's own screen. There is no scanner in this product; a page that quietly implied
  otherwise would be the lie the backend refused to write as a `scan()` returning "clean".
- **No due date anywhere, and no field to type one into** on the firm's side either
  (`work-items/[workItemId]/client-asks.tsx`). The firm has never published its turnaround times.
  **Reversed 2026-10-10 (F1.5, backend 0385):** a day the FIRM stated is shown; see "Request
  templates and an ask's due day" below.

`ClientAsks` on `/work-items/[workItemId]` is the other half: raise one, read what came back, and
**"Got what we needed" / "No longer needed"** — because `answered` is not `closed` and this is
where the second one happens. It sits below the client-visibility switch and says, when that
switch is off, that nothing asked there will reach them: the portal's read joins the work item,
so an ask about work a client cannot see disappears with the task.

**What walking it found, and none of it visible to typecheck or lint:**

- **The page said the request TWICE.** The action centre showed the ask with a file picker under
  it and "Held up" printed the identical sentence with nothing to do about it — T6.5's own
  duplication bug in a new costume. `hasOpenAsk` is on the work row now and the held-up card
  points at the ask instead of repeating it.
- **The footer started lying.** *"sending files across are not here yet — email 10x Global as you
  do now"*, one paragraph below a working file picker. **A sentence can go stale, and nothing in
  the toolchain can see it happen.**
- **A read-only contact was promised something.** *"if you sent the wrong thing, you can still
  send another"*, beside a card with no controls — and because all their asks were answered, it
  was the only sentence about them on the page.
- **And the pointer named the wrong heading.** *"it is under Waiting on you"* on an ask that had
  been ANSWERED and therefore sat under "Sent — with the firm". Found by reading the page again
  after answering something on it.

## Ask the firm, and the inbox it lands in (T6.8)

Everything on the portal before this was a REPLY. `src/app/portal/ask-the-firm.tsx` is the first
thing a client can START, and `/client-requests` is where it arrives.

- **IT IS NOT A FIFTH LINK IN THE RAIL.** T6.7 settled that a fifth has to displace one of the
  four or admit it is the firm's convenience — and this is not a fifth screen. It sits directly
  under the action centre because the two are one subject read from opposite ends: that section
  is *what the firm is waiting on you for*, this is *what you are waiting on the firm for*, and
  splitting them across two screens makes "what is outstanding between us" two answers.
- **THE SPLIT IS NOT THE ACTION CENTRE's.** An ask sorts by whether it still wants something FROM
  the client; a request they raised never does, so it sorts on whether the firm has come back —
  `awaitingFirm`, then `replied`. **`settled` is on this surface at all**, unlike a closed ask,
  because *"did I already ask for this"* is the question that stops the second phone call.
- **`portal:request` DECIDES WHAT TO OFFER, and it is not `portal:respond`.** A firm may want the
  clerk who sends the registers to go on sending them and not to open requests, so they are two
  permissions and `client_viewer` holds neither.
- **NOBODY AT THE FIRM IS NAMED ON THE CLIENT'S COPY OF THE THREAD.** `authorName` comes back NULL
  on every reply the firm wrote — the API drops it, not the component, because the FIRM's screen
  reads the same table and needs those names. The client's own colleague's name survives, because
  a company with two directors needs to know which of them asked.
- **ONE COMPANY NEEDS NO PICKER.** `/portal/documents`' search threshold applied to a control: a
  select with one option asks the reader to take a decision they cannot get wrong. The value
  still goes up on the write, and the database refuses any company this login was not granted.

**`/client-requests` SAYS OUT LOUD THAT NOTHING IS ASSIGNED.** There is no routing (0068), so a
reader looking for "mine" has to be told there is no such thing yet or they will conclude the
filter is missing rather than the decision. What makes an unrouted list workable is on every row:
which client it is from (a LINK — somebody has to work out whose this is), and where it stands.

**THE ATTACHMENT PICKER LISTS DOCUMENTS ALREADY FILED AGAINST THAT CLIENT**, and each option says
what sending it will DO — *"they already have this"* against *"not shared yet"* — because one of
those is a disclosure decision and the other is not. It is not an upload: file it against the
client first, which is the ordinary act and leaves it where the rest of their papers are.

### Routing, and the tab that would not exist on a naive list (T6.9)

T6.8 assigned nothing, because the firm had never said who an inbound request belongs to. It
still has not — so the firm gets a SWITCH on `/admin/structure` (`none` is the default and does
what shipped) rather than this product getting an opinion.

- **`routing` TRAVELS WITH THE LIST**, and the notice at the top reads it. An inbox where
  nothing is assigned because the firm routes nothing, and one where the rule ran and placed
  nothing, are the SAME PICTURE — T4.5's `ladderPublished` argument, and it is why this screen
  never just shows a blank Assigned column.
- **UNASSIGNED IS ITS OWN TAB.** Work the rule could not place, or nobody has taken — the same
  argument `/work-items` makes: unassigned work is only chased if somebody can list it.
- **"TAKE IT" NEEDS NO ROSTER, so everybody with `work:write` gets it.** Claiming is the verb
  people actually use on a firm-wide list, and the assignee is the caller. The full picker reads
  `/tenancy/colleagues` since 2026-09-25, as `/work-items/[id]`, the pipeline's owner dropdown
  and the account team form do — it was the admin roster before, and so appeared only to an
  administrator.
- **THREE SENTENCES, NEVER A BLANK.** "With <name>", "Nobody yet — <the rule's note>", and "On
  nobody's desk" are three different facts, and collapsing them into an empty cell is T4.5's
  blank-name bug in a new place.
- **THE ADMIN SCREEN SAYS A SPOC IS IMPOSSIBLE**, in words. A partner reading two options would
  otherwise assume the third is missing rather than unavailable — a SPOC covers a Dept, and a
  request names no service.

**And the assign picker is a labelled `<Field>`, not a bare select in the button row.** A
full-width dropdown with no label under two small ghost buttons reads as a control that lost its
label. Found by looking at the page.

### What walking it found, and none of it visible to typecheck or lint

- **`className="row gap"` HAS NEVER WORKED, AND IT WAS IN COMMITTED T6.6/T6.7 CODE.** `.row` is
  `justify-content: space-between`; **`.gap` is defined nowhere**. Measured on the live page: the
  client's **Approve and Decline buttons sat 941px apart**, at opposite edges of one card, with
  the destructive one where the eye lands last. **`.cluster` is the class for a row of buttons**
  — `display: flex; gap: var(--s-2)` — and ten occurrences across five files now use it.
- **A TIMESTAMP IS NOT A DATE, AND THIS FILE'S OWN RULE POINTS THE OTHER WAY.** *"A date is
  SPLIT, never parsed"* is about a `YYYY-MM-DD` column, where `new Date("2026-09-20")` is UTC
  midnight. `raisedAt` and `writtenAt` are INSTANTS, and reading their UTC fields showed a
  request raised at 00:20 in Delhi as **the day before the client made it**. An instant is
  formatted in the READER's zone (`toLocaleDateString`), which is what the action centre already
  did. **The field's TYPE decides which rule applies**, and getting it backwards is silent for
  everyone west of Greenwich in the evening and east of it before dawn.
- **THE FIRM'S SCREEN SAID ONE THING TWICE.** A "Waiting on us" chip beside a raw `open` chip —
  the same fact, and a machine word on a partner's page. This app's duplication bug for the
  fourth time. What replaced it says the three states a reader acts on, and the middle one — the
  client came BACK after the firm replied — is the one neither chip could express alone.
- **THE DOCUMENT PICKER LOADED ON ITS OWN FOCUS AND WAS THEREFORE ALWAYS EMPTY.** A native
  `<select>` opens the instant it is clicked, so the options arrived after the reader was already
  looking at "Nothing attached". It loads when the REPLY BOX is touched now — typing a sentence
  takes far longer than the round trip, and it is what every real use of the form does first.
- **AND THE SCREEN WANTED A FIELD THE API DID NOT SEND.** `clientPartyId` is on the firm's wire
  now and deliberately NOT on the portal's — the inbox needs it to find that client's documents,
  a client has no use for their own party id. Fixed in the API, per this file's own rule.

**The admin screens all need `tenant:admin`, and the sidebar deliberately does NOT group them by
that.** They were one section of thirteen on exactly that ground, and it was the wrong axis: a
permission every one of them shares is a fact about the API, not about what a partner is looking
for, and thirteen labels in a column get read top to bottom every time because "Grades" and
"Calendar words" sit the same distance apart as "Grades" and "Roles".

Nothing is lost by splitting, because the permission was never carrying information for any
reader: somebody who can see one of these can see all of them, and somebody who cannot sees none.
So they are three top-level sections, each a subject a partner would recognise:

| Section | Is | Screens |
|---|---|---|
| **The firm** | who works here and how it is shaped | The firm itself · People · Roles · Grades · Structure · Territories |
| **How work runs** | what puts work on the board, what it is called there, and who signs it off | Compliance rules · Calendar words · Processes · Work states · Who checks work · Escalation ladder |
| **Documents** | what a client actually receives | Standard prose · Brand |

**Three and not four:** the compliance rules do not get a calendar section of their own, because
at a CA firm a rule IS how work runs — it is the thing that puts the work there. **And they are
TOP-LEVEL rather than a third tier under Administration:** three levels means two clicks to reach
a screen and a chevron whose meaning changes with depth, which is the opposite of what collapsing
the nav was for.

`Territories` sits under **The firm** even though lead assignment is what reads it — it is the
firm describing itself, the same axis `Structure` is on.

**Roles and grades are not the same screen, and must not become one.** A role is what somebody
may REACH and it grants permissions; a grade is how SENIOR they are and it grants nothing —
it exists for one comparison, the firm's "Manager or above" review rule. Merging them would
imply a promotion changes what you can open.

`/admin/grades` offers **Retire**, never Delete, because there is no delete endpoint and no
DELETE grant behind it: a rung somebody held is part of why they could approve something. A
retired rung still renders on the person who holds it, marked retired, and the grade picker on
`/admin/people` offers it only to them — the API refuses it for anybody else, and offering
what will fail is just a slower error. The picker also offers "not graded" as a real choice,
because a portal contact belongs on no rung and taking somebody off the ladder is a decision.

The name and rank editors commit on **blur or Enter**, not per keystroke: every commit writes
an audit event, and per-keystroke saving turns one rename into twelve rows nobody can read
past.

Two things they get from the API rather than deciding locally, and both matter:

- **The role dropdown is the firm's own published roles.** Not a hardcoded list — a firm that
  invents `rm` sees it without a deploy, and a role that exists only as a draft is correctly
  absent, because a draft is not yet a role.
- **The permission set comes from `GET /api/v1/config/permissions`**, with its descriptions.
  Retyping it here would drift from what the backend actually checks, and on an
  access-control screen that means offering a permission that grants nothing or hiding one
  that grants everything.

**A permission check in this app decides what to OFFER, never what is allowed.** `/auth/me`
returns the permissions the session's role carries, so a link is shown only to somebody who
can use it — but every screen still shows the API's refusal verbatim when one arrives, because
the API is the only place the answer actually lives.

## `/` — My day, the one list of everything that is mine (V2.1, 2026-09-28)

A person's work was spread over the Work board, Jobs, two To check queues and Client requests:
about nine clicks and four screens, and nothing said what was due today. `/` is now **My day**,
and it is where staff land (`homeFor` sends them to `/`; V1.1 had sent them to the board until
this existed).

- **Six reads, one list, nothing per row.** `/work-items?mine=true&asOf=`, `/my-steps`,
  `/work-item-checks`, `/checks`, `/client-requests` (kept to the reader's desk) and
  `/escalations?mine=true`, in one `Promise.all`. The API grew what the rows needed rather than
  this screen fetching per row: `MyStep.job` and `StepCheck.job` (client and company by id,
  period, services, and the job's due day = its earliest UNFINISHED task's), and `clientPartyId`
  (+ `dueOn`) on `WorkItemCheckRow` and `EscalationRow`. The reader comes from `useSession()`,
  so the page asks nothing until the shell knows who is signed in. In `next dev` StrictMode runs
  the effect twice (12 requests, 6 distinct); a production build makes 6.
- **Buckets by the work's due day against `browserDay()`:** Overdue, Today, This week (the next
  SEVEN days, so a Friday still shows Monday), Later (closed, a Show button). What waits on the
  reader NOW (a check to decide, a request to answer, an escalation to chase) is Today unless
  already late, whatever the work's own date; other undated work is Later. Within a bucket:
  earliest first, the reader's own turn first, then name.
- **Every row: what (a whole-row link to where it is worked), the client (a LINK to its page),
  due, whose turn.** Whose turn is You / A checker / The client / An earlier step. A task with
  an open review, and a step that is done with a check open on it, is the checker's; a request
  answered and not yet replied to is the client's; a `pending` step waits on an earlier step.
  Waiting on the client for a TASK needs the open asks on the board's read and is a P1 task.
  Since 0322 there is also **An admin**: a draft invoice (a bill's, or an advance) only an
  administrator may issue, on a non-admin's desk.
- **Billing reads (auto-invoice):** `/billing/dues?mine=true` (bills to raise, drafts to issue,
  no-price reminders) and `/billing/advances?mine=true` (advances the reader chases as SPOC, Key
  Manager, partner or admin, 0322). Both for every staff login; the rows are described under
  "Automatic billing" below.
- **One row per thing.** An escalation about the reader's OWN task is the flag "Escalated" on
  that task's row; about somebody else's work it is its own row ("Escalated to you · with
  Ananya Nair"), one per piece of work however many rungs fired. A done step waiting for its
  check is one row, not a step and a check. A task check is listed only when the reader may
  decide it (their own task waiting for a check is already a task row).
- **Flags under the title, in tone:** the blocked reason in danger (the kind line already says
  the firm's word for the state, "Task · Blocked"), "Waiting on <task>" and "Escalated" in warn.
- **Empty:** "Nothing due. You are up to date." when Overdue, Today and This week are empty.
- **Sidebar counts (`useNavCounts`).** Work board = open tasks on the reader's desk, Jobs =
  steps on it, Client requests = requests on it waiting for the firm. The shell fetches NOTHING
  for them: My day reports all three, and the Work board and Jobs report their own when they
  load. A count nobody reported, or a 0, is not drawn.

## Setup readiness on Your firm and My day (V2.6, 2026-09-28)

`GET /api/v1/tenancy/readiness` (`tenant:admin`) returns the lines as CODES; `lib/ui/readiness.tsx`
is the one place they become words and links, so the two screens never phrase a gap twice.

- **Your firm opens with a Setup card** (`#setup`): a table of the eight lines, each a whole-row
  link to the screen that fixes it (Deadlines is `/admin/firm#deadlines`, which is why `SetOnce`
  takes an `id`), a Done / To do pill, and up to three gaps under the label ("test company: no
  Key Manager, no SPOC for FRC", with the client LINKED; "and N more" after). It is read in the
  page's own `load`, so saving the Deadlines card below turns that line Done in the same reload.
- **My day shows "Setup: 5 of 8 · See what is left"** at the top for `tenant:admin` only (the
  seventh read, so an administrator's My day makes seven calls), and nothing once all eight are
  done.
- **The ladder line never suggests days.** It asks that each ladder is PUBLISHED; the firm has not
  given its numbers (decision D3).
- `request_routing` counts `none` as not set, though the API calls `none` a real answer: the
  brief asks that the firm has chosen who picks up client requests.
- **Thirteen lines and three states since 2026-10-03 (audit CA#15, CA#16, F07).** A line with
  nothing to look at yet (no clients, no services, no check rule reading reporting lines) shows
  **Nothing to check yet** in a neutral pill and is left out of "N of M done"; an empty firm read
  "4 of 8 done". The new lines: the companies' country and address, the firm's time zone ("Not
  chosen: days follow UTC, not your country", plus the zone its companies settle, in words),
  colleagues added, a service, standard terms.
- **The time zone lives on Your firm** (`#time-zone`, `lib/ui/time-zone.tsx`). It was on
  Structure under "Who picks up client requests" and nobody found it; Structure no longer has
  it, so there is one place to set it.
- **Other date screens touched by the same audit:** the Escalated tab shows `daysPastNow` ("26",
  with "18 when raised" under it); My day says "Nothing due this week" and names the next dated
  row instead of "You are up to date", and flags a step or task dated by a statute "Legal due
  date"; the calendar's coverage line no longer claims "Every period so far ended before the
  engagement began"; the rules library says why Start early is greyed, and the rule editor never
  pre-fills a due date (empty boxes, "e.g." placeholders).

## `/copilot` — AI Copilot, and the uuids that used to be the first thing anybody saw

**It is not the landing any more (V1.1, 2026-09-28).** It was `/`, and every staff role signed
in to "AI Copilot · Not live yet" with every sidebar group closed. Staff land on their work now
(`homeFor` in `lib/api/home.ts`), the Copilot is one sidebar link carrying the note "Not live
yet" (`NavItem.note`, drawn in the `.count` style), and the Delivery group is open by default
(`NavGroup.openByDefault`) as well as whenever the current page is in it.

This route was **Home**, and Home printed the session's user id, its tenant id and a row of
permission keys above the fold. Every one of those is a fact about the SYSTEM. A partner
opening a practice-management product at nine in the morning is not asking a question about
the system, and two full uuids told them only that the software was written by somebody else,
for somebody else.

**The facts are not deleted — they are LAST, and closed.** Support conversations open with
"what is your firm id", and a user who cannot produce one has nothing to give. They sit under
the chat in a `<details className="disclosure">`, which is where a fact that matters once a
year belongs. Deleting them would have traded one bad screen for a different one.

**The screen is being built before the feature, deliberately.** There is no model behind it
and no endpoint to call; what exists is the shape — the thread, the composer, the openers, the
delay. When the API lands, `<Answer>` is the only thing that changes.

**So it must never imply it worked, and it says so in three places at once:** the pill in the
page header, the sentence the Copilot replies with, and the line under the composer. A demo
that quietly looks live is a demo that gets promised to a client. The reply delay is on
purpose for the same reason as the honesty — the screen behaves the way the real one will, so
nothing about the interaction changes when the real one arrives.

**The openers are questions this product will genuinely be able to answer**, out of records it
already holds. And a reply naming a keyword points at the screen that answers it TODAY — that
is the product pointing, not the Copilot answering, and the sentence says which.

`--brand` on the Copilot's mark, never `--accent`: accent is also `--ok`, so a green disc
beside every answer would spend a status colour on furniture. A thing speaking in the
product's own voice is exactly where the brand belongs. And only one speaker gets a bubble —
what the person typed sits in a sunk chip, what the Copilot said is plain prose — because
bubbles on both sides needs two grounds different enough to tell apart, and the only pair
spare are status washes.

### The firm now has a NAME on the wire, not just an id (this is what the screen forced)

`/auth/me` carried `tenantId` and nothing else about the firm, so **every** identity surface
in the app had a uuid fragment where a name belongs: the topbar read `BiB · b35c4196`, the org
switcher offered `partner · b35c4196`, and "Choose a firm" — a screen whose entire job is
asking somebody to pick — offered `partner · b35c4196` against `manager · 7f0a21c4`. Nobody
can answer that.

Fixed in the API rather than joined here, per the rule above:

- `Principal.tenantName` — nullable, because the name is LOOKED UP and a session pointed at a
  tenant row that has gone is a real (broken) state. Every screen reads its identity from this
  one response, so one field fixed all of them at once.
- `MembershipSummary.tenantName` on the sign-in response.
- `GET /api/v1/tenancy/me/memberships` returns **`MyMembership`** — the membership plus the
  name — rather than `tenantName` being added to the shared `Membership` schema. Every other
  route returning a membership has already established which firm it is in, and reading the
  name back off each row there is noise. This read is the only one that crosses firms.

The uuid is still the FALLBACK wherever a name comes back null. A bar that silently drops the
firm is worse than one showing a uuid.

## `/admin/firm` — the firm on paper, and why a new firm could not set itself up (2026-09-18)

**Update (Wave 4, 2026-09-28): this is "Your firm" now, and it holds all of it.** The user asked
for the two firm pages merged. The card for the fallback company ("Which company issues your
letters?", with its own registration form) is gone: that company is one row of the Companies
table, and a company with no country is given one through Change. The page is four sections:
Companies (with the country table), Signing, Deadlines and the discount limit. A section whose
value is set shows the value with **Change**; one that is not set shows its form straight away,
with the consequence as the field's one-line hint ("No letter can be sent until someone is
named.", "Until this is set, every discount needs sign-off."). **The discount limit is PUBLISHED
in the same act**, like the compliance policy: the Catalogue's old card only drafted a version,
and the API reads the limit live and treats no published limit as ZERO, so a limit set there never
took effect. What follows is the history of the page, and still why each fact is on it.

Loading the first real firm was scripted, and the script's own comment listed **four steps that
had no screen**: the firm's own legal entity, its signatory, a clause for its own country, and the
compliance floor. Each one blocks something a firm cannot see coming — an unregistered issuing
company means every engagement letter is refused (G1.8); no signatory means no letter can be sent;
no clause for the country means every imported engagement reads BLOCKING; no floor means the first
morning after an import is hundreds of MISSED filings. A product sold to a second firm cannot
onboard that firm by having an engineer run a script.

**`/admin/firm` holds three of the four, and `/catalogue` gained the fourth.** The issuing company
is read off `/firm-entities/preferences` — the `*` fallback row every firm gets at provisioning —
and registered through the same route the client page uses; the signatory is a roster picker over
active STAFF plus a title; the floor and the financial-year start are `compliance_policy`'s
`default` entry, defined on a firm that has none or drafted as the next version on one that has,
and PUT IN FORCE in the same act. A draft floor governs nothing, and a screen that left one lying
around would look set while every sweep ignored it. **Every consequence is said before the form,
not after the refusal** — the paragraph under each card says what happens while the fact is
missing.

**The clause writer sits with the clause list, and writes-and-publishes in one press.** There is
no clause editor to come back to, so a draft would be a clause the list marks "never in force"
that no letter can pin. A half-written term — a country with no words — is SENT as typed, so the
registry's own refusal reaches the screen (*"never half a statement"*, verbatim) instead of being
tidied here into a clause that silently names no law. Proven by trying it.

## Signing: the list on Your firm, and "Signed by" on a letter (0343, Q005, 2026-10-04)

The client asked for a list of signatories and a dropdown "at the time of finalizing EL to select
who will sign that particular EL". Two components in `src/components/signatories/`, both their own
files so `admin/firm/page.tsx` (which the company calendar work also edits) changed in a few lines:

- **`SignatoriesCard`**, the Signing section of Your firm: a table of Name (Default / Retired pills),
  Signs as, Signature, and Change + More (Make default, Retire / Reinstate). The page owns loading,
  the error and the notice, and hands its `act` in. An empty list shows the add form straight away;
  the firm's first signatory becomes the default (the API decides). **Change** edits the title and
  uploads the person's own signature: the brand screen's two calls, a document first
  (`POST /documents`, kind `brand_asset`), then `PATCH /tenancy/signatories/{id}` with its version.
  The Signature column says "Uses each company's signature" for a default with no image of their
  own, because that is what the letter prints; anyone else without one is Not set (a bare line on
  the letter, never somebody else's signature).
- **`SignedBySelect`**, beside the send button on the letter page AND in the builder's
  `LetterSendPanel`: "Firm default: <name>, <title>" (saves null) plus every active signatory, and
  the current choice even if retired since, marked "(retired)", so the drafter sees why Send will
  be refused. A change PATCHes the letter at once and hands the answered record back: the builder
  puts it in the store (`putLetter`), so the PDF preview redraws with the new name and signature;
  the letter page sets its record. A sent letter shows its frozen block as before, not the select.

Walk: `bib/demo-assets/tools/sig-walk.mjs` (24 checks), screenshots and the rasterized PDF page in
`bib/demo-assets/notes/signatories/`.

## Wave 4 on the admin, portal and sign-in screens (W4C admin-portal, 2026-09-28)

Every `/admin/*` screen except Your firm and Standard terms, `/account`, `/`, the client portal,
`/p/[token]`, `/login` and `/auth/*`, in the Wave 4 shape. **Behaviour did not change**: every API
refusal is still shown verbatim, and each screen's rules below still hold. What changed, and the
facts that the older sections below now say differently:

- **No eyebrow and no lede anywhere in the group.** Their reasoning is in this file. The sidebar's
  own word is now the title where they differed: `/admin/workflows` is **Processes**,
  `/admin/structure` is **Structure**.
- **One brand button per screen, top right**, opening a dialog where the form was a card at the
  bottom: People (**Add somebody**), Grades (**Add a grade**), Roles (**Add a role**). The refusal
  is shown IN the dialog. People's outcome ("Added" / "Added, but no email sent") is a notice on
  the page after the dialog closes. Where the form takes the page (Who checks work, Escalation
  ladder, Processes, Compliance rules), the button sits in the header and the form opens under the
  title; `useSwapFocus` still hands focus back.
- **A quiet text box, `<Input variant="quiet">`** (added, beside W4A's quiet select): a name, an
  order or a rank renamed in place in a table row reads as its value, framed on hover and focus.
  Grades, Structure, Work states and Calendar words use it; the commit-on-blur/Enter rule is
  unchanged. A system code (`senior_manager`, `in_progress`) is a line under the name, and a
  retired row carries a Retired pill there instead of a Status column and a 55% dim.
- **People**: access is a pill beside the name only when it is not ordinary staff (Revoked,
  Client portal); Revoke / Restore moved into the row's **More** menu. The table hid 287px at 1280.
- **Compliance rules**: the counts paragraph, the Show select and the "Show retired" checkbox are
  ONE control, **tabs with counts** (All · Producing dates · Not used by a service · Not yet
  confirmed · Waiting on a fact · Event-driven · Retired; a tab with nothing in it is left out
  except the four a partner looks for). The line under the tabs is where a service is chosen (the
  Catalogue). An arrival at an all-retired chain still shows its rows. Authority is a line under
  the filing's name. **The editor opens under its own row**, with the page's notice and refusal in
  it, where it used to open after all 58 rows. "Not used by any service yet" is said on a row only
  where the pill does not already say it and a formula exists. The table hid 1,432px at 1280.
- **Roles is one table**: permissions down (the API's sentence, the key under it), roles across,
  a box per cell named "<key> for <role>". Each role still saves on its own, draft then publish,
  from a **Publish** button under its column that appears only when its ticks changed.
- **Brand is one table of four marks per company.** The file picker opens from **Upload /
  Replace** and the file goes up as soon as it is chosen (the same two calls, document then brand
  asset). Where each mark prints is its row's hint, including that the letterhead is stored and
  not printed yet. `BRAND_ASSET_HINTS` in `client.ts` was shortened for it.
- **Standard prose**: an empty kind's add form starts FOLDED (it was open for the cover letter and
  acceptance), and the add form's "Prints in" has no hint inside the row.
- **Territories** picks the country from `CountrySelect`; the value is still the code.
- **The portal**: no eyebrow naming the firm (the rail and the bar do); a request's reply box opens
  on **Add to this** (it was an open box and a brand Send on every card); invoices print through
  `formatMoney` (`₹1,47,500.59`, no `.00`); the month picker sits in the header; the footers that
  listed where things are, are gone (the rail is the fix, see T6.7). Documents still says
  "Missing something? Ask ... to share it", and the month page still says it is not an email.
- **`/p/[token]`**: a zero discount arrives as "0.00", and comparing it to "0" drew "after ₹0 off
  ₹65,000" under the total. Fixed.
- **`/login`**: "Email me a sign-in link instead" is no longer disabled until an email is typed
  (it drew pale grey); with no email it asks the browser to say the box is empty and focuses it.

Measured with `bib/demo-assets/tools/w4ap-measure.mjs` at 1280 (1440 the same), height and words
before -> after: People 1062 -> 900, 310 -> 172; Compliance rules 7612 -> 8154 (taller because it
now wraps: it hid 1,432px of columns), 2968 -> 2251; Roles 4243 -> 1700, 1878 -> 315; Brand 6732 ->
3419; Standard prose 3462 -> 2511, 1264 -> 297; Structure 2402 -> 1880; Grades 1352 -> 923; Client
reminders 1391 -> 1213; portal Requests 2549 -> 2073; every table in the group 0px hidden. Walk:
`w4ap-walk.mjs` (fixture EPB_TAG=w4admin + `w4d-seed.mjs` + `w4ap-seed.mjs`).

## `/admin/structure` — and the one control that says it is not live yet

Two lists side by side, never a tree: a **Dept** (FRC / TRC / RAA) is the revenue axis and a
**delivery team** (FINCOMPLIANCE, VCFO CONSOLE, PAYROLL) is who does the work, and one team
commonly delivers under several Depts. Rendering them nested would say something about the
firm that is not true.

Neither is required. Most firms have one layer, some have both, plenty have neither, and the
screen leads with that so an empty list reads as an answer rather than an unfinished form.

The split chooser — how a client's work is cut into jobs — **disables an option whose list is
empty and puts the reason beside it**. Hiding it strands somebody looking for a setting they
were told exists; offering it produces the API's refusal, which is a worse way to learn the
same thing.

**And it says out loud that it is not in effect yet.** The setting is stored and audited
today; the orchestrator that reads it is T2.7. A control that looks live and is inert is the
"feature that looks finished" the backend has been caught by before, and the screen is the
only place a user would ever find out. When T2.7 lands, that paragraph comes out.

There is no delete and no way to edit a code, because there is no endpoint for either.
Retiring is not deleting — a Dept that existed in 2026 is part of why a service was filed
where it was filed — and a code cannot move because every published service body names it and
those bodies are frozen.

**`/catalogue`'s two axis fields are pickers only when the firm has a list** (`AxisField` in
`catalogue/service-form.tsx` since W4B), and stay text boxes when it does not. That is the API's actual rule rendered honestly: a firm with no Depts
is checked against nothing, so a disabled empty dropdown would claim the service cannot be
filed when the truth is that it can be filed anywhere until the firm decides. A service naming
a code that has since been retired, or one typed before the list existed, is offered marked
"no longer on this firm's list" rather than silently blanked — the submit rewrites the whole
body, so blanking it is how a Dept disappears from a service nobody meant to refile.

## `/work` — the first screen the delivery half of the product has ever had

`GET /api/v1/jobs` shipped with T2.6 and nothing rendered it for two tasks, which is exactly the
"write with no read" shape the backend's own CLAUDE.md warns about. It has a screen now, and
building it is what made three things obvious.

**A job with no steps is not broken.** It means the firm has not published a workflow template
for that service, and the screen says so in words — "waiting for a process · nobody has written
how this service is delivered" — rather than showing an empty row for somebody to interpret.

**A skipped step is shown, marked "not needed", with its reason.** Hiding it would make the
process look as though it never had that step, and "we did not do this, and here is why" is the
question asked when a filing is questioned.

**An `agent` step can say "waiting for you — no agent built for this yet".** A firm may write a
step as an agent's long before one exists; the work does not stop, it goes to a person. That is
the API's rule rendered, not a convenience, and the screen distinguishes it from an ordinary
human step because one of the two is something the firm might want to chase.

The Done button appears only for `work:write`, and only on a step that is waiting. Completing
one RELOADS the whole list rather than patching the row, because finishing a step opens the ones
waiting on it in the same call — updating only what was clicked would leave the next step
looking untouched.

`/work` lists what the API calls runnable, which now includes jobs waiting on a person. It does
not show work whose window has not opened: the calendar is materialised a year ahead and showing
all of it as "ready" would bury what actually is.

**A ROW IS NOT AN ENGAGEMENT ANY MORE (T2.7's merge).** When a firm splits its work by Dept or
delivery team, one row is that team's whole checklist for one of a client's companies on one
engagement letter — which may be several services. So the row lists its SERVICES, names the team
beside them, and leads the "For" column with the COMPANY the work is delivered to, with "billed
to …" underneath only when the client differs. A group of four companies has four rows and they
must not look identical.

Listing the services is not decoration. A firm splitting by team can legitimately see two
FinCompliance rows for one client — the merge key includes the workflow key, so two sets of
services naming two different processes stay two checklists — and the only way to tell that from
a duplicate is to see what is in each.

**And this is where the uuid finally went.** The row used to render `engagement <uuid>` with a
comment admitting the honest fix was a read model carrying names. The merge forced it: a merged
job's `sourceRef` is a derived group key naming no row at all, so it was not even a uuid anybody
could look up. `GET /api/v1/jobs` carries the names now, joined once for the page.

`/work/[jobId]` calls `GET /api/v1/jobs/{jobId}` alongside its steps, for the same reason — a
merged job's steps say nothing about whose work they are. That route also exists because the
list is only what is RUNNABLE, so a finished job's page had no way to name itself at all.

**A step a machine answered gets three buttons INSTEAD of Done (T2.8).** Accept · Correct ·
Reject, and never the Done button beside them — the API refuses it there, because ticking
"done" would record that a PERSON did the work and leave what the machine said undecided
forever. Offering a control that will 409 is not honesty, it is a slower error.

**The step's own label reads the proposal, not just the executor** — and getting that wrong is
what opening the page found. An `agent` step showed "waiting for you — no agent built for this
yet" while a proposal sat underneath it saying one had just run. That label was the whole truth
until T2.8 and is not any more, so it now says the two machine-answered cases apart: "a machine
answered — waiting for you to check it" against "a machine could not answer this — waiting for
you to decide". A different job for the reader in each case.

The proposal shows the confidence **with the bar it was judged against**. "0.82" alone means
nothing to somebody at a desk; "0.82, and this firm acts alone only above 0.95" is the entire
explanation of why they are being asked. And the two reasons for being asked are worded apart:
a step the firm marked for approval always comes here whatever the machine scored, while one
that merely fell short is a different fact — only the second says anything about the agent.

Correcting opens the machine's own answer to edit rather than a blank box: a correction is a
change to what it said, and the API refuses one that changed nothing (with a message that says
"if it was right, accept it"). Rejecting asks what was wrong, because the schema insists — and
rejecting does NOT finish the step, which the screen says, because throwing away an answer is
not doing the work.

**There is no screen for the thresholds themselves, deliberately.** They are a `confidence_tier`
config entry and reachable through the generic config API. There are no agents yet, so there is
nothing to auto-commit; a screen for a knob with no consumer is the "control that looks live and
is inert" trap `/admin/structure` was careful about. It belongs with the first real agent.

## `/admin/workflows` — where a process stops living in somebody's head

The engine could walk a process and the board could show one, and neither was worth anything
while the only way to WRITE a process was a curl command. This is that screen.

**Draft and publish are separate here, unlike `/admin/roles`.** A role is one intent and
saves in one press. A process is not: publishing changes the path every job started from now
on will walk, and a partner may write one over several sittings. So it follows `/catalogue` —
a draft sits visibly unpublished, and the screen says "no job is following it".

**A condition reads as one sentence across three controls** — "Only do this step when…
[Where the entity is registered] …it [is none of] …these [AE, SG]". The labels are minimal
because the OPTIONS carry the words, but they are real labels rather than a bare "…", because
a screen reader gets nothing from an ellipsis. `in` / `not_in` take a comma-separated list; the
blanks are dropped on the way out, so a trailing comma is not an empty value the API rejects.

**There is no "is at least" in that picker, and that is not an omission.** The firm's own
compliance list makes a threshold its commonest rule, but the API has no numeric fact to
compare — so the option would sit there, compare a string, and do nothing. It arrives with the
data (T3.2).

**The long hint sits BELOW the row, not inside a column of it.** Inside, it made its own column
six lines tall and `.bib-field-row`'s flex-end alignment pushed the two selects to the bottom
of it, so the three parts of one sentence stopped being on one line. Found by looking at the
page; the types were perfectly happy.

**It is deliberately not a diagram editor.** The graph is expressed as "this step waits for
these steps", which is how somebody describes a process out loud and is exactly what the
engine reads. A cycle is typeable and the API refuses it by NAMING the loop — a better error
than any drag-and-drop would produce, and it is shown verbatim.

Removing a step also removes it from every other step's "waits for". Without that the API
refuses the whole process for naming a step that does not exist — correct, and a confusing way
to find out what you deleted.

**`/catalogue` gained the field that connects the two**: a picker over PUBLISHED processes
only. A draft is not in force, and offering one would point a service at something no job will
ever follow. Blank is a real answer and the hint says what it means — the work is created and
waits, visibly, rather than running a process nobody wrote.

## Files are a PANEL, not a screen (T3.6)

Nobody opens the product to browse files. They open a client, a letter, an invoice or a job,
and the files are part of what that thing IS — so `<Documents>` (`src/lib/ui/documents.tsx`)
is one component with the subject kind as a prop, dropped onto all four. There is deliberately
no `/documents` route.

The API is shaped the same way: `GET /subjects/{kind}/{ref}/documents` is the read, and the
upload **attaches in the same call that stores**. A two-step "upload, then attach" would leave
an orphan behind every time somebody closed the tab.

**Downloads go through `fetch`, never an `<a href>`.** The session is an httpOnly cookie set by
a different origin and the API sets `SameSite=Lax`, so a plain link works on localhost (same
site, different port) and silently downloads an HTML error page anywhere the API is on another
domain. `downloadDocument` in `client.ts` fetches with credentials and hands the browser a
blob. That holds the whole file in memory, bounded by the API's own upload limit — the honest
cost of the backend deliberately not offering a pre-signed URL, which would answer to none of
the four scoping gates.

**The title is required and never defaulted from the filename.** `scan_0043.pdf` is what a
scanner produces and is not something anybody finds a document by later.

**BUILDING THIS PANEL FOUND THREE THINGS WRONG WITH THE API IT WAS BUILT AGAINST**, which is
the rule in the backend's own CLAUDE.md working exactly as written — and worth recording,
because the module had 939 passing tests and every one of them was happy:

- **`createdByName: string \| null` collapsed two different facts.** The system generating a
  file and a person whose display name is simply unset both arrived as `null`. The audit
  trail had already solved this — *email is the discriminator, not the id* — and the field is
  now the same `{ userId, displayName, email }` shape `EventRecord.actor` uses.
- **`kind` and `subjectKind` were bare `z.string()`**, so the generated client lost closed sets
  the database enforces with a CHECK. They are enums on the wire now, and a screen switching on
  one gets a compile error when a member is added instead of a silent default.
- **A `BrandAsset` carried a version with no `documentId`**, so its bytes were unreachable —
  bytes are fetched at `/documents/{documentId}/...` and there was no way to build the URL. A
  write with no read, found the moment a screen tried to show a logo.

## `/admin/companies` and per-company prose — the firm is several companies (T6.18, 2026-09-28)

10x Global quotes from four companies of its own. **`/admin/companies`** lists them from
`GET /firm-entities` — the ONE list, which `/admin/brand`, the Standard prose tabs and the
builder's "Issued by" also read, so no two screens disagree about which companies the firm has.
**Add a company** is one form and one call (`POST /firm-entities`: the organization, its country
and the row making it the company for that country, in one transaction). A country another
company already quotes is said under the picker and the button is not offered
(`COUNTRY_ALREADY_SERVED`). **Change** sends only what changed; a company's country is offered
only while it has none (`JURISDICTION_FIXED`). The country table is the preferences route, one
Save per row, "Everywhere else" is the `*` row; there is no delete behind it, so none is offered.

**A company is "the firm's" only while a row names it** (`crm.is_firm_entity`). Walking it:
Singapore given to the Gulf company, and EPB Asia vanished from every list, with no way back from
the screen, because the picker no longer offered it. So a move that leaves a company with NO
country is not offered, and a warning says why before any press; the Gulf company can still
quote a Singapore client by being picked on that proposal (D4). The durable fix (membership that
does not depend on a routing row) is backend work with a migration, and is open.

**`/admin/document-blocks` got tabs, Default · each company.** The rule (D5) is per KIND: a
company with any active line of a kind prints only its own lines of that kind, otherwise the
Default ones; "Only in" applies inside either set. It is drawn above the tabs as a company-by-kind
table (Own / Default / none), and said on the Default tab ("every company uses these lines except
…"). A company tab shows, per kind, either **Using the default wording** (the inherited lines,
read-only) with **Write this company's own**, which COPIES the Default lines (order, heading,
country) and opens them as text boxes, or its own lines with **Go back to the default**, which
RETIRES them. Retired lines sit behind a "Retired lines of …" disclosure with Restore.
**The text boxes edit where a line prints too:** the Default GST line is India-only, and a Gulf
company that rewrites it as VAT without changing that would never see it on a UAE proposal.

**Measure the table, not only the page.** `.tablewrap` scrolls its table inside itself, so the
first company list hid its currency and its buttons at 1280 while the page reported 0 overflow.
`bib/demo-assets/tools/epb-s5-walk.mjs` measures every `.tablewrap` too (61 checks).

**Update (S6, 0313):** a company is the firm's by membership now, so giving away its last country
only re-routes clients; the screen's refusal of that move is gone, and the company reads "no country
yet" in the list.

**Update (Wave 4, 2026-09-28):** this screen is part of **Your firm** (`/admin/firm`); the route
redirects. The country table's pick SAVES (a quiet select per row, focus handed back after the
reload), so there is no Save button per row; Add a company is a dialog; the brand and wording links
sit behind each company's **More** menu.

## `/admin/brand` — the marks, per COMPANY

Not three upload boxes. A firm with an Indian company and a US company signs on two
letterheads, and a letter its US entity issued printing the Indian logo is the same class of
error as one printing Indian governing law (G1.8) — so the screen leads with the entity.

**Putting one in force supersedes; it does not replace.** The previous mark stays stored and
downloadable, because a document issued last year was issued under last year's logo. There is
no delete and no endpoint behind one.

**It says out loud that nothing renders these yet.** They are stored, versioned and audited
today; the renderer is T3.8. A control that looks live and is inert is the "feature that looks
finished" this product has been caught by before, and this screen is the only place a partner
would find out. That paragraph comes out when T3.8 lands.

The company list is `GET /firm-entities` (T6.18), the same list Your firm, the prose tabs and
the builder read. A company appears once it is added on Your firm (`/admin/firm`); its link there lands
on its card here (`#brand-entity-<partyId>`, scrolled to once the list has loaded).

Setting a mark is **two calls** — the bytes become an ordinary document first, then that
version is put in force. If the second fails the screen says the file was stored and is not in
force, rather than pretending the upload failed and sending somebody to re-upload a file the
store already holds.
## `/admin/verification` and the To check tab — where work goes to somebody's desk

Before T2.9 an escalation and a queued proposal landed in the same place — a blocked step on a
job page — and went to nobody. You found them by opening a job and looking.

**`/work` has a second tab, and it shows the WHOLE FIRM's queue.** Not "mine": under a rank
threshold there is no "mine", any Manager may take any of it, and a list filtered to what the
viewer can act on hides the queue's most useful fact — that six filings have been waiting a week
because nobody senior enough has looked. So every row carries `viewer.eligible` and, when it is
false, `viewer.reason`, and the screen SAYS the reason rather than greying a button out.

**Ordered oldest-first, and there is deliberately no due date anywhere on the screen.** The firm
has not given its internal turnaround times or confirmed its escalation matrix, and a deadline
this product invented would be a priority the firm never set.

**`/admin/verification` is where the firm picks its rule**, and the thing to understand about
the page is the banner at the top: **maker ≠ checker is NOT a setting on it.** Whoever did the
work can never approve it, the database refuses it, and the screen says so where somebody would
otherwise go looking for the switch. What the page configures is who *else* may check.

Three rules, and **each option carries its own trade-off in the option itself**, not in help
text somebody has to find: "the maker's own manager" says out loud that it stops the morning
that person is on leave. This is the choice that decides who may sign off a statutory filing.

The grade picker appears only for the two rules that READ a grade — the API refuses a
`reporting_line` body carrying a threshold, on the ground that a number nothing compares is a
setting that looks live, so offering the field would be offering a 400. And choosing the
reporting-line rule says, before it is saved, that it reads who reports to whom on
`/admin/people` and that anybody without a manager recorded there has nobody who may check
their work.

**Draft and publish are separate, for a stronger reason than `/admin/workflows` has.** A check
PINS the rule in force when it opened, so raising the bar this afternoon leaves this morning's
open checks approvable by the people already looking at them.

`/admin/workflows` gains a per-step **"who checks it"** picker over PUBLISHED rules only — a
draft governs nothing — and "nobody" is the default, because that is what every process written
before this field existed meant. A rule a step names but the firm has since withdrawn stays
selectable, marked, rather than silently blanked: the submit rewrites the whole body, so
blanking it is how a review disappears from a process nobody meant to change.

**`/work-items` HAS A "TO CHECK" TAB TOO, AND IT IS A SECOND QUEUE, NOT THE SAME ONE.** `/work`'s
is the JOB STEP queue (`step_approval`); this one is the TASK queue (`work_item_approval`), and
plenty of work at a real firm never walks a process at all. Two tables, two endpoints, two tabs
on the two screens that own them — a merged list would have had to explain which kind each row
was before a reader could act on either.

**It exists because using the product found that the queue was unreachable.** `GET
/api/v1/work-item-checks` had one caller: a banner saying "N tasks are waiting to be checked"
that linked to `checks[0]`. With two pending there was no way to reach the second — a partner
submitted a task and, signed in as somebody else, no screen listed it. The banner now opens the
tab and says how many of the queue are the reader's own.

**The verdict is on the ROW and the API computes it**, the same arrangement `/work`'s queue
has: `GET /api/v1/work-item-checks` gained `viewer: { eligible, reason }`, resolving the roster
once for the whole queue rather than this app asking `/checkers` per row — the per-row join the
backend's CLAUDE.md warns about, and it would have asked the wrong question anyway (`/checkers`
answers for the whole roster; a row needs one person). **`reason` is the SENTENCE, not a code**,
because this module's `/checkers` already returns prose and one refusal must not be phrased two
ways. **Approve and Send back sit on the row** — a queue costing two navigations per row is a
queue nobody clears — and Send back opens the note field inline, because the API refuses a
rejection without one and the person should meet the requirement before the refusal.

`/work/[jobId]` shows a checked step as **"finished — waiting to be checked"** and offers
Approve / Send back INSTEAD of Done. To the person who did the work it shows the sentence
instead of the buttons — the API answers 403 there, and a greyed-out button says nothing about
why. Decided checks stay on the page with their notes: a step sent back twice and then approved
reads as one that sailed through if only the open check is drawn, and "this took two goes" is
the only signal anywhere that explains where a week went.

## Sub-steps and review points (T6.15)

The firm's first real process has bullets under every step ("Collect: bank statements, sales
data ...") and, on its manager review, "Check: P&L movements ...". A step now carries two lists,
and **two different people tick them**: the SUB-STEPS are the doer's, and all of them hold Done
shut; the REVIEW POINTS are the checker's, and all of them hold Approve shut. **Send back is never
held**, because the checker may find the problem at point three.

- **The editor takes a text box, one line per item**, not a row of inputs with an Add button: the
  process arrives as a document and pasting eight lines is how it gets written. A leading bullet
  followed by a space is taken off. **Keys are never shown**: `toLines` keeps an existing line's
  key when its words are unchanged (matched by label, so a reorder keeps them) and gives a new
  line the next `s1, s2, …` / `r1, r2, …` that the version being edited never used.
- **Review points appear only once a checker is chosen**, and are KEPT, with a warning and two
  buttons (move them to the sub-steps, or remove them), when the checker is set back to nobody.
  The API refuses them there; hiding or dropping them would lose what somebody wrote. An
  automatic step with sub-steps is warned about for the same reason: nothing would tick them.
- **Every disabled control reads the API's own count.** Done, Accept and Correct are disabled
  while `subStepsOpen > 0`, Approve while `reviewPointsOpen > 0`, and a sentence under each says
  how many are left. The 409 is still shown verbatim if it arrives.
- **"Not applicable" asks why on the line, never in a `prompt()`**, and such a line is NEVER
  drawn ticked: "it did not apply" is a different fact from "I did it". Every settled line says
  who and when, with the clock (`longMoment`).
- **A tick PATCHES the one step (or check) from the PUT's answer** rather than reloading the page
  the way Done does: a tick opens nothing, and four reads per tick down a list of eight is a page
  that flickers under somebody while they work.
- **The review points belong to the CHECK, not the step.** The open check's are editable for an
  eligible viewer only (so never for the maker); a decided check in the history shows what its
  checker ticked, read-only, and the round after a send-back starts empty.
- **`/work`'s To check tab approves nothing itself** (Open goes to the job), so its row says how
  many review points are left. `/work-items`' To check tab is the TASK queue and has no review
  points at all.

**What looking at it found:** `mt-3` on the `<Fieldset>` did nothing, because `.fieldset`
declares `margin: 0` and is unlayered; the list sat flush against the line above it. The spacing
is on a wrapper now. And at full width the "Not applicable" buttons sat 750px from the words they
act on, so the list is held to the measure.

## `/clients/import` — the book, from a spreadsheet (T6.12)

One screen, five parts in reading order: the three templates (header-only CSVs, with the firm's
own Depts expanded into one `SPOC: <code>` column each — no example row, because a row of
plausible values uploaded unchanged becomes a client), the upload, the report, the row-by-row
verdict, and the letters. Confirm sits on the report and is DISABLED while a blocking finding
remains; the sentence beside it says which of the two states the screen is in.

**The report and the outcome are one component.** Before confirm a row shows what it WILL
become; after, what it DID — the same table, the outcome's action and detail taking over the
verdict's, so a reader compares like with like. A created client links to its own page and a
signed letter to its own; a skipped row says what it was already on file as.

**The compliance notice is the most important thing on the page, and it is a warning, not a
block.** The API counts the engagements older than the calendar's reach-back and the screen
says, before confirm, that without a go-live floor every filing already made in the firm's old
records will show as missed — and links to where the floor is set.

`Templates` and the report both render ONE `<TabPanel>` for the selected sheet, because
`TabPanel` takes no `hidden` prop and rendering three stacks them.

**What walking it found:** the "Upload" heading matched "Previous uploads" in a locator, and the
client page is headed by the DISPLAY name (the trading name where the sheet gave one), not the
legal name the row linked by. Both are in `demo-assets/tools/s08-client-import.mjs`. And
**Turbopack panics (`0xc0000142` spawning its postcss worker) when `next dev` is started from the
Bash tool's shell; `--webpack` then breaks the app's CSP (`unsafe-eval`). Start it from a plain
`cmd` shell** — `Start-Process cmd /c "npm run dev"` — and it is fine.

## The account team, and the date box that is the whole feature (G3.2)

`/clients/[partyId]` leads with **who at the firm owns this client** — the Key Manager, and a
SPOC per Dept — because that is the question somebody opening a client page most often has, and
until G3.2 nothing in this product could answer it.

**The "as of" box is the point of the panel, not a nicety.** Nothing here is edited over: a
handover closes one row and opens the next, so every arrangement the client has ever had is
still on file, and "who was the SPOC in March" is a date in a box rather than a question for
somebody's memory. The API returns the whole history in one response, so changing the date
filters what is already loaded. On a past date the End buttons disappear and a line says which
day is being shown — a screen that let somebody act on March's team would be offering to change
the past.

The **Until** column says "until", not "to", because the dates are HALF-OPEN: an assignment
ending 1 April was in force up to and including 31 March. Getting that word wrong is how a
reader concludes there were two SPOCs on the changeover day.

**A Dept can have more than one SPOC**, so the form says so where somebody would otherwise
expect a replacement: adding a SPOC adds one, and ending the outgoing one is a separate,
deliberate step. A new **Key Manager** is a handover and the form says that instead. The Dept
picker is absent — not disabled — when the role is Key Manager, because the API refuses one
there and offering a control that will 400 is just a slower error.

**TODAY IS THE BROWSER'S CALENDAR DAY, NEVER `toISOString()`.** That one-liner is a day out for
anybody east of Greenwich in the morning, and opening this page at 04:11 in Delhi is how we
found out: the panel rendered "as of 29-08" on the thirtieth. `/clients` sends its local date to
`GET /api/v1/my-clients` for the same reason — the API runs in UTC and the firm does not, so
without it a client assigned this morning was missing from its holder's own book until the
afternoon. **A calendar day is the caller's fact, and this app is the caller.**

**`/clients` has two tabs, not one filter.** "Everyone the firm stores" and "the clients I was
put in charge of" are different questions, and the second reads the assignments rather than
filtering the party list. One row per client with every role collected onto it — a partner is
commonly the Key Manager AND a Dept's SPOC on the same client, and listing it twice would report
a bigger book than they have. An archived client is shown and marked rather than dropped:
somebody still holds it.

**The assign form is there for everybody who may assign (since 2026-09-25).** Assigning needs
`party:write`, which a manager holds; its two pickers were `tenant:admin` reads, so a manager
could be permitted to assign and be shown no form. They are `/tenancy/colleagues` (active staff
by name and rung, no emails — Shrestha's decision that every staff member may see colleagues'
names) and `/tenancy/axes` (the ACTIVE Depts and teams, names the table above already prints),
both on `party:read`. Swapping only the first left the form hidden — the Dept list 403'd — and
only walking the page as a manager showed it.

## The Wave 4 delivery sweep (2026-09-28)

`/work-items` (+ `[workItemId]`), `/work` (+ `[jobId]`), `/calendar`, `/client-requests` (+
`[requestId]`) and `/audit`, moved to the Wave 4 rules above. **The look changed; what each
control does did not**, and `bib/demo-assets/tools/w4d-walk.mjs` (50 checks, on a fresh
`epb-fixture.mjs` + `w4d-seed.mjs` firm) presses every one of them. The sections below still
describe the behaviour; this one records what the screens now look like, and why.

- **One brand action where there is one.** The board: **New task**, which opens a dialog (it was a
  disclosure card above the tabs). The task page: **Send for review** in the header while nothing
  is waiting; once a check is open the Reviews card moves up under the details, because Approve is
  then the page's act. Jobs, the calendar, client requests and the trail have none: they are
  worked row by row, or read. A queue row's Approve is secondary.
- **No eyebrows, no ledes.** What they explained is in the sections below. The coverage and
  decisions tabs keep ONE line each ("Not an error: most advisory work has none" still says the
  thing T3.2 requires said).
- **The task page is one details card.** It was four (the facts, then "Change state", "What the
  client sees" and "Whose desk", each titled), which printed the state and the owner twice. State
  and Whose desk ARE the controls now, quiet selects whose Save appears once the value changes
  (aria-labels unchanged); the portal switch shows its state as its word and is NAMED "Show this
  on the client portal"; the hand-over rule is said once somebody else is picked. The ask form
  opens on a button, as the dependency form already did.
- **Tables: whole-row links, and nothing hidden at 1280.** The list view, Jobs, Jobs' To check and
  Finished requests open from anywhere on the row; the ten "Open" buttons are gone. Measured before
  at 1280: the board's list hid **1168px** (one "Raised by hand with no Dept…" note made Whose desk
  so wide that Due, State and Priority were off the edge), the escalations 214px, the trail 96px.
  After: 0 on every table, both widths. What made room:
  - `.cell-text[data-size="narrow"]` (14rem; added beside W4A's 24rem one) for a table carrying
    several free-text columns;
  - the list says priority only when it is urgent (rank 1–2, by RANK), under the task, and puts
    the stuck reason there too;
  - on an assigned task the owner rule's hand-out note reads "To hand out" (the card and the task
    page keep the full sentence, T6.17);
  - the escalations fold Whose desk into Told ("Desk: X", only when it is not the person told),
    and a grade rung reads its NAME from `/tenancy/colleagues` ("Partner or above"; the grades
    route is `tenant:admin`), falling back to "Level N or above" for a rank nobody holds.
- **Engine states in words.** Jobs and steps are a dot and a word: "Waiting on someone" and
  "Done, waiting to be checked" are WARN (held up, not wrong), red is kept for "could not be
  finished". A job page is titled by its services and period, and a step's key is no longer on
  screen (its buttons' aria-labels still carry it). A check in Jobs' To check names its company
  from the jobs list the page already holds.
- **Client requests.** The reply form opens on **Reply** (its textarea takes focus, which is also
  what loads the documents, so the picker is never empty); the Whose desk line IS the picker, a
  labelled quiet select that assigns on change as the old one did; Take it, Put it back and Close
  without replying sit beside Reply. Three open requests measured 2,510px; now 1,351.
- **No mono on data** anywhere on these screens: dates, periods and counts are the sans face. The
  trail's "Exact record" stays mono, because it is true code.

**The trap this sweep hit: Turbopack served a stale `components.css`.** One edit (the trail's
`.audit-what` width) never reached the browser, through a touch and a restart, while earlier edits
to the same file had. The served chunk still said `34rem`. Deleting the worktree's `.next/dev` and
restarting fixed it. If a CSS change "does nothing", read the served chunk before debugging the rule.

## `/work-items` and `/admin/work-vocabulary` — the board, and the words on it (T3.1)

`/work` shows the ENGINE: which process a job is walking and which step it is on. `/work-items`
shows the work as a person experiences it — a client, a due date, a name, and a state in the
firm's own words. **They are two screens because they answer two questions**, and because a
firm that has published no process still has work: ad hoc work has no job at all and is still
owned, still due and still reviewable.

**IT OPENS AS A DATED LIST (V1.2, 2026-09-28), AND THE BOARD IS ONE CLICK AWAY.** It opened as
the board, and at 1440 the fifth column (Blocked) sat off the right edge: the v1.5 walk found
Ananya's critical, late "GSTR-3B - Cobalt Logistics - July", waiting on the client, in exactly
that column. The list is sorted overdue first (oldest first), then by due date, no due date
last, rank then title breaking ties (`datedOrder`). Being stuck is a FLAG ON THE ROW: the state
pill in danger tone with its reason under the task in danger, and "Waiting on <task>" in warn.
**Tab and view are in the URL** (`?tab=mine|unassigned|checks|escalated|all&view=list|board`,
kept in state and written with `history.replaceState`), so Back from a task lands on the same
place. `router.replace` was the first version and is a transition: Everything then Board, pressed
quickly, wrote `?tab=mine&view=board` because the second press read the tab before the first landed. `/client-requests` opens
on Mine for the same reason (its tab is still local state).

**THE BOARD VIEW'S COLUMNS ARE THE FIRM'S OWN ROWS (T6.1).** 0050 made states
rows precisely so a firm could rename "Blocked" to "Stuck" without a deploy, and a board with
hardcoded columns takes that back on the screen where it shows most. The columns come from
`GET /work-vocabulary` — `party:read`, the same permission the board itself needs — ordered by
the firm's own `sortOrder`, and a state with no items still gets its column, because "nothing is
under review" is a fact worth seeing and a board that changed shape as work moved would be
unreadable week to week.

**The columns are proven, not asserted:** this firm renamed "Blocked" to "Stuck" in an earlier
session, and the board's column says Stuck. Ticking "include finished work" is what produces the
Completed and Cancelled columns; the rest of the time a terminal state has none, or "Completed"
is the widest column on every board.

**There is no drag-and-drop, deliberately.** Moving an item into a state the firm has flagged
blocked REQUIRES a written reason — the service refuses without one and so does a trigger — so a
drag would produce a refusal with nowhere to type the answer, and every state change writes an
audit event naming its actor. A card links to the item, where the state picker already opens the
reason box the moment a blocked state is chosen. **Board or list is a VIEW, not a fourth tab**:
the tabs are three different questions and drawing is a different axis, so a fourth tab would
have left "Mine, as a board" nowhere to live.

**THREE TABS ARE THREE DIFFERENT JOBS.** Mine is what somebody opens in the morning. Everything
is the delivery meeting. **Unassigned is the one that matters most and would not exist on a
naive board**: when the router cannot find the client's SPOC for a Dept, or finds two, it
refuses to guess and the item lands here **with a sentence saying which**. A dash in that
column would make "two SPOCs for FRC, pick one" and "nobody has got to it" look identical, and
only one of them is somebody's to fix.

**NOTHING ON THESE SCREENS COMPARES A STATE'S CODE.** States and priorities are rows the firm
owns and may rename from `/admin/work-vocabulary` without a deploy, so every branch reads the
FLAGS — `isBlocked`, `isTerminal`, `isInitial` — and prints the NAME. The state picker offers
only ACTIVE states (a retired one still renders where it is held), and the **reason box appears
when the SELECTED state is flagged blocked**, for whatever the firm has called it — including a
second state the firm flagged itself. Asking for the reason before the API refuses is not a
duplicated rule: the API refuses regardless, and a person who has already pressed Save has lost
the sentence they were about to write.

**`/admin/work-vocabulary` is the standing directive made visible.** The names came from a
previous vendor and are still unconfirmed even for 10x, so renaming one has to be a tick and a
blur — not a migration somebody asks an engineer for. Each box says **what it turns on** rather
than naming itself ("Means blocked — needs a written reason"), because `is_blocked` tells a
partner nothing. Neither "Starting" nor either default is on the ADD form, deliberately: taking
one silently moves it off whatever holds it today, and that belongs on the row where somebody
can see what it replaces. Name and rank commit on **blur or Enter**, like `/admin/grades`, because
every commit writes an audit event.

There is no Delete on either table, because there is no delete endpoint and no DELETE grant:
a hundred tasks sitting in a state would lose it. Retiring keeps it readable everywhere it is
held.

**TODAY IS THE BROWSER'S CALENDAR DAY, on the board as on `/clients`.** The API takes `asOf` to
decide what is overdue, and `toISOString()` here would be the UTC day — which calls a filing due
today "late" for anybody west of Greenwich and "not yet" for anybody east.

**There is no "approve and mark done" button, and that is a decision.** Nothing says which of the
firm's terminal states an approval should move work into — a firm has at least two, Completed and
Cancelled — so picking one would be this product deciding what approval MEANS. The two acts are
separate and the page shows both. The review section lists **every** review including the
rejections: a list of only the open one makes work that came back twice read as work that sailed
through.

### What building these screens found

**PATCH was missing from the backend's CORS `allowMethods`, and had been since CORS was added.**
These are the first routes in the product that use it. The browser answers the preflight 204,
reads the header, sees PATCH is absent and DISCARDS the request — no server log, no status code,
surfacing as "TypeError: Failed to fetch" and reading as a dead endpoint. **The backend's smoke
walk could never have caught it: curl does not preflight**, and every one of those PATCH calls
passed. Found by clicking a checkbox. There is a backend test over it now.

**Two rendering faults the types were perfectly happy with.** The Owner fact printed the
assignment note in full AND the callout below repeated it verbatim, making the fact grid six
lines tall and saying one sentence twice. And a two-word state name wrapped inside its pill and
rendered as a broken circle — the firm names these, so a two-word name is the ordinary case.
`.bib-field-row > *` is `flex: 1 1 160px`, which is right for a control and turns a Save button
into a banner; the buttons opt out.

**A HINT NEVER GOES INSIDE A `<FieldRow>` COLUMN.** `.field-row` is `align-items: end`, so a
field carrying a hint stands taller and its INPUT rides up above the ones beside it — four fields
at four different heights. `/admin/workflows` learnt this and the paragraph below records it; the
compliance-rules editor re-made it in T6.4 and it was found by looking at the page again. Put the
hint in a `<p className="field-hint">` under the row.

### The task, the board and My day after the audit's work cluster (2026-10-03)

- **The task page closes the review loop.** Send for review is a dialog: the rule the firm checks
  it under (`GET /api/v1/review-rules`: one is applied and named, several are a required pick,
  none reads "anyone at the firm except you"), the unticked checklist lines that hold it (the API
  refuses `CHECKLIST_OPEN` regardless), and a note for the checker. Approve says it marks the task
  done and waits for the checklist; finished work is never offered Send for review. A sent-back
  task says so at the top with the checker's note (`item.sentBack`). State and Whose desk SAVE
  WHEN PICKED; a blocked state opens its reason box, whose Save moves it. Notes are an
  append-only list with who and when. The Filing card links the task to an open filing of its
  company (`GET/PUT/DELETE /work-items/{id}/filing`) so completing it files the filing. "Who may
  check this?" loads on the disclosure's `onToggle` and says when it failed, with Try again.
- **My day** puts work sent back to you (tasks and steps, `sentBack`) under Today as "Sent back to
  you" with the note, and the Client column names the company the work is for (`entityName`),
  the group only when the work names none.
- **The work board** has By person (open, late, waiting for a check per colleague; a name opens
  All tasks for them, `?person=` in the URL) and a Whose tasks filter on All tasks. Every tab
  counts pieces of work: Escalated counts the tasks and filings escalated (its panel says how many
  notices), and Everything is now All tasks. New task and the Relationships picker never offer the
  firm's own companies (`isOwnCompany`).
- **The job page** uses dialogs, never `window.prompt` (Send back and Reject take a required note;
  Correct is a form with one box per thing the automatic answer says), names every step control by
  the step's TITLE, never its key, and offers "Ask the client" on each open step: the job task's
  `ClientAsks` panel, opened with the step's title in it (`about`, `prefill`, `hiddenHint`).
- **The process editor** makes short names from titles (`lib/short-name.ts`, to the API's two key
  shapes; under More), a step added there waits for the step before it, "Waits for" names steps by
  title, and a review rule can be written in place (`lib/ui/check-rule-form.tsx`, shared with Who
  checks work, `putInForce`) and chosen for the step.
- **Files** never default their kind: "What it is" starts empty and is required.
- **A list read that can race keeps only the newest answer.** `/portal/requests` lost a client's
  first request behind a late mount read (F19, reproduced with a held response); a counter in a
  ref drops any answer that is not the latest read's.

## `/calendar` and `/admin/obligation-rules` — the calendar, and the rules behind it (T3.2)

**`/calendar` IS READ-ONLY AND MUST STAY THAT WAY.** There is no "add a filing" button because
there is no endpoint for one, and there will not be: every row falls out of the firm's rules, its
entities and its engagements. If a person could type one in, the calendar could disagree with the
statute — and then it is the Excel this product replaces, only now inside Postgres. What a person
changes is the RULES.

**Ordered by the INTERNAL target, not the legal deadline.** `statutoryDueOn` is what the law says;
`internalTargetOn` is the firm's own T–X and is when work has to START. A list sorted by the legal
date tells you when you are already too late. Both are on the row, and both go red separately.

**Every row is marked "unconfirmed rule" until a partner has ticked it.** The shipped dates came
from a previous vendor's document, not from the firm. Hiding that would make a plausible wrong due
date indistinguishable from a checked one, which is the dangerous kind.

### The coverage tab is the point of the screen

An empty calendar has three possible meanings — nothing is owed, a rule is missing a fact, or the
software is broken — and only one of them is anybody's to fix. So the second tab names every live
engagement the calendar produced nothing for, WITH A REASON, and **the screen says out loud that
none of them is an error**: `no_rule_names_this_service` is the ordinary state of advisory work and
is the longest list at every firm, which is why it sorts LAST. The reasons are grouped rather than
listed flat, because they are four different jobs, and each group's "what to do next" links to
where the fix actually is — an unregistered company is fixed on its client page, not on the rules
screen.

**The deep link into the rules screen is offered only where there is something to FIX.**
`blockedRuleIds` is populated for every reason, `nothing_due_yet` included — but there the rules
match, can compute dates, and simply have no period in the window yet. A "47 rules →" link beside
"covered, with nothing due yet", landing on a banner reading "the rules that blocked this
engagement's calendar", was a false sentence about a healthy engagement. The `REASONS` table
already recorded which reasons have a fix; the link now reads it.

**`entity_not_registered` exists because opening this screen found it.** Three engagements were
reported as "no rule names this service" at a firm that had just loaded fifty-seven rules; the real
answer was that nobody had registered the companies as legal entities, and a rule matches an
entity's jurisdiction exactly. The backend's reason logic was wrong and was fixed there.

### The decisions tab is where money gets decided (T3.3)

A deadline that has passed is **not an error and is not hidden**. It is a choice with money on both
sides — file it provisionally, accept the late fee, record that it never applied — and before this
it happened on WhatsApp and was written down nowhere. Eight months later a client asks what a
₹10,000 late fee was for and the firm has no answer.

**The badge is toned whenever it is non-empty, not only when the tab is selected.** Every other
badge on this screen is a filter; this one is a queue of undecided client money and should be
visible from across the room.

**It is a WORKLIST, not a window.** The due tab is a date range; this has no date filter at all,
because an obligation missed in April is still owed in September and a window would drop exactly
the oldest and most expensive rows off the bottom. Oldest first, for the same reason.

**`daysLate` is computed from the day the BROWSER sends.** G3.2's rule, on the screen that is most
about it: `asOf` goes up with the request, because a UTC day is yesterday in Delhi before 05:30 and
this list's whole job is saying how late something is.

**The form is collapsed until somebody acts, and the REASON is why it is a form.** A single
"Resolve" button would record that something was decided and lose why — which is the half nobody
remembers and the half the client asks about. Both the API and a database CHECK refuse a blank one;
the button is disabled before the click, but the server's sentence is what gets shown.

**And it says where the filing goes NEXT before the click.** Selecting an option renders one line —
*"the filing still has to happen"* or *"this ENDS the filing"* — because the two answers are
genuinely different and a partner should never have to know which option means which. That comes
from `closesWithoutFiling` on the firm's own option row, so a firm adding its own answer gets the
right sentence with no change here.

### `/admin/obligation-vocabulary` — the promise 0052 made and could not keep

The compliance states have been ROWS since T3.2, held that way precisely so a firm could rename
them, and **nothing could write them until T3.3**. Every *"mark another state as the missed one"*
message the API produced was describing a control that did not exist.

**The tick boxes are mechanism, not labels**, and this screen has to say which is which. Four are
DESTINATIONS — starts here · filed here · missed here · decided here — and a firm holds exactly one
of each; two are DESCRIPTIONS of what is true once a filing is there. The destinations are
**radios**, because a checkbox that refuses to be unticked reads as broken, and marking another
moves the flag in one step with no moment in between.

**A control that would contradict is DISABLED with a title saying why, never hidden.** "Missed
here" is unavailable until "needs a decision" is ticked, and the tooltip says what would otherwise
happen: the filing moves there and nobody is ever asked about it. A vanishing control reads as a
bug; an explained one reads as a rule.

**The resolution options are shown as a sentence, not as `closesWithoutFiling`.** The dropdown says
*"the filing still happens, late"* or *"it will never be filed"*, and every seeded option carries
**unconfirmed** on its face — they came from the app this replaced, and the firm has never been
asked to confirm the list.

### `/admin/obligation-rules` is the standing directive made visible

Forty-seven of the fifty-seven shipped rules cannot produce a date, and **the screen must not
render that as a fault list.** Each says, in the firm's own words, the one fact it is waiting for —
which is a question a partner can answer without knowing anything about this system. The counts
callout leads with the ratio and says in as many words that the second number is the honest state
of the firm's own specification.

**The lead time is a blank, not a default.** Every rule ships at zero, so the task appears on the
statutory date itself — visibly useless, and deliberately so: T–X is the firm's own working
practice and a guessed one is a commitment it never made. It commits on **blur**, like
`/admin/grades`, because every commit writes an audit event.

**WHAT IS NOT EDITABLE IS THE DESIGN.** Jurisdiction, name and rule pack are a rule's identity and
every filing already generated pins the row; moving them would silently restate why those filings
were due when they were. There is no Delete, for the same reason there is none on
`/admin/grades`. **How often** and **the financial-year start** are editable only while the rule
has produced nothing: between them they decide where a period BEGINS, and the screen disables them
with the sentence rather than letting the API answer 409 — a partner meets an explanation, not a
rejection.

**Everything else is now editable, and that is T6.4.** For three tasks this screen wrote three
fields while the API had taken a full formula, a new rule and exceptions since T3.2 with no caller
— so the forty-seven rules waiting on a fact were never going to start generating, however well
the firm knew the answer. The editor is `rule-editor.tsx`.

**The formula and its reason are ONE control, not two fields.** A CHECK refuses a rule holding
both and refuses one holding neither, so as two inputs the commonest edit on this screen —
answering a rule — fails unless the partner also remembers to clear the reason. It is a radio:
either this rule computes a date, or it says what it is waiting for. The form cannot express what
the database refuses.

**EVERY WRITE REPORTS WHAT IT DID TO THE CALENDAR**, and says which half is which: "4 filings
added; 14 already there moved to the new date; 3 left as they are — somebody has already started
them". That third number is the one nobody would ask for and the one that matters — a partial
change reported as a whole one is how a deadline moves without anybody being told. It comes from
the API's `RuleEffect` rather than being inferred from a 200: an edit that moved fourteen filings
and one that moved none look identical otherwise.

**The "47 waiting on a fact" count is a BUTTON.** It was a number for three tasks while the list
it described was four clicks away — so the one thing this screen exists to get answered was the
hardest thing on it to reach. A separate "answer these 47" checklist was considered and refused: a
checklist measures COMPLETION, and most firms will rightly never answer rules their clients do not
owe, so a permanent 12/47 reads as a product nagging about work nobody should do. The
outcome-linked surface already existed and was unread — `/calendar`'s coverage tab now deep-links
`?rules=…` from `blockedRuleIds`, and this screen focuses exactly those with a banner.

**"THE LAW CHANGED" IS A DIFFERENT BUTTON FROM EDITING, and that is the whole of `supersede.tsx`.**
Editing a formula is a CORRECTION — the shipped dates came from a document, everything ships
`unconfirmed`, and supplying the real one is recording the law properly for the first time. The
amendment form keeps the old rule instead: it governs every period before the cutover and goes on
explaining the filings it produced. So the panel says both halves in words before anything is
typed, asks for the first PERIOD that uses the new rule (never "today", and the hint says why —
August's return is August's law even though it falls due in September), prefills no date at all,
and shows BOTH formulas side by side, because an amendment is a comparison. A rule that already
hands over is not offered the button: it shows the date it hands over on and points at its
successor, which is what the API would answer anyway.

**A NEW rule defaults to COMPUTING A DATE.** Found by writing one: the form opened on "it
depends on something this system does not hold" with an empty reason, so the first press of Write
was always a refusal. "Waiting on a fact" is the shipped pack's condition — forty-seven rules
imported from a document nobody has answered — not the state somebody typing a rule from scratch
is in. They are writing it because they know when it is due.

**Writing a rule prefills the pack as `firm@<year>`**, editable, kept clear of the shipped
`gst-in@…` namespace so re-seeding a vendor pack can never collide with an answer the firm wrote
itself. And the form SAYS that a new rule generates nothing yet. Since T6.16 that is because a rule
written HERE is on no service, and a rule on no service adds nothing at all, tonight or ever, so
the notice says to add it to a service in the Catalogue; the old sentence promised the nightly run
would fill it, which stopped being true. The catalogue's "Write a new filing" is the path that
writes, links and fills the calendar in one act. **The editor's "Owed by clients who bought"
picker is gone**, and why is the next section.

**The formula is rendered as a sentence a partner can check against the statute** — "Every month ·
the 20th of the following month" — never as `dueMonthOffset: 1`. The first version of that function
was written without looking at the page and produced "Once a year, day 15 3 months after" and, for
an event-driven rule, "30 days after the period ends" when an event rule has no period at all. Both
were grammatical nonsense and the second was factually wrong; the types were perfectly happy with
both.


## `/catalogue`'s compliance filings: where a rule meets a service (T6.16)

A compliance rule used to name AT MOST ONE service from the rule editor ("Owed by clients who
bought"), and leaving it blank meant **every** service. That blank is how 98 GST filings reached a
bookkeeping-only client on 2026-09-18, and "at most one" meant a filing two services owe had to be
written twice. **The firm's own idea (2026-09-26) is the shape now:** when you build a service in
the catalogue you say what it files, a service carries any number of filings, and a filing written
once is in the list for the next service. Four decisions came with it, and the screens render them
rather than make them:

1. **A rule on no service adds nothing to the calendar.** "Every service" is gone. So the
   catalogue is the ONE place a filing reaches a client, and the editor's picker went rather than
   being kept beside the new one: two places to say "which service" is how two answers drift.
2. **Removing a filing from a service withdraws its untouched upcoming filings** for clients no
   other service of theirs still covers. Kept and marked, never deleted; anything started, filed,
   decided or past its date stays, and is counted.
3. **`/admin/obligation-rules` stays as the LIBRARY**: every rule, where each is used, its
   exceptions, and the law-changed panel.
4. Built before the SFF freeze.

**Where it lives since W4B (2026-09-28):** the **Compliance filings tab** of
`/catalogue/[serviceKey]`, not the foot of a card on one long page. Every sentence, focus rule and
confirmation below is unchanged; the tab names the section (no heading of its own), the essay
above a non-empty list went, dates are in the sans face, and "Also used in" links to the other
service's filings tab. Where this section says "card", read "the service's page".

**What is on each service card** (`src/app/catalogue/compliance-filings.tsx`), drawn LAST and
outside both version blocks:

- **The filings it carries**: name, who it is filed with, the due rule in words (`describeRule`,
  now exported from `rule-editor.tsx` so the picker, the list and the confirmation cannot word one
  rule three ways; since the follow-ups, TODAY's rule and the next change, see below), a status
  pill and SENTENCE (on the calendar for this service's clients
  registered in India / date not known yet: *the rule's own reason* / event-driven / not confirmed /
  retired), and "Also used in: …" linking to the other service's card.
- **"Add a filing"** is a searchable picker (Popover + Command, the `month-view.tsx` precedent)
  over the firm's whole library, grouped by the statute's `module` (GST / TDS / MCA, never the
  firm's Dept). Each option says its due rule in words and how many services use it. The item's
  cmdk VALUE is the rule id and the words are `keywords`, because cmdk treats two items with one
  value as one item and "TDS return" can exist in two countries.
- **Choosing an UNCONFIRMED rule opens an inline confirmation, not a `window.confirm`**: the
  dates in words, the exceptions, the fact that nobody at the firm has checked them, which other
  services it is confirmed for too, and that a zero lead time means work starts on the legal date.
  Adding it confirms it (the API's own path and event). A rule that is already confirmed is added
  on the click; asking again would be a second press that says nothing. A rule still waiting on a
  fact is added WITHOUT a confirmation, because it has no date to confirm, and the sentence after
  says nothing went on the calendar and why.
- **"Write a new filing"** is the library's own editor rendered `bare` (a card inside the service
  card drew two borders) with `createBodyOf(draft)` plus `serviceEntryIds: [thisService]`, in ONE
  call, so there is no moment where the rule exists on no service. `createBodyOf` is shared with
  the library's "Write a rule", so the two writers cannot send different shapes. The editor's radio
  group is named by `useId` now: every card can hold one of these forms, and two radio groups with
  one name in one document are one group.
- **"Remove from this service"** is replaced by a confirmation that states the effect BEFORE the
  press (what comes off, what stays, that it is kept and comes back if added again), then the
  counts after: *"13 upcoming filings taken off the calendar"*, or *"13 kept because another
  service the same client holds still includes it"*. The three kept reasons (started / past its
  date or waiting on a decision / covered elsewhere) are said apart, because they are different
  things to know.
- **Every press says what it did, in words**, and the sentence takes focus (`useAppearFocus`),
  because a removal unmounts the row whose button was pressed. *"12 filings added to the calendar
  for 4 companies"* (companies, because that is what the API counts: a group files per company),
  *"13 filings taken off earlier are back on the calendar"* after a re-add, and *"GSTR-3B was
  already on this service. Nothing changed."* for a second press. The sentence is CLEARED when the
  next act starts (the picker opens, a removal is opened, the write form toggles): *"13 added"*
  left beside a removal's confirmation read as that removal's answer.
- **Accessible names lead with the visible words** (`Remove from this service: GSTR-3B`,
  `Remove it: GSTR-3B`, `Keep it: GSTR-3B`), so six filings are six different buttons by name and
  somebody saying what they see to voice control still reaches them.

**The links are not versioned, and that is the design, not a gap.** Everything else on the card is
a published version, frozen. A link hangs off the service's catalogue ENTRY (`entry.entry.id`,
which `serviceRow` now keeps as `id`), so adding a filing needs no new version and a draft-only
service can carry filings already. A proposal pins a version for its PRICE; what the law asks of a
client is not a term the firm agreed with them.

**One read for the whole page.** `GET /obligation-filings` returns the firm's library once, one row
per chain with `usedIn` named, and each card finds its own. One request per card is the per-row
lookup this file warns about, and the local limit is about 300 a minute. That read is
`party:read` where the catalogue is `config:read`, so a session refused it gets a sentence on
every card ("Your role cannot see the firm's compliance filings"), never an empty list that would
say the service files nothing. **Only a 403 draws that sentence** (found in review): `?? null` on
any failure turned a throttled reload into "your role cannot see" on every card for an admin, hid
the controls, and swallowed the sentence saying what their add had just done. Any other failure
keeps the list already read, with a warn notice that it may be out of date, or, with no list yet,
says it could not be read and to reload.

**A refusal is drawn beside the press that caused it, and takes focus** (review, measured with
Playwright: a refused "Write it and add it to this service" drew its alert 131px ABOVE the
viewport, over a 900px form, while the button sat at the bottom). The section remembers which act
was pressed and draws the API's sentence inside the removal's confirmation, inside the adding
confirmation, just above the new filing's save row (`RuleEditor`'s `refusal` slot), or by the add
controls for a plain add; `Refusal` focuses it on appearance (`useAppearFocus`), which scrolls it
into view. The page's `FailureNote` doc already said an error three screens above the button is an
error nobody reads; the section had drawn it there anyway. **The picker keeps a 16px gutter on a
phone** (`collisionPadding={16}`): aligned to a trigger 32px in, it ran to the screen's edge and
lost its right border at 375px.

**The library says where each rule is used.** Every row carries "Used in: *service*" (each a link
to `/catalogue/<key>?tab=filings` since W4B; it was the in-page anchor `/catalogue#service-<key>`
while every service was a card on one page) or *"Not used by any service, so it adds nothing to
the calendar"* as a sentence, never a blank: a confirmed rule with a formula and no service looks
as though it were working. `coverage` gained `unlinked` for the same reason, un-toned (whether a
service uses a filing is a choice, not a job), with its own filter and count.

**The calendar leaves withdrawn filings out and does not filter anything itself.** Every read it
makes excludes them on the server, and a second filter in the browser is a second answer to "what
is on the calendar". The optional "N taken off" count was not built: the catalogue says it at the
moment it happens, which is when somebody can act on it. Its coverage reasons point at the
Catalogue where the fix is there (`where` gained `/catalogue`): `no_rule_names_this_service` now
means *no filing is on this service* and says, conditionally, where to add one; a filing for
another country is written on the service; `rules_unconfirmed` still goes to the library, because
adding a filing confirms it and this state means somebody unticked it there.

**What walking it found.** "GST · GST" under every GST filing (the pack names both the authority
and the grouping "GST"), now said once; the stale sentence above; a "Used in" link that landed
with the card's own name UNDER the sticky top bar, the one thing the reader came to see, so both
the deep link and the in-page anchors go through `scrollBelowBar` (`@/components/ui` since the
follow-ups below; it was the catalogue's own `showService`), which measures the bar; and a
smoke firm whose companies
were never registered in a country, so every add answered "no new filings" until one was. That
last one is the coverage tab's `entity_not_registered` reason working as designed, and it is why
the walk registered a company before measuring the counts.

### The follow-ups (2026-09-26), decided by the user

**A filing's date is TODAY's rule, and a law change is a second line.** The catalogue's row for a
chain is its newest row, and after "the law changed from April 2027" that is the successor: the
card said GSTR-3B was due on the 22nd while the calendar, correctly, dated September's return the
20th. Every rule row now carries `inForceToday` (the chain's row governing the period containing
the FIRM's today, read by the API) and `nextChange`, and `rule-editor.tsx` words them once:
`describeToday` ("Every month · the 20th of the following month") and `describeNextChange` ("From
April 2027: the 22nd of the following month."), which names `nextChange.firstPeriodStart`, the
start of the first period the new row GOVERNS, never the day the change was recorded from (review,
below). The service's list, the picker's
options and the confirmation all use both, so the option and the row it becomes say one date, and
the confirmation's exceptions are today's row's (a successor inherits none). `monthYear` is in
`@/lib/day`, split like `longDay`. **The library lists every row of a chain**, each with its own
formula, which is what Edit edits; the row in force adds the "From April 2027" line (in place of
the bare "hands over on", which named the same day), and any other row says what today's filings
follow instead ("Not in force yet. Today's filings follow the earlier rule: the 20th of the
following month."). Which row governs today is always the API's answer; nothing here computes it.

**"Edit in the library" on every filing** (`LinkedFiling`), a `LinkButton` beside Remove, offered
on `party:read` (the library's read) and worded "See it in the library" for somebody without
`tenant:admin`, because "edit" would promise controls the library does not give them. It lands on
`/admin/obligation-rules#rule-<lineageId>`: **the anchor is the CHAIN**, on its first row as shown,
because a law change gives the chain a new newest row and a link naming yesterday's row id would
land nowhere. The library reads the hash on its FIRST answer only (a reload after a write must
never scroll the page out from under somebody) and on `hashchange` (a fragment-only change is a
same-page jump the browser makes itself, under the bar: measured 63px under before the listener),
shows retired rows when the whole chain is retired, scrolls through `scrollBelowBar`, and marks
every row of the chain `data-arrived` (`.table` in `components.css`: a hover ground and an ink
edge, never a status colour). Its rows are not collapsed, so there is nothing to expand: the row
holds the lead time, the tick and Edit.

**A form that would be refused is refused HERE, beside the field, before any call.** An empty name
on "Write a new filing" went to the API and came back as zod's own sentence ("name: String must
contain at least 1 character(s)"). `RuleEditor` now checks every field its body requires, in the
request schema's terms (name and pack non-empty, a two-letter country, a day 1 to 31, a reason when
there is no formula), and draws the sentence in the field's own `error` ("Give the filing a name,
for example GSTR-3B."). Nothing shows until a save is pressed, each sentence goes the moment its
field is fixed, and it is remembered per form (a rule's id, or "new"), because the library keeps
one editor mounted while a partner moves between rules. **Focus moves to the first refused field,
below the bar**: the save row is at the bottom of a form about 900px tall and the name box at its
top, so a sentence beside the name is off screen from the button pressed. `.field-row` is
`align-items: start` now, so an error inside one column no longer lifts its input above its
neighbours (the old hint warning above was about `end`). The library's "Write a rule" gets all of
it for free; what only the API can know (a name already taken in that pack) still arrives in the
`refusal` slot.

**`/audit` says the service's NAME for a filing added or removed.** `obligation_rule.linked` /
`unlinked` carry `serviceName` beside `serviceKey` since the same day, fixed at the write.
`audit-words.ts`'s `NAMED_BY` prints the name on the key's own row ("Service: Payroll Processing",
never two rows), and an event written before it, or naming a service with no version, prints the
key as it always did.

**Found by measuring, and none of it visible to the gate:** the same-page hash landing under the
bar (above), and that `/admin/obligation-rules`' table is wider than a 1440px window, because the
Filing column's long reasons set its width, so the When column (and its new lines) starts off to
the right inside the table's own scroller. That was already true before these follow-ups and is
left for its own change.

**What review of the follow-ups found (2026-09-26), each watched red in Playwright first:**

- **"From November 2026" for a change that waits for January.** The line named
  `nextChange.effectiveFrom`, the day the change was recorded from, and the supersede form takes
  any day: a quarterly rule changed on 1 November read "From November 2026" while October to
  December was still due under the old rule. The API now sends `firstPeriodStart` (the backend's
  CLAUDE.md says how it is found) and the line names that, so the same card reads "From January
  2027". A period start is a 1st; only an event-driven rule, with no period, can start on another
  day, and that is said as the day.
- **The pill and the date above it described two different rows.** `standingOf` read the chain's
  NEWEST row, so after a change waiting on a fact the card said "Every quarter · the 30th", "date
  not known yet" and "It adds nothing to the calendar" while the confirmed row before it was
  dating this year's returns. Each chain row now carries its own `coverage`, and `todayOf` returns
  today's row's coverage and reason with its date, so the pill, the sentence and the picker's
  "cannot work out a date yet" are all today's. The newest row's standing is the second line's to
  say: "nothing goes on the calendar, because the rule from then on is retired" for a retired
  successor, and "once somebody confirms it in the library" for an unticked one. `willConfirm`
  stays on the newest row on purpose: it predicts what the API does, and a link confirms the
  chain's newest row.
- **Arriving from "Edit in the library" left focus on `<body>`.** The pressed link is unmounted
  by the navigation, so the first Tab went to the page's top and scrolled the row away. The
  anchored row is `tabIndex={-1}` and the arrival effect focuses it after `scrollBelowBar`, with
  `preventScroll`; the next Tab is that row's first control. Only an arrival does it, never a
  reload.
- **A local refusal sat beside the API's last one.** After a 409 ("already holds a filing
  named"), emptying the name and pressing again showed both sentences, and on the catalogue the
  409 came back on a fresh form after Cancel. `RuleEditor` calls `onRefused` when it refuses a
  save itself; the catalogue forgets which act was refused there (and on toggling or cancelling
  the form), and the library clears its `ErrorNotice`.
- **"yet.." on the card**: a firm's reason already ending in a full stop got a second one.

**The "Add a service" form has the same section (2026-09-26).** A partner filling in the form
looked for the filings on it and found none: the card's section only exists once the service is
saved. `NewServiceFilings` keeps a LIST (library picks and filings written there) and the page
sends it after the service is created: the service first (a link names its catalogue entry), then
each link, then each written rule with `serviceEntryIds`. Not one transaction, so a filing refused
after the service went in is said by name with the API's sentence, and a refused service keeps the
list. The section sits OUTSIDE the `<form>` and the submit reaches it with `form="define-service"`,
because Enter in any of the editor's text boxes inside the form would submit a half-written
service. Writing a filing the library already holds (same name and country) is refused on the
screen with a pointer to "Add a filing"; the API would only refuse it within one pack. The
sentence after says nothing reaches the calendar, because a new service has no client yet.

**Changing files under a running `next dev` can lose a route.** Stashing and restoring three files
for the red run left `/admin/obligation-rules` answering 404 until the page file was touched again.
It is the "stale dev server" case again, not a bug in the page.

## `/catalogue`, redesigned: a list, a page per service, and what moved out (W4B, 2026-09-28)

The user: *"currently it looks so complicated, use better colouring, make it better UX"* (brief
§8). Measured on the W4B fixture (17 services, 1280): **17,662px tall, 121 headings, 3,439
words, 298 form inputs in the DOM** (every card carried its own hidden new-version form), with
Standard terms and the discount limit underneath. The shape now:

- **`/catalogue` is one table** in the Wave 4 style: code · service (the delivery team under it)
  · Dept · countries · price · filings · status, sorted by the firm's Dept order and then its
  code (numeric: H2 before H10). The row's Dept is a tinted chip and a thin left edge (`deptTint`:
  first three Depts in the firm's order get `--cat-1..3`, anything else the spare). Search (name,
  code, Dept, team), **country chips** (the builder's `Tabs`; a service offered everywhere shows
  under every country, D3; each chip counts what the other filters leave) and a Dept select; the
  chip and the Dept ride in the URL, so "Catalogue" from a service lands on the same view.
- **Status is one of three** (`rowOf` / `rowFromHistory` in `catalogue/service.ts`): **Live**,
  **Draft** (never published), **Unpublished changes** (a draft NEWER than the live version).
  "Newer" matters: the registry has no discard, so publishing the newest of two drafts leaves the
  older one a draft for ever, and the list's `pendingDraft` is the newest draft LEFT. A draft
  older than the live version is history ("Never published" on the History tab), not a change.
- **Prices read "AED 4,000 / month"** (`priceWords`: `formatMoney`, so INR is in lakhs, plus
  "/ month", "/ quarter", "/ year", "one time"). A service with no list price shows its pricing
  note, capped narrow, or "Not set".
- **Nothing is hidden at 1280.** The table is max-content wide (`.table`), so one long pricing
  note ("As mutually agreed, after scoping the related-party transactions.") pushed Filings and
  Status 254px out of view on the first build. The note and the service name sit in capped
  inner spans (`max-w-36`, `max-w-64`) so they wrap; measured 950px table in a 950px wrap.
- **`/catalogue/[serviceKey]`** reads ONE route, `GET /config/service/{key}` (every version with
  its body), plus the form's context (`loadFormContext`: Depts and teams, processes, the firm's
  companies, the library). Tabs in the URL (`?tab=price|filings|history`), so the library's
  "Used in" lands on the filings. **Overview hides empty details** and says them in one line,
  "5 details missing: How it is delivered, Turnaround, … Add them", where **Add them** opens Edit
  with focus on the first missing box. The four texts are headed like labels (14/600 ink-2), not
  as page sections. **History** is every version with its state, when it was published, until
  when, its price and what it changed from the one before (`changesBetween`, field names in
  words; long texts named, not quoted).
- **Edit** opens the same form as Add, on the WORKING body (the waiting draft if there is one, so
  a second edit carries the first). **Save as draft** adds a version and the page shows an amber
  notice listing what it changes ("Price: AED 5,500 / month → AED 6,000 / month") under a brand
  **Publish**; **Save and publish** is both in one press, because changing a price is usually
  that. While a change waits the tabs show the LIVE version: it is what a proposal quotes.
- **Add a service** (`/catalogue/new`, the list's one brand button): four short cards, Basics ·
  Price · What's included · Compliance filings (optional). **The key is made from the name**
  (`keyFrom`: lower case, "-" joined, unique, "new" kept free for the route), because "Short
  name, lower case, no spaces, permanent" was a system slug on screen. **The currency follows the
  first country ticked** (`currencyFor`: the firm's company there, else D1's four, else the books
  currency) until the partner picks one. **Add the service publishes** (a new service has no
  proposal to move; the builder lists it at once), **Save as draft** does not. The calls are the
  old form's, in its order: the service, then each library filing, then each written one, then
  the publish; what it said lands on the service's page through sessionStorage (`ARRIVAL_KEY`),
  a refused filing named with the API's sentence. `description` and `category` are not asked:
  nothing reads either; an edit keeps whatever a body says (`bodyOf`'s `kept`) and Overview shows
  them when set.
- **The form checks what it can before any call** (`refusalsOf`: a name, an amount that is a
  number, whole days), beside the box, focus to the first; the API's own refusal is shown
  verbatim above the buttons. The amount previews as money ("AED 5,500") as it is typed.
- **Moved out.** **Standard terms** are `/admin/standard-terms` (below). **The discount limit**
  is on Your firm (W4A made the card and publishes it; the Catalogue's only ever drafted one).
  The sidebar gained Documents → Standard terms; the library's "Used in" and the letter page's
  "write another" sentence point at the new places.

**`/admin/standard-terms`: Default and one tab per company, like Standard prose.** A clause's law
follows the issuing company (D6): a letter is offered the terms whose governing law and courts
are its issuer's country (`lawFits`, the API's `refuseForeignTerms`) plus every term naming no
law. So **Default** lists the terms that name no law (on every company's letters), a **company
tab** lists the terms under its country's law (two companies in one country share them), and a
term under a country no company is in, or whose law and courts name two countries, is listed on
Default as usable by none rather than dropped. **Write a term** (a dialog) writes and publishes
in one act, as the Catalogue's form did; on a company tab the country is the company's and
fixed, and the partner types the words that print ("the laws of the DIFC"), the law required so
a company-tab term cannot silently become a Default one. The key is made from the title and the
country. A company with no country says so and links to Your firm. Read on `config:read`, like
the Catalogue it came from, because an associate drafting a letter reads these.

**What walking it found:** a field labelled "Search" is the second "Search" on every page (the
sidebar's search box is "Search the menu"), so the list's is "Search services"; a `<ul>` keeps
the browser's 40px indent here (preflight is off), so a list in a card needs `list-none pl-0`;
the fixture's second run found every datable India filing already confirmed, so the walk picks
an unconfirmed one afresh and wants a fresh fixture. Walk: `bib/demo-assets/tools/w4b-walk.mjs`
(after `EPB_TAG=… epb-fixture.mjs` and `w4b-seed.mjs`); measure: `w4b-measure.mjs`.

## The Escalated tab, and the ladder behind it (T4.5)

`/work-items` has a fourth tab and it is **not the board sliced**. The other three are the same
work filtered three ways; this one is a different KIND of row — the record that somebody was
TOLD about work — so it has its own renderer and the Board/List toggle is hidden while it is
open.

**THERE IS NOTHING TO CLICK ON A ROW, AND THAT IS THE DESIGN.** No dismiss, no snooze, no
acknowledge. A notice ends when the WORK moves — the task is finished, somebody picks up an
unassigned one, the filing is filed or decided about — which the API resolves as a join rather
than a column anybody can clear. A button that emptied this list without anything actually
happening would turn the one screen whose whole value is being believed into decoration. The
only control is a link to the thing itself: the way to clear an escalation is to do the work.

**AN EMPTY QUEUE HAS TWO MEANINGS AND THE SCREEN SAYS WHICH.** Nothing escalated because
everything is on time, and nothing escalated because the firm has never published a ladder, look
identical — and only one of them means the product is doing anything. `ladderPublished` is why
the empty state has two versions, and the second links to the screen that fixes it. `/calendar`'s
coverage tab exists for exactly this reason.

**"NOBODY" IS THE MOST IMPORTANT ROW ON IT.** A rung can fire and reach no one: nobody holds the
work, nobody is recorded above them, or no active member holds the rank it names. Those rows are
marked in danger tone with the reason in the tooltip, and counted above the table, because every
other row already has a name against it. The first real sweep raised fourteen notices and seven
of them reached nobody.

**A rung addressed to a GRADE shows as a rank, not a person** — an escalation routed to one
partner dies while that partner is on leave, so the notice belongs to everybody senior enough.

**And a person is rendered `displayName ?? email`.** `display_name` is nullable on an account and
is genuinely empty at real firms, which is how the first walk produced a row saying somebody was
told and a blank space where the name should be. The API sends both halves for that reason — the
audit trail's rule, applied a second time.

### What walking these two screens found

**THE `For` COLUMN READ AS WRONG, AND THE DATA WAS RIGHT.** A row titled *"TDS deposit — Lakeview
LOGISTICS Private Limited"* sat over a cell saying *"Lakeview Foods Private Limited"* — one is who
is billed, the other is which company files, and on screen it looked like a mismatch. `WorkRow`
already solves this and this screen had not copied it: **G0.1 — a group of four companies files
four sets of returns**, so the entity now sits beneath the client, and a row where they are the
same shows one line. A FILING shows an em dash for the client, because an obligation has no client
at all and backfilling the entity into that cell would have been the API inventing one.

**A HINT INSIDE A `<FieldRow>` COLUMN — THE THIRD TIME.** The ladder form's "What to call this
rung" and "Short name" boxes sat at two different heights with the Remove button floating between
them. `.field-row` is `align-items: end`, so a field carrying a `hint` stands taller and its INPUT
rides up above its neighbours. This file records it under `/admin/workflows`, T6.4 re-made it, and
T4.5 makes three. **A hint goes in a `<p className="field-hint">` UNDER the row**, and a button
gets its own line, because `.field-row > *` is `flex: 1 1 160px` and turns one into a banner.

Neither was visible to `tsc` or to `eslint`, and neither would have shown in a test.

`/admin/escalation-ladder` is where the numbers come from, and **nothing is set by default**: a
firm with no published ladder escalates nobody, deliberately, because a threshold this product
invented would be one nobody agreed to. Draft and publish are separate, like `/catalogue` and
`/admin/verification`. The grade rung offers the firm's own ACTIVE rungs and stores the RANK, not
the code, because a published body is frozen and re-resolving a code later would answer an old
question with today's ladder. The one impossible combination — watch unassigned work, notify its
assignee, where there is never one — moves the picker off it rather than leaving somebody to meet
a 400.

## `/dashboard` — and the gaps that are the point of it (T3.7)

**The MRR figure is not the feature. The list of what MRR could not count is.**

A headline number that silently drops what it does not understand is worse than no number:
a partner reads it, acts on it, and never learns that most of the firm's engagements
contributed nothing to it. So the API returns every exclusion with its reason, and this
screen shows them immediately beside the figure — not behind a disclosure, not in a footnote.
The first run against real data found **1,490 engagements stating no billing frequency against
34 that counted**. A tidier screen would have shown ₹31.2 lakh and looked complete.

Each reason gets its own sentence, because they are not the same problem: `unpriced` means the
firm agreed to work it has not priced; `no_frequency_stated` means nobody said whether it is
monthly or annual; `one_time` is real revenue that is simply not RECURRING. Only the second is
something to go and fix.

**DSO can be null, and null is not zero.** "0 days" reads as excellent collections. The truth
when a firm has billed nothing in the window is that there is not enough billing to say, and
the two render as different sentences.

**DSO is a ratio, and the sentence says so (2026-09-28).** It is what is owed divided by what was
billed in the last 90 days (issued invoices less their credit notes, drafts and cancelled ones
left out), times 90. It read "Paid on average 45.6 days after invoicing" on a firm where every
invoice was raised that day and nothing had been paid late; it now reads "What is owed equals
about 45.6 days of billing (last 90 days)". On that firm ₹76,700 owed over ₹1,51,400 billed
(₹1,53,400 less a ₹2,000 credit note) is 45.6; the query was right, the words were not.

**Every ageing band is shown, including the empty ones.** "Nothing is more than 90 days
overdue" is the most reassuring row on that table and it has to be visible rather than absent
— and a table that changed shape as debt moved would be unreadable week to week.

**The currency is stated once, at the top.** Every figure arrives already converted at the rate
stored on the document it came from — never a rate looked up today, which would change last
quarter's MRR every morning. Repeating it per row would be noise on a table where it cannot
differ.

**This screen is behind the FEE AXIS, not a role**, and it is the first place in the product
where that axis GATES rather than redacts. Everywhere else commercial visibility nulls an
amount and leaves the record, so "you may not see this" never looks like "there is no fee".
Here the whole page is money: a redacted version would be a page of nulls, which communicates
"the firm has no revenue" — worse than a refusal. So the API answers 403 and names the fix,
and the home page offers the link only to `principal.commercialVisibility`. Note that this is
NOT implied by being a partner: it is a separate flag on the membership, and a partner without
it is refused, correctly.

## Wave 4 on the commercial screens (W4C, 2026-09-28)

The brief (`W4-UX-BRIEF.md`) applied to clients, leads, proposals and their builder, letters and
theirs, invoices, receivables, the dashboard and the import. **What each screen DOES is as it
was; where things sit and how they read moved.** Walk: `bib/demo-assets/tools/w4c-commercial-walk.mjs`
(50 checks); measure: `w4c-commercial-measure.mjs <before|after>`.

- **The one brand button per screen:** Add a client (a dialog, was a card under the list), New
  proposal (client page, lead page), New engagement letter, Raise an invoice (a dialog), Edit in
  the builder (a draft letter), and **Issue in the invoice's header** (a draft's one committing
  act, still only for `tenant:admin`; Cancel stayed in the document card, away from it).
- **A form used once per record is folded, not deleted:** Register it and Add an identifier on a
  client (OPEN while there is none: an unregistered company is why the calendar is empty), Add a
  section, each wording kind's Add a line/paragraph (`DocumentBlocks`), Add a service on the
  letter page, Record the e-invoice reference, Issue a credit note. The lead's three cards are one;
  the client's "Attach an identifier" card is inside Identifiers.
- **A long list in a cell needs `.cell-text`.** `.table` is max-content wide, so the import
  template's SPOC column list (one unwrapped line) hid **2,124px** of the table at 1280 while the page
  reported no overflow. Two 24rem cells plus a pill column still spilled 5px; the SPOC cell is
  capped at 20rem.
- **Codes in words everywhere a reader sees them:** kind (Company/Person), entity type, identifier
  type (PAN, GSTIN, Email), stage, source, letter/invoice/engagement/dunning states, the letter's
  country (a name), a line's catalogue pin (`H1 · catalogue version 3`, never `key@version`).
- **`NoteList` takes an `example` prop** (the new line's "e.g." placeholder) and the proposal
  document's four scope boxes have one each. The document's typewriter ref line and fee column are
  the sans face now; its WORDING still restates the PDF (`words.ts`), unchanged.
- **Gated where it was not:** the client page's identifier form is offered on `party:write`, like
  every other write on that page (it was shown to everybody and refused by the API).

## Number boxes and phone boxes (2026-09-30)

- **Every box for a fee, price, quantity, discount, rate or advance is `<AmountInput>`**
  (`@/components/ui`). It takes digits, commas (grouping: people write 5,00,000) and one point,
  and no more places than `decimals` (2 money, 4 quantity or percentage, 10 an exchange rate);
  `signed` lets a leading minus in (a payment that reverses one). A letter, "₹" or a second point
  is simply not taken. The value is still a string, and **every submit strips the commas with
  `cleanAmount`** before sending, because the API takes digits only. A box the page filled with
  more places than it takes ("25000.0000") stays editable.
- **A phone is `<PhoneInput>`** (`@/components/phone-input`, not in the ui barrel: it pulls in
  libphonenumber-js and must not load on every page). A calling-code picker (the open list reads
  "India +91", the closed box shows "+91", `.phone-code` in `components.css`) and a number box
  that takes digits and the usual separators, stops at a complete number in the fixed-length
  countries (IN, AE, SG, US, CA) and at the plan's longest elsewhere, picks the country from a
  pasted "+971 …", and says "Not a valid number for India" on leaving a bad one. It hands the page
  E.164 through `onChange`, or a hidden input named `name` for a `FormData` form. `country` makes
  the code follow the form's own Country until somebody picks one. Stored phones print through
  `formatPhone` ("+91 98200 12345"). The client page's identifier form switches its Value box by
  Type (a phone box, PAN 10 characters, GSTIN 15).
- Walk: `bib/demo-assets/tools/typed-inputs-walk.mjs` (21 checks, on an `epb-fixture.mjs` firm).

## Money never becomes a number

The API sends amounts as decimal **strings**, because a JavaScript number cannot hold 1499.50
exactly, and this app keeps them strings all the way to the screen. `formatMoney` in
`client.ts` hands the string to `Intl.NumberFormat`, which formats a decimal string exactly;
`format(Number(amount))` would undo the whole arrangement at the last possible moment. That
is why `tsconfig.json` pulls in `ES2023.Intl` — the runtime has had exact string formatting
for years, only the ES2022 type declarations do not describe it.

A `null` amount is not zero and not an error: it is the fee axis. Somebody without commercial
visibility gets the proposal with its money removed rather than a refusal, so these screens
say so ("Hidden" on the proposals list) and show everything else.

**Hidden, never Not set (audit 2026-10-03, F10).** `formatMoney(null)` says "Not set", which
reads as "the firm forgot". For a money value that may be redacted use `<Money>` or
`<MissingMoney>` from `@/components/fees`: Hidden for a login that cannot see fees
(`useSeesFees()`, off the session's `commercialVisibility`), the `unset` words for everybody
else. A STATUS is not money: "Not issued" is decided by `issuedOn`, never by a null balance.

**What such a login is not offered (F33, B01, B27, B09).** The API refuses it every money write
(manual invoice, lines, payments, credit notes, a refund, a lead's value, a catalogue service)
and every PDF that prints fees (`Document.showsFees`), so the screens do not offer them: Raise an
invoice, Record a payment, Download on a fee document ("Shows fees"), the proposal / letter
preview (one line instead), Receivables in the nav. The builders still let it pick services:
a tick sends neither fee nor note and the API quotes the list price, and Details saves with
`feesUnchanged` so the fee is never overwritten with a null it was shown.

**The shape (Wave 4, 2026-09-28), and none of it follows the reader's browser:** INR in Indian
grouping with the rupee sign (`₹12,00,000`, never `₹1,200,000`), every other currency with its code
in its own grouping (`AED 5,000`), and no `.00` when there are no paise (`₹25,00,000.50` keeps
them). `formatMoney` is THE formatter for the screen; `formatMoney(null)` is "Not set". The
builder's and the letter's `pdfMoney` / `letterMoney` are deliberately separate: they restate what
the PDF prints, and a preview must match the paper. `previewAmount(amount, currency)` groups INR
in lakhs too while somebody types.

## The proposal screens, and the one that has no session

`/p/[token]` is public. The person opening it has no login and will not get one — that is
what a proposal is. The token is in the URL because a link has to be sendable, and the page
immediately moves it into a request **body**, so it does not travel onward into the API's
access logs or a Referer header. Since 0085 it is also where the client ANSWERS — see below.

The share link is shown **once**, on the send response. Only its fingerprint is stored, so
there is nothing to re-fetch — "Send again" issues a new one, and the old one stops working.

### Sending by email, and the client's answer (0085, 2026-09-26)

**Send is a form now** (since T6.18 in `<ProposalSendPanel>`, below; `delivery.tsx` is gone): "Email it to" — the person the proposal is prepared
for, when the firm holds their email, IN the box before anybody presses — an optional note, and
two buttons, "Send by email" and "Send without email" (the old behaviour: the link comes back and
the firm sends it however it likes). bib emails the PDF of record with Accept and Decline
buttons; replies go to the preparer. The card after sending says which happened: "Emailed to …",
or — the proposal IS sent either way — the email's failure in the mail server's own words beside
the link. A sent proposal has **Send again** (a new link, emailed or not, and the old one dies;
the form says so), an **Emailed** history, and "Client accepted / declined" kept for answers
given by phone or in a meeting.

**The email's buttons open `/p/<token>?answer=accept|decline` and answer NOTHING.** Mail
filters open every link in a message, so the answer is a form on the page: a name for either
answer, and for an acceptance a tick against `acceptanceStatement` — the API's own sentence,
shown WORD FOR WORD, because the API records the same words. Arriving from a button scrolls to
and focuses the answer card with that answer ready. The API's refusals are shown verbatim; they
are written to the client ("Type your full name.", "already accepted, and that answer stands").
**Download PDF** is a `fetch` of `POST /proposals/shared/pdf` saved as a blob — the token stays
in a body, never an `href`.

**The staff page's "Accepted by the client" card is the evidence** (`ClientAnswer`): the name
typed, when (with the time and the reader's zone — `longInstantTime`, the one place a minute
matters), which email's link, the statement ticked, the PDF's SHA-256, the address and the
browser. A colleague's recorded answer has no such card; the History names them.

**`<Documents key={sentPdf.versionId}>`** on the proposal page: sending files the PDF of record,
and the panel reads its list only on mount, so without the key it said "Nothing attached yet"
beside the email that attached it. Found by walking the send.

### A client's yes given outside bib — Record client's acceptance (0317, 2026-09-30)

`<RecordAcceptance>` and `<RecordedAcceptanceCard>` (`src/components/record-acceptance.tsx`) sit on
BOTH the proposal's Send panel and the letter page, offered only to `acceptance:record` (a partner,
by default) and only while the document is `sent`. How (a select), On (a date box, the sent day to
today), Who at the client, Their role, a Note, and the client's email: **required on a letter**,
optional on a proposal. The file goes up first through the ordinary `POST /documents` (kind
`correspondence`, attached to the same proposal or letter, role `acceptance_evidence`), and an
upload that worked is kept for a retry so a refused acceptance never files the email twice. Missing
fields are said before the confirmation opens (`ConfirmAction`'s `beforeOpen`). The one-click
"Client accepted" is gone (the API refuses an accept through `/decision`); "Client declined" stays
for `party:write`. A recorded letter's method reads "Recorded acceptance", the card under the
client's signature shows how, when, who, the note, the file and who recorded it, and both pages'
`<Documents>` panels are keyed on the acceptance so the filed email appears. Walked end to end by
`demo-assets/tools/acceptance-walk.mjs` (21 checks, including an associate being refused).

### The proposal PDF — "Proposal For Services" (0084, 2026-09-26)

A proposal prints now, in the firm's own format: a COVER (the issuing company's artwork, brand
asset `proposal_cover`, with "Prepared for" and "Prepared by" drawn over it), then Background,
the in-scope services, the work in sections by the firm's Dept with each service under its
catalogue code, the Summary of Fees and the Notes. `/proposals/[proposalId]` carries two things
for it:

- **The cover and the Background** — who it is prepared for (a PERSON from the client's own
  `structure`, the list the API checks, or the company alone), who prepared it (a colleague from
  `/tenancy/colleagues`; drafting names the drafter), the validity date and the Background
  paragraph. Since T6.18 these are edited IN PLACE on the document (below); the old "Cover and
  Background" card (`cover.tsx`) was deleted in T6.18's integration. `PATCH /proposals/{id}` answers
  with the whole record, and absent means "leave it", so each in-place save sends only its field.
- **"Proposal PDF"** — the ordinary `<Documents renderable="proposal">` panel. Not shared with
  the client's portal by default: a quote may never be sent.

`/admin/brand` has a fourth slot per company, **Proposal cover**, PNG or JPG, whose hint says
where the two names land so the artwork leaves room for them. The screen's banner used to say
nothing printed these marks at all, which stopped being true when the renderer shipped; it now
says what prints where, and that the letterhead is still only stored.

### The proposal as a document, and the Send panel (T6.18, 2026-09-28)

`/proposals/[proposalId]` now leads with **the proposal as the client will read it**, and every
card it had before sits below, in one 900px column. Two components in
`src/components/proposal-document/`, each taking only a `proposalId`, because the builder's step 3
mounts the same two:

- **`<ProposalDocument proposalId editable onChanged?>`** draws the PDF's own structure in the
  PDF's own order: cover, Background, in-scope services, a section per Dept lettered by RANK with
  each service under its catalogue code, the Summary of Fees, "valid until", and the Notes (team,
  general exclusions, commercials). The lettering is the API's: the read carries `document`, built
  by the same `planProposal` call the renderer makes, and `plan.ts` only joins each item back to
  its line (a local copy of the rules read "A. FRC" until the Dept list arrived and could letter
  differently). The cover's date is the read's `issuedOn`, the PDF's running-header day.
  `words.ts` restates the renderer's money and frequency wording ("INR 50,000 Yearly", en-US
  grouping, ISO code) so screen and paper say the same thing, down to the "Total INR 25,000
  Monthly + INR 62,500 Yearly, plus 1 service as mutually agreed" line under the Summary of Fees
  (D8, `totalsByFrequency`, added by the database, the grouping the PDF prints). One deliberate
  difference: the PDF joins a service and its company with a dash, the screen says "for".
- **Editing in place (D10)**, on a live draft, with `editable`, to a session holding
  `party:write`: a pencil on hover, on its own keyboard focus and always without hover; the piece
  becomes a box that saves on blur or Ctrl/Cmd+Enter (Enter for one line), and Escape keeps what
  it said. The refusal is a plain `role="alert"` beside the box and NOT an `ErrorNotice`: that
  takes focus, which blurs the box, which saves again. Focus goes back to the pencil only after a
  keyboard exit, and only if focus was lost (a person already in the next piece keeps it; the walk
  found the pencil effect stealing focus from the next box). Title, the two names, Background and
  validity go to `PATCH /proposals/{id}`; a Notes line to the document-block routes (edit, strike
  off, add); a service's name, its four scope texts ("Back to standard" = a null override) and its
  fee to `PATCH /proposals/{id}/lines/{lineId}`. An empty scope text is not drawn, as the PDF does
  not draw it; a row under the service offers to add one. A sent proposal draws no controls and
  says why in one line.
- **`<ProposalSendPanel proposalId onChanged?>`**: Send by email (the addressee in the box),
  **Send on WhatsApp** (the same send with no email, then an `Open WhatsApp` link to
  `wa.me/<digits>?text=` with the one-time share link, or `wa.me/?text=` when no phone is on
  record, again after Send again), "Just give me the link", and Download PDF (a draft renders one,
  a sent proposal downloads the PDF OF RECORD). After sending: Client accepted / declined with the
  decline reason, the Emailed history, Send again. The issued-link card shows only while the
  proposal is `sent`.
- **One read for both**: `store.ts` keeps the record per id; a write that answers with the whole
  record puts it in (`putProposal`), every other write re-reads. A read requested while one is out
  waits and reads again rather than sharing (the one out may predate the write), and a read that
  left before a `putProposal` is dropped. The page reads it too (`useProposal`), so sending turns
  the document read-only and the page's cards follow in the same render.

### The builder: three steps, one record, one way of saying money (T6.18, 2026-09-28)

`/proposals/new` → `/proposals/{id}/build?step=client|services|preview`, a full page (D14), in
`src/components/proposal-builder/`. **Step 1** is who it is for (an existing client picked by
typing, or a new prospect: lead capture, so the pipeline's dedup keeps working, D12), which of the
firm's companies issues it (the firm's country rule, D4, from `GET /firm-entities`) and the
currency that company quotes in (D1). **Step 2** is the catalogue one country at a time, the
issuer's country first, grouped by Dept then delivery team; ticking adds the line at its list
price when that price is in the document's currency and otherwise asks "Set fee" with the box
focused (D3); Details changes the fee, the frequency and the four scope texts for this proposal
only (D7). **Step 3** is `<ProposalDocument editable>` and `<ProposalSendPanel>`, the very two the
proposal page mounts. The step is in the URL, so a reload or a colleague's link lands on it.

- **ONE READ FOR ALL THREE STEPS.** The builder page reads the proposal through `useProposal`,
  the store the document and the Send panel share. A fee changed in the step 3 document moves the
  sticky footer's total in the same render, because the line PATCH answers with the whole record
  and `putProposal` hands it to every reader. Before the join the builder held its own copy, and
  the footer would have gone on showing the old figure until a reload.
- **Step 1 is keyed on the proposal's head** (`key={JSON.stringify(proposal)}`). It copies the
  draft into its boxes once, at mount; a cached record older than this visit, or a colleague's
  change, would otherwise sit in the boxes and be saved back over the newer one.
- **One way of saying money.** `pdfMoney`, `FREQUENCY_WORDS` and `totalWords` in
  `proposal-document/words.ts` are the PDF renderer's own wording, and the builder's rows, its
  Details form and its footer import them from there: "AED 4,000 Monthly" on step 2 is the same
  words on step 3 and on paper. The builder had its own ("AED 4,000.00 / month", from
  `formatMoney`) and it is gone. `totalWords` also drops a frequency whose every line has no fixed
  fee: the staff read sums it as "0" where the PDF's read has NULL and skips it, and the screen
  must not print "AED 0 One-time" that the paper does not.
- **The footer's Send does not send.** It scrolls to the panel and focuses the address box: the
  address, the note and the channel are the panel's to decide, and a button that decided all
  three would be a send nobody saw coming. It is still the step's one committing action, so it
  is the brand button.
- **"Add all standard terms for <issuer>"** sits on the letter page's Terms card (the route is
  T6.18 item 7): every published clause through the add-one rules, and what did not fit is listed
  with the API's own sentence ("…names IN as its governing law, and this letter is issued by an
  entity registered in AE…"). The one-at-a-time picker below it offers only what fits: the
  letter's country (`clauseApplies`) AND the issuer's law and courts (`lawFits`, from the read's
  `issuer.jurisdiction`, S6).

**Measured on a fresh fixture** (`bib/demo-assets/tools/epb-s4-walk.mjs`, 71 checks, screenshots
in `bib/demo-assets/notes/epb-s4-walk/`): **8 clicks** from "New proposal" on `/proposals` to
Sent for one company and three services (client typed + Enter; Next; three ticks; Next; the
footer's Send; Send by email), from about 20. A prospect in the UAE is issued by the Gulf company
in AED, an India service shows "Set fee", a scope edited in step 2 and an exclusion and a fee
edited in the preview are all in the PDF of record, the email reaches Mailpit with the PDF and a
`/p/<token>` link that accepts, the letter written up carries the edited exclusion (D11), and a
second draft moved to another company is asked first and gets that company's prose (D9).

### The letter builder (T6.18 S6, 2026-09-28)

`/engagement-letters/new` → `/engagement-letters/{id}/build?step=client|services|preview`, in
`src/components/letter-builder/`, the proposal builder's shape and pieces. **Step 1**: client,
country (decides the terms and, by the firm's rule, the issuer), issuing company, currency, subject,
addressee, work begins, Background, advance, and "Replaces" when the client has a signed letter
nothing replaced. On a draft it PATCHes only what changed; issuer and country lock once a term is on
the letter, currency once anything is priced. **Step 2**: the proposal builder's `ServiceRow`
(generic over `RowLine`; a letter's line is mapped by `rowLineOf`, a line a section pays for reads
"In section B"), and "For which company" asked ONLY when the client's `structure` holds more than
one company (a one-company client is the client itself, which is not a guess); "One fee for several
services" is the letter page's `FeeGroups`, moved to `letter-builder/fee-groups.tsx`. **Step 3**:
`<LetterDocument>` in the Annexure PDF's order, from the read's `document` (`planAnnexure`), edited
in place with the proposal document's `EditableText` / `EditableChoice` / `EditableFee` /
`NoteList`; an item's edit goes to every line it prints for. Money and frequency in the LETTER PDF's
words (`letter-builder/words.ts`: "INR 5,000.00 per month", "Annually", "One-off"), not the
proposal's. "Add all standard terms for <issuer>" is one click, and `<LetterSendPanel>` sends
(DocuSign asks who signs) with the owner rule's warning; Send is disabled, with the reason, until a
service and a term are on it. One store (`letter-builder/store.ts`) for all of it.

**"Write it up" on an accepted quote lands on step 2** with the quote's lines, issuer, currency and
prose (D11); the country is asked (a select, starting at the issuer's) only when the lines disagree.
The letters list's draft form is gone; "New engagement letter" is on the list and on a client's page.
The proposal builder's step 2 is services ONLY: its prose editor was removed, the preview edits the
same rows. Measured (`bib/demo-assets/tools/epb-s6-walk.mjs`, 69 checks): **9 clicks** from "New
engagement letter" on a client page to Sent with 3 services and the standard terms (40+ before),
**5** from "Write it up" to Sent.

### The preview IS the PDF (2026-09-28)

The user: *"I want proposal preview and EL preview exactly same as we send pdf with logos, cover
etc, not like a receipt."* Two layouts drift, so there is one: the server's. `<ProposalDocument>`
and `<LetterDocument>` (HTML imitations) are GONE; `<ProposalPdf>` and `<LetterPdf>` draw the PDF.

- **`src/components/pdf-pages/`**: pdf.js (`pdfjs-dist`), dynamically imported on these screens
  only (`load.ts`). The worker is bundled from `node_modules` with `new URL(…, import.meta.url)`,
  so it is served from OUR origin: the CSP has no `worker-src`, so `script-src 'self'` applies,
  and a CDN or `blob:` worker is refused. `useWasm: false` (the CSP grants no
  `'wasm-unsafe-eval'`; our PDFs need none). Pages are drawn off-screen to canvases at
  `devicePixelRatio` and swapped in whole, so the old pages stay until the new ones are ready; a
  white sheet per page with "Page 2 of 6" under it, fitted to the column.
- **Where the bytes come from.** A DRAFT: `POST /documents/preview` (files nothing; the API dates
  it the day Send will and fills in the firm's signature block, so an unedited draft is Send's
  own bytes). It is asked again 800 ms after the record last changed (`usePreview`, revision =
  the record's JSON). A SENT proposal: its PDF of record (`sentPdf`, fetched by
  `fetchDocumentBytes`), never a fresh render; Send files it since 2026-09-28. A sent LETTER: its
  signed copy when one is filed (an `uploaded` PDF of kind `engagement_letter` on the letter),
  else the preview route on its frozen rows. `/p/[token]`: `POST /proposals/shared/pdf`.
- **Editing ON the page.** The API returns `anchors` (a key and a rectangle per page, in PDF
  points from the top-left, e.g. `line:<id>.scope`, `fee:group:<id>`, `block:<id>`,
  `add:commercial`). `<PdfPages>` lays an invisible `button[data-anchor]` over each (outline and
  pencil on hover, `tabIndex=-1`); a click opens the piece's EXISTING editor in a popover under it.
  `<PdfWorkspace>` also lists every piece in an **Edit** panel beside the pages (a `<Dialog>`
  below `xl`), for the keyboard, screen readers, and pieces that print nothing yet (an empty
  Background). A hotspot clicked scrolls the list to its piece; a piece hovered outlines its
  hotspots. The pieces are built by `textPiece` / `choicePiece` / `blockPiece` / `addPiece`
  (`proposal-document/proposal-pdf.tsx`), each over the same `EditableText` / `EditableChoice`
  / `EditableFee` and the SAME write the imitation made (`PATCH /proposals/{id}`, `…/lines/{id}`,
  the fee-group and document-block routes). `EditableChoice` and `EditableFee` gained
  `initiallyEditing` / `onClose` for the popover; nothing about their writes changed.
- **Traps.** A popover's `close` is bound to ITS anchor: an editor finishing its save after
  another piece was clicked must not close the new one. The drawer button is wrapped in a
  `span.xl:hidden` because `.btn` declares `display` and an unlayered class beats the utility.
  With the company's cover artwork the proposal prints NO title (0084), so the title is edited
  from the list. The builder's footer and rows now say INR in lakhs too (`pdfMoney` restates the
  renderer's `inLakhs`); the letter's words stay western, as its PDF does.
- **Brand.** One quiet line over the pages when the issuing company has no logo or no cover,
  linking to `/admin/brand#brand-entity-<id>`.

Measured by `bib/demo-assets/tools/pdf-walk.mjs` (before on the old UI, after on this one, at 1440
and 390; shots in `bib/demo-assets/notes/pdf-preview/`): saving on the page redraws in about
1.8-2.0 s; the proposal's preview and its PDF of record hash the same, and so do the letter's
preview and the PDF Send renders.

## Screens are how API gaps get found

`/clients` and `/leads` were built after their APIs shipped, and building them found three
things no backend test had: `registerLegalEntity` was a write with no read, party 360 omitted
the organization/person detail the create form captured, and relationships came back as
uuids. All three were fixed in the backend rather than worked around here — a screen that
renders a uuid is telling you about the API, not about itself.

So: when a screen wants something the API does not return, the default is to fix the API.
Joining, formatting or looking things up per row in this app hides the problem from the next
consumer.

`/receivables` found the fifth and sixth: the collections list returned a balance with a
`partyId` and no name and no invoice number, and the dunning queue returned a rung with an
`invoiceId` — asking a partner to approve putting a uuid on credit hold. Both are joined in the
API now, and the backend's smoke walk asserts the client name so it cannot quietly go back.

`/audit` found the fourth one: the trail named its actor by uuid and nothing a `ledger:read`
holder could call resolved it. The backend joins the account at read time now — the stored
row still keeps only the id, so erasure still works and `actor: null` is a real state this
app has to render, not a bug.

## A signed letter is a different kind of screen

`/engagement-letters/[letterId]` stops offering edits once the letter is signed, because the
DATABASE refuses them — not this app. It shows the signature, its method and the content hash
instead, and says plainly that a change is a new letter. The clause picker offers only clauses
that apply to the letter's jurisdiction and are not already on it: the API refuses the rest,
and offering what will fail is not honesty, it is just a slower error.

The signature form says out loud that it records a colleague's **attestation**, not a
cryptographic signature. The audit trail says the same thing (`signatureMethod: attested`), and
a screen that implied more than the data supports would be the interface lying about the
record.

### The Annexure letter, and one fee for several services (0083, 2026-09-26)

Every letter drafted now prints in the firm's own format — a cover letter, Annexure 1 (scope,
deliverables and a Summary of Fees by SECTION) and Annexure 2 (numbered terms). A letter issued
before it re-renders in the classic layout it went out in; the header's pill says which, from
`letter.layout`, and the screen never offers to change it.

- **"Sections and fees" is a fee group per section** (`fee-groups.tsx`). One fee for the services
  in it — "B. Ongoing recurring services, USD 5,000 per month" for twelve lines across four
  companies — and its services carry no price of their own. The section's LETTER is the API's
  `code`, never computed here. Striking out a section that still prices a service is DISABLED
  with the sentence in its title, because the API refuses it and a vanished button reads as a
  missing feature.
- **A service is put in a section when it is added** ("Its fee" — the price boxes disappear, since
  the API refuses a grouped line with a price) **or later from its row** (`LineFee`). Moving one
  OUT opens the two boxes that say what it costs now, rather than sending the request the API
  would refuse.
- **The four scope blocks are writable at last**: "Tailor the wording for this letter" on the
  add form, each box's placeholder the catalogue's words it would replace; an empty box sends
  nothing, which is "print the catalogue's". Each row's "What it covers" shows the words the PDF
  prints, marked where this letter wrote its own.
- **A letter written up from a quote carries page one's four facts (2026-09-27).** The quote's
  "Write it up as an engagement letter" form holds Title (the subject line, starting as
  "Engagement Letter for <client>", the firm's own wording), Addressed to (the quote's Prepared
  for, from the same `structure` people), Background (the quote's paragraph) and Work begins
  (blank = the signature day), each filled BEFORE anybody presses. The route took all four since
  0083 and the form sent none, so every such letter opened "Dear Sir or Madam," over no
  Background while the quote named the person and held the paragraph. An emptied box is omitted,
  never sent as "".
- **Cover letter and Acceptance are two more kinds of the letter's own prose**, drawn as
  paragraphs and written in a paragraph-sized box. They are a LETTER's only: every document
  screen passes `DocumentBlocks` the kinds its document carries (`LETTER_BLOCK_KINDS`,
  `PROPOSAL_BLOCK_KINDS`), and the public quote page lists only a proposal's.
- **The invoice picker names a section's fee and does not prefill it.** A grouped engagement's
  `unitAmount` is null because the price is the whole section's; four services of a 5,000
  retainer are billed 5,000, not 20,000, and the hint says so.

### Who a letter or an invoice may name (F-10-1, 2026-09-25)

Every party picker on a letter and an invoice used to be the firm's whole book, and the API
checked only that the party was the FIRM's. So a letter could be "issued by" a client, cover a
line for another client's company (whose work then landed in this client's portal) and be
addressed to another client's director; an invoice could be charged by a client — opening a
numbered GST series in its name — or bill the firm itself. The API refuses all of that now, and
**each picker offers exactly what it accepts, read from the API rather than built here**:

| Picker | Reads |
|---|---|
| letter "Issued by", invoice "Charged by" | `/firm-entities`, the firm's own companies (members since 0313, whether or not a country points at them) |
| letter "Client", invoice "Bill to" | the book, minus those companies |
| letter line "For which company", a quote's "Which company is this work for?" | `/parties/{id}/structure` → `entities` |
| letter "Addressed to" | `/parties/{id}/structure` → `people`, re-read when the client changes |
| invoice line's engagement | `/parties/{id}/billable-engagements`, already the billed client's |

**`structure` is NOT `groupCompanies` (`lib/group.ts`), and swapping one for the other is the
bug.** `groupCompanies` reads the group BOTH ways round, for portal access; a letter may cover
only the client and what it HOLDS — subsidiaries at any depth, and companies it is a shareholder
or director of (Shrestha's decision). The quote panel read `groupCompanies` until this, and so
offered the client's parent and its shareholders: companies the letter then refused.

## Deleting a mistake — a lead, a draft proposal, a draft letter (0086, 2026-09-27)

Until 0086 a mistake had nowhere to go: a lead could only be closed as LOST (a lost deal that
never existed, counted in the pipeline), a draft proposal could only be SENT, and a draft letter
could only be WITHDRAWN (on the list for ever, marked withdrawn). The user decided: delete what
was made by mistake while nothing depends on it and it has not left the firm, and **hide it rather
than erase it** — the backend's CLAUDE.md has the whole rule.

**One component, `DeleteMistake` (`src/components/delete-mistake.tsx`), for the three pages**,
because it is one act and three hand-written versions would disagree on the two sentences that
matter: a deletion is not an outcome, and it cannot be undone.

- **The API says in advance whether it would work.** Each page's read carries `deleteRefusal` —
  the code and sentence the DELETE would be refused with, or null. The card appears only when it
  will work, or — for the refusals worth reading, which each page names in `explained` — shows the
  API's sentence where the button would be ("Proposal PR-2026-0005 was drafted from this lead…",
  "only a firm administrator can…"). A refusal about what the thing IS (sent, signed, converted,
  deleted) draws no card at all: the page already says that, and a disabled button nobody can
  use is noise. `party:write` comes from `useSession()`, as on `/clients`.
- **Confirmed IN PLACE**, the catalogue's "Remove from this service" shape: the quiet button is
  replaced by a warning saying what happens, with "Delete it" (destructive) beside "Keep it".
- **After it works the page reloads and says so.** `DeletedNotice` — `warn`, not `danger`,
  because nothing went wrong — names when (`longInstant`) and who, and every control that would be
  refused is gone: a proposal's and a letter's `isDraft` is false once deleted, the lead page hides
  its forms, the Documents panel stops offering to attach, and **the letter's own wording is
  `editable={!isSigned && !deleted}`** — that panel was gated on "not signed" alone, so the walk
  found Add and "Strike it off" on a deleted draft (the API refuses them too since 0087). The lists
  need no change: the API leaves a deleted item out of them.
- **A draft letter has no Withdraw any more.** Withdraw is for a letter the client has SEEN; a
  draft nobody has seen is deleted, at the foot of its page.

**What walking it found, and no gate could have: a double-click deleted without the warning ever
being read.** The two states of the card had the same shape — a `div` holding a `div.cluster`
holding a `<Button>` — so React REUSED the one `<button>`, relabelled it "Delete it", and focus
stayed on it: a second click, or a second Enter, on "Delete this draft" pressed "Delete it". Both
branches are KEYED now (`"ask"` / `"confirm"`), so the quiet button unmounts and `useSwapFocus`
puts focus on the warning; measured with Playwright for mouse, keyboard and a real `dblclick`.
**Any confirm-in-place built from the same parts needs the same keys** — the catalogue's is safe
only because its two branches happen to differ in shape.

## The billing screens, and the two numbers that behave differently

An invoice number is not a document reference. `PR-2026-0007` may gap — somebody abandoned a
quote — but a tax invoice series must be consecutive, so `/invoices` never lets anybody pick
one: the API allocates it inside the write. A cancelled invoice therefore still appears, still
numbered, and the screen says why. A replacement is a new invoice.

**There is no "paid" badge anywhere, because there is no such column.** An invoice's status is
about the DOCUMENT — drafted, sent, withdrawn — and what has been paid is arithmetic the
database does over invoices, payments and credit notes. This app renders the four figures the
API returns and adds nothing up: a badge would be a cache of a sum, and it would drift the
first time a payment was corrected.

**Only an issued invoice owes anything (2026-09-28).** The "What is owed" card rendered whenever
the balance read answered: a cancelled invoice showed its whole value as Outstanding and a draft
four zeros that read as settled. The card is for `issued` only; a draft says "Not issued yet, so
nothing is owed." and a cancelled one "Cancelled, so nothing is owed.", as the list and
Receivables already did.

**The company that signed the client's letters charges for the work (2026-09-28).** The number
comes from "Charged by"'s series (since 0322 when the invoice is ISSUED, not at the draft) and a
company cannot be changed on an invoice, so the raise dialog no longer defaults to the first company. Choosing "Bill to" reads that client's
`billable-engagements`: when every letter was issued by ONE company it is preselected and the
letters are named under it ("Issued EL-2026-0001."); with none, or letters from several, the
select stays on "Choose the company…" and `required` stops the form. On the invoice, "What is
this for?" disables an engagement another company signed ("(billed by 10x Global FZCO)"), and
the API refuses it too (`ENGAGEMENT_OF_ANOTHER_ISSUER`). The same goes for an engagement priced
in another currency, "(priced in USD)", because a line takes the INVOICE's currency and USD 3,000
became ₹3,000 (`ENGAGEMENT_IN_ANOTHER_CURRENCY`); and when the preselected company's letters for
the client are all in one currency, the dialog prefills it ("As priced in EL-2026-0007."). Its
rate still starts at 1. The line form prefills the letter's
figures through `formatCount` ("1", "25000", never "1.0000"); every edit form that prefills from
an API decimal does the same.

**A negative payment is a real thing and the form says so.** A bounced cheque is a reversal
with its own date, sitting beside the original — not the original edited away. Both rows show,
because "it was paid and then it was not" is the fact.

**A credit note asks for a reason from a dropdown, never a sentence.** Without the category the
numbers always reconcile and *why* forty thousand came off does not; "how much did we write off
to service failures" is a GROUP BY, which free text cannot answer. The particulars go in the
note beside it.

`/receivables` carries the DECISION QUEUE, and it is the point of the screen. A machine may
chase a client; only a person may put one on credit hold or send a matter to lawyers. The
worker climbs to those rungs and stops, and the queue shows the client, the invoice number and
what is outstanding NOW — the API joins all three, because a queue of uuids would be asking
somebody to approve something they cannot see. Rejecting is offered as prominently as
approving: the firm looked and chose not to, which is a fact somebody wants later.

### Automatic billing: To raise, Billing not set up, and the switch (auto-invoice, 0318)

Ashish's rule: no service is delivered unbilled. The daily sweep writes a **bill** (`billing_due`)
for each period that has fallen due on an engagement whose billing is set up, and a person raises
the invoice from it. **The sweep never makes a period invoice**: a manager decides what goes on one
(which bills, the tax, a price the letter left open). Since 0322 a draft has NO number (it is drawn
at issue), so the one automatic draft there is, the advance at signing, burns nothing if cancelled.
`bib/prompts/auto-invoice/PLAN.md` has the rules and the API; these are the screens.

- **To raise** (`src/app/invoices/to-raise.tsx`) is one card per invoice that COULD be raised:
  client, company (the series), currency and manager (whose revenue), the four the API refuses to
  mix. Oldest bill first. A bill is named in the LETTER's words (`serviceName`: the letter line's
  own wording, or the fee group's title, never the catalogue's name), because that is also the
  invoice line's text and a client checks an invoice against what they signed. Each card's **Raise invoice** (secondary: one brand button per screen, and
  that is the header's) drafts one invoice from the ticked bills; ticks are per raise and reset after
  any act, because a kept untick left the card's button disabled with nothing saying why (the walk
  found it). The dialog asks per bill for the tax rate (prefilled with `lastTaxPercent`, the last
  invoice line for that work) and, only where the letter fixed no price, the amount; the rate starts
  at the letters' own when they agree; no `asOf` since 0337 (the API dates it on its company's
  day). Rows say pro-rata ("17 of 31 days", "of
  ₹50,000"), **Overdue, also with <manager's manager>** once escalated (`escalated`, 7 days, computed by
  the API), and the API's `managerNote` in the warn tone when the bill fell back to the Key Manager. A
  bill on a draft stays listed ("On a draft", the number) until the invoice is issued; a cancelled
  invoice gives its bills back. **Skip** needs a reason and has no undo; **Link** offers only the
  client's invoices from the same company in the same currency, not cancelled (what the API takes).
  Raised and skipped bills are under "Show raised and skipped". Without the fee axis amounts read
  Hidden (`commercialVisibility` on the session), and a priced bill is not asked for an amount.
- **Billing not set up** (`not-set-up.tsx`): recurring engagements the sweep cannot bill. A fee group
  is ONE row ("One fee: <title>") and setting it sets the group. **Set billing** opens
  `BillingScheduleDialog` (`src/components/billing-schedule.tsx`): two dates, **Bill from** (the first
  period billed; the API snaps it to the period's first day) and **First invoice on** (that period's
  invoice date; later ones follow one span after). One date cannot say whether 1 Nov bills October or
  November. The boxes open on the API's `suggestion` (the current period, billed the day after it
  ends), never on a date worked out here: a quarter or a year is cut by the firm's financial year.
- **The client's Engagements panel** has a **Billing** column: how often, then "From July 2026 · First
  invoice 1 Aug 2026", or "Not set up" in the warn tone, and Set billing / Change (the same dialog,
  which reads `/billing/unscheduled` for the suggestion, since the panel has none; Change has **Stop
  billing**, both dates null). `billable-engagements` carries `billingFrom` / `firstInvoiceOn` for it.
- **Your firm → Automatic billing** (`#billing`): one switch, saved as it is switched, off by default.
  There is no firm go-live date; each engagement starts at its own Bill from.
- **The invoice page** names the **Manager** and the **Engagement letter(s)** its lines bill (linked),
  "Not set" on a hand-raised one.
- **My day** reads `/billing/dues?mine=true`: one row per invoice to raise ("Raise the invoice:
  Bookkeeping, Jul 2026 and 3 more") or draft to issue, due the last day before the oldest bill
  escalates, so it turns Overdue the morning the manager's manager gets it; theirs reads "Escalated
  to you · with <manager>".
- **A bill with no price** (`priced: false`, never redacted) is also on the client's SPOC's (for
  that Dept) and every administrator's My day, "Needs a price · with <manager>", until an amount is
  on a draft. Ashish asked for a reminder to the SPOC, the manager and the admin every week; the
  reminder is a flag that counts weeks ("No price yet", "No price for 4 weeks", `noPriceWords`),
  and the To raise row shows the same. Nothing is sent. `priced` is also what tells "No price"
  from "Hidden": a login without fees is still asked the amount of a bill that has none.
- **The letter says when a fee is billed (phase 1b, 0319).** The letter page's Services table has a
  **Billed** column and each fee section a "Billed" line: `BillingTimingControl`
  (`src/components/billing-timing.tsx`), "At the end of each month" (the default and what a letter
  that says nothing means; the bill is made on the period's LAST day since Q042, 0339) | "At the start of each month" | "On a date I choose" (then a date box). On a
  draft it saves as it changes (PATCH line / fee group `billingTiming` + `billingOn`); on a sent or
  signed letter it is the words the PDF prints. A one-off reads "Billed by hand", a grouped line
  "With its section". Signing with the firm's switch on sets each engagement's schedule from it
  (the API's GoLiveScheduler), so those never reach "Billing not set up". The builder's services
  step does not offer it yet: it is chosen on the letter page. Walk: `ai-1b-walk.mjs` (16 checks).
- **The advance and the final bill (phase 2, 0320).** Every advance is a tax invoice (since 0322 it
  holds no work: see the next bullet). To raise: an advance bill with no automatic draft (no tax
  rate, or its draft was cancelled) has its own **Raise invoice** (no tick: the API raises it alone) and no
  Skip; a final bill (one-time work done) is marked; a bill with an issued advance says "Less up to
  ₹X advance" (the API takes it off, earliest bill first, before tax, and a raise the advance pays in
  full answers `invoiceId: null` + `covered`: "No invoice needed"). Below the cards: **To refund** (an
  admin's "Give it back" = credit note `advance_refund` with its tax, or "Keep it" with a reason) and
  **One-time work with no process** (Bill it now). The letter page has an **Advance** column for
  a service's own advance (`LineAdvanceControl`, saved on blur; no column on a letter with one advance
  for all) and an Advance card (`AdvanceStatus`) where "Record the advance" was. `billLabel(d)` names
  any bill. Walk: `ai-t3-walk.mjs` (fresh fixture with NO default tax rate, so the advance is raised
  by hand; FIFO and the refund).
- **The advance starts the work and is chased (0322).** Ashish: the advance invoice is drafted at
  signing and the work starts at once; the SPOC, the Key Manager and the partner are reminded until
  it is paid, and the admins weekly. Approve start is GONE.
  - **"Draft" where a number will be.** `invoiceNumberWords(number, status)` ("Draft", "Cancelled
    draft") on the invoice list, To raise ("On a draft"), the Link dialog, the Advances tab and My
    day; the invoice page is titled "Draft invoice", its Issue confirm says "It gets the next number
    in <company>'s series", and Cancel on a draft says no number is used up. A raise answers
    `number: null`: only `invoiceId: null` means "No invoice needed" (the walk caught the screen
    reading every new draft as covered).
  - **Advances tab** (`advances.tsx`): every advance, pending first, Overdue first among them; the
    `AdvanceStage` pill (No invoice yet · Draft, not issued · Not paid yet · Part paid · Paid in full,
    "…, overdue" in the danger tone) and one line (`advanceLine`: "No tax rate for <company>. Set one
    on Your firm.", "Waiting for an admin to issue it. Signed 2 days ago.", "₹20,000 of ₹59,000 paid.
    Issued today."); who is reminded under the letter. No buttons.
  - **My day** reads `/billing/advances?mine=true` for EVERY staff login (the API answers only what
    the caller chases, with `duties`). An admin: "Issue the advance invoice", "Raise the advance
    invoice", "Set a tax rate for <company>" or "Link INV/… as the advance". Anybody else on a draft:
    "Advance invoice: with an admin to issue", whose turn **An admin** (a new `Turn`); with no invoice
    yet they may raise it themselves (`party:write`, the tax rate typed in the dialog). Issued: "Advance
    not paid: INV/…" / "Advance part paid: INV/…", whose turn **The client**. The kind line says the
    letter, "signed/issued N days ago" and "you are the SPOC, Key Manager"; "Escalated" a week after
    signing. Dated `overdueOn` minus a day (the API's, from the firm's days), so it turns Overdue the
    morning the tab does, and **Today until then**: dated by its due day an unpaid advance sat in the
    closed Later bucket for its first week, which the walk found, and Ashish asked for the reminder to
    stay on the dashboard. A bill's draft (`/billing/dues?mine`) reads "Issue the draft invoice: …" to
    an admin and "With an admin to issue: …" to anybody else (review item 14b), because issuing is
    `tenant:admin`.
  - **To raise → Show raised and skipped** reads `/billing/dues?status=all` when opened (the page's
    list is pending only since 0322's 14a), and again after any act while open.
  - **Your firm → Automatic billing** (`#billing`) gained two parts under the switch, each a nested
    `SetOnce` (a rule above, an h3, Change): **Advance reminders** (`#advance-reminders`: draft overdue
    after N days, unpaid overdue after N days from issue, the partner's grade from `/tenancy/grades`
    by RANK, "Director or above", ranks shared by two rungs read "Director / Partner", a rank no rung
    holds still shown; the weekly summary's weekday and hour, in the firm's zone) and **Default tax
    rate** (`#tax-rates`: one box per company, `AmountInput decimals={4}`). Each saves with its own
    partial `PUT /billing/settings`, so one never overwrites the other. The API keeps a rate it is not
    sent, so emptying a box that had one is refused on the screen ("It can be changed, not removed").
  - The letter page's "advance ₹X · outstanding" line lost its suffix: nothing writes
    `advanceRecordedAt` since T3, and "outstanding" stayed after the advance was paid. The Advance
    card says where it stands.
  - Walk: `bib/demo-assets/tools/ai-adv-walk.mjs` on a fresh `ai-fixture.mjs` firm: the settings form,
    signing (draft, no number, everything active), each role's My day (admin, SPOC, partner, someone
    with no duty, a non-admin manager's bill draft), issue, a week on (signing moved back by psql on
    THAT tenant only), the weekly email in Mailpit through `ai-digest-tenant.mts` (the worker's
    sweep, its firm list cut to the fixture), FIFO and the refund.
- **To adjust: advances taken before the letter (0363, Q044-Q048).** `src/app/invoices/adjust.tsx`
  (`AdjustTab`, `?tab=adjust`, its count the open ones in the warn tone) reads `/advances` (`open` by
  default; "Show mapped and cancelled" reads `all`). A row: client and company, the invoice (Draft /
  number), who raised it and when, the paid pill, the advance before tax, each mapping (service and
  job, or "All services of EL-…" from a signed letter; amount, what bills took, whose revenue; ended
  ones keep who and why; "Left on a finished service" in the warn tone), what is left, and the per-
  currency total above ("Left to adjust: ₹… · AED …", never added). **Raise an advance** (secondary:
  the page's brand button is Raise an invoice) needs `advance:manage` and fees: client, Charged by,
  currency (and the feed's rate for another), amount before tax, tax rate prefilled from the
  company's default via `formatCount`, manager (blank = the client's Key Manager), a note; it lands
  on the draft invoice. **Map** (an issued one with something left) lists `/advances/{id}/targets`:
  one amount box per service, a job select, a service in another currency or company disabled with
  the API's own refusal; the dialog says when the total is more than is left. **End** asks why.
  **Give back** (`invoice:issue`) confirms the credit note. Without fees: Hidden, no actions.
  The same list is on the client page (`clients/[partyId]/advances.tsx`, Raise preset to the client).
  The letter page has **Advance received** (`components/advances-received.tsx`): on a draft, tick the
  client's issued advances and the amount, then Save; a warn notice when the letter also asks for an
  advance (that is further money). Your firm → Automatic billing → **Advances to be adjusted**
  (`#unmapped-advances`): the reminder's day of the month. Walk: `bib/demo-assets/tools/adv-walk.mjs`
  (50 checks, fresh `adv-fixture.mjs` firm each run).
- **Revenue by manager (T4, no migration).** `/dashboard` has a **Revenue by manager** section
  (`src/app/dashboard/revenue-by-manager.tsx`) reading `/dashboard/revenue/by-manager?months=12`: a
  **Period** select (each month, newest first; **This financial year**, from the firm's own
  `financialYearStartMonth`, offered only when the firm has set one, so a US firm gets January and
  nobody is assumed to start in April; and the whole window). Columns Manager, Billed (before tax,
  less credit notes), Collected (cash, with tax), Owed now (today, with tax, does not move with the
  period), Invoices; one line says which include tax, because the three are not meant to add up.
  Biggest billed first; **No manager** always last while it has a figure; a **Total** row that equals
  the firm (billed = Billing by company's all-companies figure, owed = Owed to the firm). A leaver
  keeps their row with a **Left** pill; an id the roster cannot name reads "Not on your staff". A row
  with nothing in the period and nothing owed is hidden. Period sums are `sumSigned` on the API's
  strings, the sort is `commonUnits` on bigints: still no JS number. The **Raise an invoice** dialog
  has a **Manager** select (active staff from `/tenancy/colleagues`), preselected to the client's
  Key Manager from `/parties/{id}/assignments` (in force, still staff) when "Bill to" is chosen; the
  hint says where the default came from ("Key Manager of this client.", "Their Key Manager has left
  the firm.", "This client has no Key Manager."). On a **draft** invoice the Manager is a quiet select
  saved as it changes (`PUT /invoices/{id}/manager`); issued, it is text. The API refuses anyone not
  on the staff (`MANAGER_NOT_STAFF`).
- **Safeguards from the review (0321).** **Skip** shows only to a login holding the firm's
  `billing:skip` (Partner and Manager by default; `canSkip` from the session), and on an advance
  bill only once nothing waits on it (`advanceHoldsWork: false`). **Link** on an advance bill is
  an admin's (a paid invoice starts the work). After an advance's credit note, the screen says
  what to pay back from `paid` ("Pay back ₹X", never more than was received; "Nothing was paid,
  so nothing goes back." when nothing was). A second person acting on the same bill gets the
  API's `BILL_BUSY` sentence. Invoice lines name the advance invoice with no amounts in the words.
- **Work vs Billing (Q041, 2026-10-04)** is the third tab (`?tab=work`, `work-vs-billing.tsx`), read
  from `GET /billing/work-vs-billing`: one row per client, service and period with the work, the bill,
  its invoice and the money, and a sentence wherever a person must act. The page reads the default view
  with the rest, so the tab counts the rows that need attention (danger tone); the tab asks again only
  when a filter changes (Client, Manager, From and To months, Only problems). `?client=` sets the client:
  the client page's Engagements card links there ("Work vs Billing"). A strip (Need attention, Done not
  billed, Unpaid past due, Skipped; the ageing as "N over 30 days") and four columns, so it fits 1280:
  **Client and service** (client, service, period and letter, manager), **Work** (pill, the day done,
  the filings under it), **Billing** (the bill's pill and amount, its date, the invoice and payment pill,
  how late and what is owed), **Needs attention** (the flags in the danger tone, the notes muted, a link
  to the fix: Set billing, Automatic billing, To raise). The API sends codes; `flagWords` / `noteWords`
  are the words. A retainer billed while its month is open reads "Billed before the work is finished."
  and is never red. Without fees: "Fees hidden" and no amount anywhere. **Download CSV** (2026-10-04)
  saves what the table shows, filters and all, built in the browser from the rows already there (no
  route, so the fee wall holds: no amounts for a login without fees). `src/lib/csv.ts` is the one CSV
  writer: a UTF-8 BOM (or Excel garbles ₹ and names), RFC 4180 quoting, CRLF, and OWASP's formula
  guard (a TEXT cell starting `= + - @` gets a `'`; number cells stay numbers so they still sum).
  Amounts as plain decimals with a Currency column, days as YYYY-MM-DD, statuses and flags in words.
  Walk: `wvb-walk.mjs` (50, incl. both logins' files).
- Walk: `bib/demo-assets/tools/ai-walk.mjs` on an `ai-fixture.mjs` firm, sweeping that one firm with
  `ai-sweep-tenant.mts`. **It paces itself under the API's 300 requests a minute**: the shell reads a
  429 on `/auth/me` as signed out and sends the page to `/login`, which a fast walk hits mid-run.

### A yearly bill on its filing's day, and Raise invoice now (Q071, 2026-10-05)

Ashish (4 Oct): yearly statutory work is billed ON its due date; other yearly work on a day set
when the letter is finalised; and after a job or task closes, offer to raise the invoice. The rules
are the backend's (`bib-backend/CLAUDE.md`, "A yearly bill on its filing's due date"); the screens:

- **The letter builder's yearly words** (`components/billing-timing.tsx`): a yearly line offers
  "On its annual filing's due date, else at the end of each year" (the default), "At the start of
  each year", and "Every year on a date I choose" (the existing `on_date`, which IS the "invoice
  setup at EL finalisation": no new field). A sent or signed letter prints the same words.
- **`BillEarly`** (`components/bill-early.tsx`) on the job page (job done) and the task page (task
  finished): `GET /billing/bill-early?jobId=` / `?workItemId=`, nothing rendered when there is
  nothing to offer. "Raise invoice now" writes the bill (`POST /billing/bill-early`) and takes the
  reader to To raise, where it is ticked and raised the ordinary way. No fee line without fees.
- **To raise** has "Work done before its bill date" (Bill it now), beside "One-time work with no
  process"; the fee column says Hidden without fees, No price when the letter named none.
- **My day**: `bill-early?mine=true` rows for the bill's manager, under Today, no due day (an
  offer, not a deadline), opening the job.
- Walk: `demo-assets/tools/bdr-walk.mjs q071` (38) on `bdr-fixture.mjs`.

### Who won the work, and the revenue report (Q049, 2026-10-05)

- **"Won by"** on the letter page (`components/letter-originator.tsx`, a `MetaItem` in "The
  document"): the originator and how it was arrived at ("From the lead's owner", "From who prepared
  the proposal", "Set by Pat Partner on 05 Oct 2026", "Nobody recorded"). **Change** only for a
  `tenant:admin` login; the select offers the colleagues and "Nobody". Correctable on a SIGNED letter
  too: it is not a term.
- **"Revenue report"** on The firm's numbers (`app/dashboard/revenue-report.tsx`), under Revenue by
  manager: By (Manager / Originator), From, To (default: this financial year to date, the firm's own
  year), Company, Currency. **One table per currency with its own total; never a figure across two
  currencies**, and nothing converted (Revenue by manager above it still converts at stored rates,
  as before). Download CSV (`lib/csv.ts`, one row per person and currency, then each currency's total).
  The whole page is behind the fee axis, so a login without fees never reaches it.
- Walk: `bdr-walk.mjs q049` (29) on `bdr-rev-fixture.mjs`.

## Two screens that show the registry rather than hiding it

`/catalogue`'s **Edit** never edits in place: it saves a NEW version, because publishing
FREEZES a config version, and that is what makes a proposal's pinned price still resolve next
year. Since W4B the screen stops explaining that and shows it instead: a waiting version is an
amber "Unpublished changes" with what it changes listed, and the History tab lists every version.
A service's compliance filings are the one thing on it that is NOT versioned, on purpose (T6.16,
above). A never-published service is a "Draft" row rather than omitted, because it is a real
state a firm needs to see and fix, and the proposal screen correctly refuses to quote one.

`/audit` shows payloads raw. An audit trail is read when something has gone wrong, and a
friendlier rendering is one more thing between the reader and what was actually recorded.

## The bell and the email: notifications (0323, 0324)

The API writes and words them (backend CLAUDE.md, "Notifications"); this side shows them.

- **`components/notify/bell.tsx`** in the top bar (only once a firm is chosen). The count is
  `useUnreadCount` (`unread.ts`): **once a minute, only while the tab is VISIBLE, one request at
  a time**, and on a 429 it doubles its wait (up to 8 min) and keeps the last number. Budget:
  the API allows 300/min per ADDRESS and an office is one address, so 40 people cost ~40/min.
  Do not shorten the interval or poll hidden tabs. The dropdown reads the latest 8 only when
  opened. Opening a row marks it read first, then goes to `href` (the API's path).
  Anything that changes the count calls `notificationsChanged()` so the badge follows at once.
- **`/notifications`**: All / Unread (unread = not read AND not done, the bell's own count),
  30 at a time with Show older (`nextBefore`), Mark all as read up to the newest SHOWN row
  (`upTo`), "Done" on a resolved one. The words (`title`, `detail`) are the API's, already
  without an amount for a reader who may not see fees: never add one here.
- **Settings** (`components/notify/settings.tsx`): Your account (`owner="mine"`, the person's
  over the firm's, "· Your choice", the firm's value in the box's title) and Your firm
  (`owner="firm"`, plus "Daily email at", 00:00 to 23:00). Columns: In the bell, By email
  (0324). One line above says how mail goes: escalations and missed filings at once, the rest
  in one email a day at the firm's hour. The locked bells show ticked and disabled ("Always in
  the bell"); their email can still be switched off. The box moves at once and the API's
  answer replaces the table (a refusal reloads it). No push column until push exists.
- **THE SHELL READS ONLY A 401 AS SIGNED OUT.** It used to send anybody to `/login` whenever
  `/auth/me` failed, so a 429 from a busy office signed people out mid-work. A 429, a 5xx or a
  dropped connection now asks again in 5 s and keeps the page. Not yet exercised against a real
  429 in a browser.
- Walk: `bib/demo-assets/tools/nt-walk.mjs` on a fresh `ai-fixture.mjs` firm (42/42, emails read
  back from Mailpit). Run the
  fixture and the walk 60 s apart, or the fixture meets a 429.

## The GST tax invoice and the TDS line (Q056, Q057, S5)

What the backend's section of the same name decided, as the screens show it.

- **Invoice page** (`app/invoices/[invoiceId]/tax.tsx` + `page.tsx`): a Tax card (how it is taxed in
  words, place of supply, both GSTINs, reverse charge No, the client's TDS with a link to set it, the
  account it is paid into). On a draft the place of supply is a picker (`PUT /place-of-supply`; blank
  follows the client) and each line's SAC a quiet box saved on blur (`PUT /lines/{id}/sac`). The line
  table has a SAC column and the tax's split under the rate; the foot has CGST/SGST (or UTGST, IGST)
  rows, then Less TDS and Net payable. `issueBlocked` now also carries PLACE_OF_SUPPLY_UNKNOWN and
  INVOICE_LINE_NEEDS_SAC, shown where Issue would be. Payments: "Amount received" plus an optional
  "TDS deducted" (hint: the expected TDS), a TDS column, and "TDS deducted" on the owed card.
- **Catalogue** service form: a "Tax on the invoice" card, SAC (India) and GST rate %, written into
  `body.tax.IN`; other countries' entries are kept as the body had them.
- **Your firm** (`admin/firm/invoicing-card.tsx`, `#invoicing`): each company's GSTIN, bank accounts
  (Add, Replace, Take off; one per currency plus a general one) and, for an Indian company, LUTs by
  financial year. Self-contained: it loads `GET /invoicing/companies` and reloads the page after a write.
- **Client** (`clients/[partyId]/tds-card.tsx`, `#tds`): the TDS it deducts (section + rate) or none.
  An Indian billing address now picks its state from `components/state-select.tsx` (the API's
  `GET /invoicing/states`), so a place of supply can always be read; a region typed before stays
  offered "as typed".
- **Series** (`admin/brand`): a live warning when an Indian company's prefix makes a number longer
  than 16 characters (Rule 46(b), Q080). Never a refusal: the choice is 10x's.
- **Readiness**: the `tax_invoice` line and its gap words (no GSTIN, no bank account, no SAC, no tax rate).
- `formatMoney` prints whole rupees without ".00" (₹1,800): a check that reads a figure off the screen
  must not expect the PDF's two places.
- Walk: `bib/demo-assets/tools/gst-fixture.mjs` + `gst-walk.mjs` (46 checks; each run needs a NEW ids
  file, it chooses a place and types a SAC).

## Commands

```bash
npm run dev            # :3000, expects the API on :8080
npm run api:generate   # regenerate the typed client from the running API
npm run check          # typecheck + lint — run before every push
npm run build
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Work always has an owner, and handing out a task hands out its job (2026-09-27)

The API's owner rule (backend T6.17): work the engine creates goes to the client's SPOC, else its
Key Manager, else the person who signs for the firm, to HAND OUT. Three screen consequences:

- **The assignment note is shown whenever it exists**, not only on an unassigned task: on a Key
  Manager's or the signing partner's desk it is the sentence saying the task came to them to hand
  out, and why. The API clears it when anybody moves the task by hand, so it never goes stale.
  Both `/work-items` cards and `/work-items/[workItemId]` read it this way.
- **Save on "Whose desk" can move the job's steps too.** The assign route answers
  `stepsHandedOver`; the card says "N steps of this job went with it" (`role="status"`) when it
  is above zero, and the hint under the picker says the rule in words.
- **`how` on the two assignment events is worded** (`HOW_WORDS` in `lib/ui/audit-words.ts`):
  the three rungs, `manual`, `taken`, `handover`, `released` and `with_task`, rather than the
  underscored tokens. A `work_item.assigned` carrying `catchUp: true` reads from
  `CAUGHT_UP_WORDS` instead ("Moved to the client's SPOC for that Dept once one was named"), and
  the `catchUp` flag gets no row of its own.
- **Naming the account team says what it moved** (the catch-up, 2026-09-27). The assign route
  answers `caughtUp`; `AccountTeamPanel` turns it into one sentence per person ("1 task and 2 steps
  moved to Asha Associate."), naming them from the colleagues list it already holds, in an `ok`
  Notice under "Work already created". Nothing is said when nothing was waiting; `null` (moving
  failed, the assignment still saved) is a `warn` telling the reader to hand the work out from the
  board. Cleared BEFORE each assign, so a second one says what IT moved.
- **An unsigned letter warns whose desk its work will land on** (the Send warning). The letter
  page reads `GET /engagement-letters/{id}/routing` while the letter is a draft or sent, and
  `RoutingWarning` lists each Dept whose rung is not the SPOC, with the owner and why, and a link
  to the client's page. A warning (`role="status"`), never a disabled Send; nothing is shown when
  every Dept has a SPOC.

## Audit 2026-10-03, the UX cluster: rules that came out of it

- **Only a 401 signs anybody out.** `@/lib/session` `readSession()` is how both shells read
  `/auth/me`: 401 is signed out; a 429, a 5xx or no answer is *busy*, and the shell keeps what it
  knew and asks again (2 s doubling to 30 s, never sooner than `Retry-After`, which the API now
  exposes). On a first load it shows "The workspace is busy. Trying again in N seconds" with Try
  now. A page's own 401 still routes to `/login`; nothing else may.
- **The product's name is one constant**, `PRODUCT_NAME` in `@/lib/brand` ("10X Workspace").
  Anything scoped to ONE firm shows that firm: the sidebar's and the portal's mark are
  `firmInitials(principal.tenantName)`, never "10x".
- **A select never answers for the user.** A choice somebody makes (a reason, a method, a source,
  who, which Dept, what kind of file) starts at a disabled "Choose…" with `defaultValue=""` and is
  `required` where the API requires it. A select that SHOWS a saved setting keeps its value.
  `demo-assets/tools/audit-ux/select-defaults.mjs` lists every select whose first option is not
  empty, for the next sweep.
- **Counts are one string**: `plural(n, "client")` from `@/lib/plural`. `{n} client{n === 1 ? "" :
  "s"}` is three text nodes, and in a flex container with a gap it read "4 client s".
- **Countries are the 249 ISO 3166-1 codes** (`COUNTRY_CODES` in `@/lib/country`, the same list
  the API enforces in `domain/country.ts`). The browser also names retired codes; never build the
  list from AA..ZZ again. A saved code outside the list is shown as itself in `CountrySelect`.
- **Kinds of company come from a list** (`ENTITY_KINDS`, `EntityKindSelect`), saved as the codes
  a filing rule matches on; `entityKindLabel()` prints one.
- **Codes are never printed**: a rule pack key is `rulePackLabel()`, a country is
  `countryName()`, a permission is its sentence (the Roles page and `Denied` no longer show
  `tenant:admin`), the audit trail maps `jurisdiction*`/`rung*` keys to words.
- **The Tailwind `TableWrap` contains its table** (`relative` + layout containment), like
  `.tablewrap`. Without it an absolutely positioned `.sr-only` in a cell escaped the scroller and
  widened the whole page at 390.
- **A row change says it held**: People and Structure print "Saved. …" in a `role="status"`
  line, cleared before each call.
- **Welcome and invitation pages**: a new colleague's welcome link opens `/auth/welcome` ("Choose
  your password", or "Skip for now and sign in"); `/portal/accept-invite` prints the `firm`
  query parameter the API puts on the link (display only, capped).
- **No e-signature service**: a letter's send button reads "Lock it as sent" and the page says
  nothing is emailed and what to do; with DocuSign the flow is unchanged.
- **A refused form keeps what was typed (F05).** Never `<form action={fn}>`: React 19 resets
  such a form once `fn` has run, whatever the API answered, so a refusal arrived over empty boxes.
  Every form submits through `onSubmit={(event) => keepTyped(event, fn)}` (`@/lib/ui/keep-typed`),
  which hands `fn` the same `FormData` (the pressed button included) and resets nothing. `fn`
  resolves `true` only when the save went through AND the form stays on screen for the next entry
  (add a line, record a payment); only then is it cleared. A form that closes, navigates or
  remounts on success returns nothing. The handler still clears its refusal BEFORE the call. A
  lint rule refuses `action` on a `<form>`; `demo-assets/tools/audit-verify/f05-walk.mjs` refuses
  every form twice and checks the boxes, the focus and the second press.

## Quick wins of 2026-10-05 (Q066, Q027, Q059, Q064, Q076)

- **New lead, "Assign to"**: required, nothing preselected (a colleague, the firm's rule, or
  unassigned). The hint says admins hear of every new lead.
- **Your firm > Automatic billing**: "Starts from" month select (two years back to a year ahead)
  sits beside the switch and is sent WITH it; while on, "Change month". Work vs Billing reads
  `before_auto_billing` as a note.
- **Your firm > Client emails**: who client emails are from, and "Domains we may send from" (one
  per line; add one only once the mail provider allows this app: SPF/DKIM).
- **Client page > Portal access**: the invite form's "Also give access to the group's other
  companies: ..." is ticked when the server's group (`GET /portal-access/clients/{id}/group`) is
  not empty; "Give another company" offers the server's group (sisters included) and "Give the
  whole group (N)"; a "Same group" notice offers contacts who see the group but not this company.
- **Clients**: `YearEndField` (`components/year-end-field.tsx`): India reads "31 March (fixed for
  India)" in a read-only input (so a FieldRow lines up), elsewhere a required month + day pick
  posting `MM-DD` in a hidden input. Used by Add a client (country and kind now required), the
  register form and "Correct the country, kind or year end". Setup's `client_details` line links
  each gap to the client.
- Walk: `bib/demo-assets/tools/qw-walk.mjs` 38/38.

## Filings across countries on the screens (S3, 2026-10-05)

- **Calendar** (`src/app/calendar/filing-clock.tsx`): the LEGAL deadline is late on the filing's
  own day, `row.filingToday` from the API, never the browser's (`pastLegalDeadline`); the start-by
  date stays on `browserDay`. "Dubai time" / "New York time" shows under a deadline whose clock
  reads differently from the reader's, **compared by wall clock, never by zone name**: Chrome
  calls India `Asia/Calcutta` and a name comparison put "Kolkata time" on every Indian row. A row
  filed by a period job's task says "Filed by <task>"; a `rule_fallback` row says "Using April: no
  year end recorded for <company>", under the COMPANY cell (the period cell is nowrap and the
  sentence there widened the table past the screen).
- **Task page**: a period job's task lists what it filed ("Completing this task filed:") and
  says reopening un-files them; a linked filing filed by another task names it. JOB_STEPS_OPEN
  shows the API's sentence naming the open steps.
- **Rule editor**: "Periods follow": one year for everyone / each client's year end / each
  client's assigned period (needs the group, e.g. VAT), locked with the period shape.
- **Client page**: a Filing clock column and setting (`entity-clock.tsx`, US zones), and Tax
  return periods (`return-periods.tsx`: tax, monthly or quarterly, which months the quarters
  start in). Setup line "Return periods from the tax authority" links to the client.
- Rules screen: Load the UAE / Singapore / US draft pack (unconfirmed, on no service).

## Release hardening (S7, 2026-10-05)

- `/copilot` answers 404 unless the deployment sets `NEXT_PUBLIC_BIB_COPILOT=on` (nothing does);
  the screen lives on in `app/copilot/copilot-chat.tsx`, type-checked, for the day it can answer.
- `schema.d.ts` was regenerated from the merged release API (S1-S5); `npm run check` is green on it.
- A refused upload now says `CONTENT_NOT_OF_TYPE` in plain words (the file is not the type it was
  sent as); `ErrorNotice` shows it as is.
- A period job's task refuses Done / Approve before its period ends (`JOB_PERIOD_NOT_ENDED`); the
  task page shows the API's sentence.

## The shell's chrome: the panel that left the page, and the two stacked labels (2026-10-05)

The user, on a QA screenshot: *"notification bell icon is going out of the page and teh rectengualr
text look so ai genrated"*. Three things, and the first was a real bug.

- **The notification panel ran off the right edge of the window.** `.menu-panel` is
  `position: fixed; inset: auto`, which pins a box where it WOULD have been in the flow. `Menu`
  puts it in the top layer and places it by hand; the bell was still a `<details>` with the panel
  as a plain child, so a 26rem panel started at the bell, at the right-hand end of the top bar, and
  ended 238px past the edge at every desktop width. Nothing scrolled to it, because a fixed box
  does not widen the page. The placement is now **`useAnchoredPanel` (`components/ui/anchored.ts`),
  shared by `Menu` and the bell**: under the button, flipped above when there is no room below, and
  pulled back inside the window on BOTH axes, never nearer than 8px to an edge — so a panel wider
  or taller than the window lands at that margin instead of half off. The refs are the HOOK's, not
  arguments: placing means writing to `panel.current.style`, and the React Compiler refuses to let
  a hook modify what it was handed. The bell is a `<button popovertarget>` now, its open state
  `aria-expanded`, not `[open]`; Escape and light dismiss come from the popover.
- **The top bar said three unrelated things on one line of middots** — `BiB · 10x Global · fees
  visible`: the build's codename, the firm the sidebar already names, and a permission flag. It is
  **where the reader is**: the nav section and the screen, found by `trail()` as the longest nav
  href the path starts with, so `/clients/<id>` is "Commercial / Clients" while the page itself is
  headed by the client's name. Only links this reader is offered are matched. **A group of one
  names no section** ("Audit trail", never "Record / Audit trail"), the exclusion the sidebar's
  search already makes, because that label is never drawn. Nothing matched draws nothing. The slash
  is `aria-hidden` with real spaces around it, so it is seen and not spoken.
- **The sidebar's head is one line.** CA#40 put the product's name under the firm's, so the head of
  every sidebar was two stacked names, the lower one the same constant on every screen of every
  firm. The firm's name takes the line; **the product names itself once, at the FOOT of the column**
  (`.brand-foot`), and on every sign-in page. The mark is 2rem and `data-chars="3"` sizes a
  three-character one ("10x Global" -> "10x") to fit. **The portal's head keeps its second line**,
  because "Client portal" says which app it is.
- **Whether this login sees fees is on `/account`**, a fact about the person, on the person's page.
  And the browser tab is `PRODUCT_NAME` alone: it read "BiB · 10X Workspace", which put the build's
  codename in front of the commissioned name in the one place a client's staff cannot miss it.
- Walk: `bib/demo-assets/tools/shell-chrome-walk.mjs` (63 checks at 1440 / 1280 / 1024 / 390, on an
  `epb-fixture.mjs` firm), which measures the panel's box against the window rather than asserting
  a rule, and reports what the old placement would have done.

## 10x's answers of 5 Oct (S8): Q069, Q084, Q087, Q085

- **Q069** The check-rule form (`lib/ui/check-rule-form.tsx`) offers "The client's Key Manager"
  first and defaults a new rule to it; it asks no grade. Refusals `NOT_THE_CLIENTS_CHECKER` and
  `NO_CLIENT_CHECKER` have short words in `CHECK_INELIGIBILITY`.
- **Q084** The task page (`app/work-items/[workItemId]/page.tsx`) asks "Filed on the portal on", one
  date per return in `filing.filesOnDone`, before a Done state from the State list is saved and on
  the Approve form; today by default, `max` today. It sends `filedOn` (obligation id -> day); the
  API's refusal is shown as is. The Checks queue's Approve (`app/work-items/checks.tsx`) reads the
  task's `filing` first and, when it files returns, asks the same days before approving
  ("Approve and record these days"); one component, `lib/ui/portal-dates.tsx`. The work board has
  no state change of its own.
- **Q087** Your firm -> "Bank details and LUT on invoices" carries a Round off switch per company
  (`PUT /firm-entities/{id}/round-off`); the invoice page prints a Round off row above the Total
  when `totals.roundOff` is not zero.
- **Q085** The Revenue report's nobody row by manager reads "No manager yet (incl. advances not
  adjusted)" on screen and in the CSV.
- Follow-ups: `lib/ui/time-zone.tsx` lists "United States, Pacific (America/Los_Angeles)" (Q075:
  10x's US company keeps LA time); the advance box on the proposal's letter form and the letter
  builder reads "Ask for an advance" with a note that the work starts at signing (it has not waited
  for the advance since 3 Oct); the Round off hint says an Indian company starts on (0380).
- Walks: `bib/demo-assets/tools/ans-walk.mjs` (29), `fix4-walk.mjs` (17).

## Request templates and an ask's due day (F1.5, F1.7, 2026-10-10)

FinCompliance F1 (backend `docs/FIN_BUILD_PLAN.md`, "F1 contract"): a firm writes down once what it
asks a client for every period, a process step names the list, and the requests sweep (F1.4, not
built yet) raises one ask per item per period.

- **The body types live in ONE module, `src/lib/request-template.ts`, and it says why.** A config
  body is `{ [key: string]: unknown }` on the wire for every kind, so `schema.d.ts` has nothing to
  generate; the backend's `validateRequestTemplateBody` is the definition. What the schema DOES
  carry is taken from it (the ask kind and document kind are `ClientAsk`'s unions). Stored bodies
  are read through `readRequestTemplate` (null on anything else); a process step's key through
  `readStepRequestTemplateKey`. The ask form on a task and the template editor share
  `ASK_KINDS` / `ASK_FILING_KINDS` from it.
- **`/admin/request-templates`** (under Processes in "How work runs"): one card per template with
  its items in a table ("1 day after the period ends", "5 days after the period ends", "Filed as
  Client's books ..."), Draft / In force / Unpublished changes, **Publish vN**, Change it, and its
  history. Draft then publish, like Processes. **New template** is the brand button; **Start from an
  example: Monthly close** (empty state, and in the new form) fills Sales invoices, Purchase
  invoices, Bank statements and Expense claims, each a document filed as `books_input`, send 1 and
  due 5 (v3.2 section 11). Nothing is seeded. Short names are made from the words (`shortNameFrom`,
  under More), as on Processes.
- **The API's rules are checked before the save** (`checkTemplate`): one sentence per problem in a
  danger notice on the item ("Make it due after the day it is asked: 2 days or more."), and one
  CONSTANT line at the foot. Not a count: `ErrorNotice` takes focus whenever its message changes, so
  a count pulled the cursor out of the box being fixed on every keystroke. The API's refusal is still
  shown verbatim when it arrives.
- **Each item says its two days back in words and with a real month** under the day boxes: "Asked 1
  day after the period ends, due 5 days after. For October 2026: asked 01 Nov 2026, due 05 Nov
  2026." Counted with `addDays` / `monthEnd`, added to `@/lib/day` (UTC midnights, like
  `daysBefore`). The day boxes are held to 32rem: at the row's width each was 500px for one digit.
- **Processes: "Ask the client for"** on every step, "Nothing" or a PUBLISHED template, written as
  `requestTemplateKey` (null for Nothing). A key the step already names that is not in force stays
  selectable, "(not in force)", as the checker select does. The summary line says "asks the client
  for Monthly close". Before this the editor rebuilt every step from its own fields, so saving a
  process would have DROPPED a key written elsewhere.
- **The task's asks** (`client-asks.tsx`): "Due 05 Nov 2026" first on the line (`longDay`), and
  ", late" in `tone-danger` for an OPEN ask past its day on `browserDay()`, the board's own rule; an
  answered ask is never late. A template-raised ask names no person (`raisedByName` null), so it
  reads "From Monthly close · asked ..." (`useRequestTemplateNames`, fetched only when such an ask
  is on the page; the short name in words until it arrives). The raise form has **Due by
  (optional)**, `min` today, sent only when filled; the API holds it to the FIRM's today
  (`INVALID_DUE_DATE`) and its sentence is shown.
- **The portal's action centre** shows "Due 05 Nov 2026" beside "Waiting on you" on what the client
  still owes, and nothing on what they have sent. Never "late" or "overdue" there: that is the
  accusation the reminder line already avoids.
- Walked 2026-10-10 on the Fin Sandbox firm (3004 / 8084): template created from the example,
  refused in words, saved, published; a draft process step pointed at it and read back; an ask with
  a due day raised on a task made through New task (hidden from the portal, then withdrawn). A late
  template ask and the portal were checked by rewriting the API's answer in the browser, because
  no screen can make either yet (a past due day is refused by hand, and the sweep is F1.4).

## FinCompliance's screens: the status gate, the first error boundary (F0.8, 2026-10-11)

Backend `docs/FIN_BUILD_PLAN.md` F0.6 and F0.8. Fin is a separate stage of the product that a firm
switches on, and its ground rule 4 is that **fin can fail without BiB failing**.

- **Types are generated, as everywhere.** `GET /api/v1/fin/status` and `GET /api/v1/fin/intake`
  come from `schema.d.ts` (`npm run api:generate` with the API running with `BIB_FIN_ENABLED=true`,
  or the fin routes are not in the spec). `FinIntakePage`, `FinIntakeItem`, `FinReader` and
  `FinRouteBasis` are re-exported in `client.ts`; nothing about fin is typed by hand.
- **The status gate is ONE read per session and firm, in `@/lib/fin`** (`useFinStatus(principal)`).
  A module-level store keyed by user and firm, read through `useSyncExternalStore` like the
  proposal store, so the shell and `app/fin/layout.tsx` share one request (a direct load of
  `/fin/intake` mounts both at once) and switching firm asks again. It asks only when the session
  holds `books:read` (otherwise the API's 403 would say nothing new). 200 is ON (with
  `enabledSince`, an instant: printed with `longInstant`); **every other answer is OFF**, in three
  words the layout says apart: 404 (`FIN_NOT_ENABLED`, or the deployment's switch off and no route
  at all) "not switched on for this firm"; no `books:read` `Denied`; anything else (5xx, 429, no
  answer) "did not answer" with Try again, and that one is NOT remembered, so the next screen that
  asks tries again rather than hiding fin until a reload.
- **The nav entry** is `NavItem.fin`, a third condition beside `needs` and `when` (not a `when`:
  it is not a fact on the session). Its own section, **FinCompliance**, after Delivery; with one
  screen it is a plain link, "Files received", and the section name appears when a second fin
  screen joins it. `trail()` and the search see it only while fin is on.
- **`app/fin/error.tsx` is the app's FIRST error boundary.** A fin page that throws while
  rendering is replaced by "This FinCompliance screen stopped working", a line that the rest of
  the workspace is not affected, **Try again** (Next 16.3's `retry`, which the docs prefer to
  `reset`) and the error's own words closed under "Details for support". The shell, the sidebar
  and every other screen keep working (walked: the nav opens Audit trail from a broken fin page).
  **It does not cover `app/fin/layout.tsx`** (Next wraps a segment's pages and nested layouts, never
  the layout beside it), so the gate is kept to code that cannot throw. An API REFUSAL is not a
  throw: the page shows its own `ErrorState` with the API's words, and the boundary is for what
  nobody expected. Nowhere else has a boundary yet; a wider one needs its own decision.
- **`/fin/intake`, "Files received"**: the counts are the API's `summary` (the CLIENT filter's
  whole set, never the page and never the reader filter), drawn as six tiles that are filters
  (`aria-pressed`): All files, PDFs, Spreadsheets, Photos and scans, ZIP files, **Needs a person**
  (warn while above zero: held up, never wrong). While it is above zero and not the filter, a warn
  notice says "5 files fit no reader yet. Somebody has to open them." with Show them. One muted
  line says reading what is inside the files comes next. Client (the book less the firm's own
  companies, as Work vs Billing; for a role without `party:read`, the clients the rows name) and
  Reader selects; both in the URL (`?client=&reader=`, `history.replaceState`, as `/work-items`).
  The table: the title opens the file (`downloadDocument` with the VERSION fin took in), the file
  name under it, the client (a link with `party:read`), the reader pill with how it was decided
  ("From its file type", "From its name (.xlsx)", "Nothing fit .json files"), the size
  (`formatBytes`) and when it was taken in (`longMoment`). **Show more** on the API's
  `nextBefore`, never page numbers; a row already on screen is never drawn twice. The words live in
  `@/lib/fin` (`FIN_READERS`, `basisWords`, `finCount`).
- Walked 2026-10-11 on the Fin Sandbox firm (3000 / 8080, 36 checks): 1,169 = 841 / 222 / 101 / 0 /
  5; Needs a person is 5 rows; one client's counts add up to its total; Show more appends 50 with no
  repeat; a file downloads; a reloaded `?client=&reader=` keeps both; nothing hidden at 1280 and
  1440. The boundary, the 500 state, fin off (status 404) and unreachable (503) were made by
  rewriting the API's answer in Playwright (`route.fetch` then `fulfill`, which keeps the CORS
  headers a hand-made response would lack).
