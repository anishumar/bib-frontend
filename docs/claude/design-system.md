# Design system, Tailwind/shadcn, tables, motion and charts

Read `src/design/README.md` first. The design system is the DEFAULT way to build a screen, not a
set of optional helpers. It is the same design language as 10x CRM (`../10xcrm`): same
blue-green-biased neutrals, teal accent, spacing; a token name present in both means the same.
Two departures on purpose (Wave 4, 2026-09-28), both for readers over 35: the face is Source
Sans 3 (not IBM Plex) and the type scale moved up a rung.

```
src/design/      tokens.css · base.css · layout.css · components.css · tailwind.css
src/components/  ui/ · layout/ · states/ · tw/ · shadcn/
```

## The rules

- **Import the component, never type the class.** `<Button>`, `<Field>`, `<Pill>`, `<Card>`,
  `<Table>`, `<Tabs>`, `<Dialog>` from `@/components/ui`. Class names are an implementation
  detail; that is what stops a sixth button appearing after five were consolidated.
- **Colour means status.** `--accent` is also `--ok` ("done / in force / this held"); `--warn`
  and `--danger` say the other two things. Nothing else may use those three.
  - **Exception 1, `--brand` (maroon/plum)**: whose product this is. Spent in exactly three
    places: the mark, the sidebar, a screen's one committing action. **The primary button is
    brand, never ink and never accent** (reason in `tokens.css`). Destructive stays `--danger`;
    the brand is plum rather than brick so maroon chrome around red "nobody" pills stays distinct.
  - **Exception 2, category tints `--cat-1…--cat-4`** (each with `-wash`, `-ink`): tell GROUPS
    apart, first the Catalogue's Depts (FRC, TRC, RAA + a spare). Desaturated blue, violet, olive,
    orchid, so a Dept never reads as done/late/wrong. Never for a state; never a status colour for
    a group. Spent only through `<Pill cat={1..4}>` and `<Tr cat={1..4}>` (3px inset edge on the
    row's first cell); the Catalogue's `deptTint` picks the number from the firm's Dept order.
  - **`--chart-1`** (#2f6fe0 / dark #5b8fe8) is ONE data series: never good/bad, never a Dept.
    Where a chart's colour IS a status (ageing bars) use `--muted` / `--danger` plus a legend.
- **Nothing invents a value.** Type: `--t-xs`…`--t-2xl` or `.text-*` (14, 15, 16, 16, 20, 24,
  32). Spacing: `--s-1`…`--s-7`. Shape: `--r` / `--r-sm`, plus `--r-lg` (18px, the one third
  radius, for W5 glass). 12, 13 and 17px are off the ladder; nothing a user must read is below 14.
- **No hex in components; no inline `fontSize`, `color`, `borderRadius`, `boxShadow`.** Lint
  errors; `eslint.config.mjs` names the replacement in each message.
- **A component never branches on theme.** Light/dark redefine only semantic colour tokens. A
  dark-mode rule inside a component means a token is missing: add it to `tokens.css`.
- **A row of buttons is `.cluster`, never `.row`.** `.row` is `justify-content: space-between`
  (heading + control at the far end). **`.gap` does not exist**: `className="row gap"` was in
  five committed files and put Approve 941px from Decline on a client's page (T6.8 walk). An
  undefined class fails silently.
- **Accessibility comes from the components.** `<Field>` wires label/hint/error ARIA; `<Tabs>`
  (`ui/tabs.tsx`) is a real tablist (arrows, Home/End, roving tabindex); `<Dialog>`
  (`ui/dialog.tsx`) is the native `<dialog>` with `showModal()`, so the browser owns focus trap,
  Escape, inert background and top layer. Never hand-roll these, and never swap them for Radix.
  `menu.tsx` is the hand-rolled one worth replacing: a `popover="auto"` panel in the top layer
  (so a `.tablewrap` cannot clip "More" to a 10px strip, CA#17), placed by `useAnchoredPanel`
  (see `shell-and-navigation.md`); light dismiss and Escape come from the browser; arrow keys are
  still missing.
- **A screen needs something the system lacks → add it to the system**, once, for everybody.

## The heading ladder is part of the component API

`PageHeader` → `h1`; `Section` → `h2` at `level={2}`, else `h3`; `CardTitle` → `h3`. `Section`
defaults to `h3`, so a page whose one section forgets `level={2}` jumps `h1` → `h3` (three portal
screens did). Read the ladder off the DOM after porting a screen; it is invisible in the source.

## The second vocabulary: Tailwind and shadcn

```
@/components/ui  + src/design/*.css   the design system: unlayered CSS, a class per component
@/components/tw                        the same ideas as Tailwind utilities
@/components/shadcn                    Radix-backed components the design system does not have
```

Neither is deprecated; what a file imports says how far it is migrated. Most screens are still on
the design-system vocabulary.

- **Preflight is OFF.** `src/design/tailwind.css` imports `theme` and `utilities`, never
  `preflight` (it would restyle ~2,844 lines of hand-written element styling at once). So a bare
  `<button>` keeps the browser's grey outset chrome: `.btn` resets the product's own, a shadcn
  component has nothing (the first rebuilt screen looked like Windows 98). A scoped reset sits in
  `@layer base`, gated on `[data-tw]`, and **`<Page>` from `@/components/tw` carries
  `data-tw`**: a migrated screen starts with `<Page>` or its controls are unstyled. Inside
  `data-tw`, `ul`/`ol` lose margin, padding and bullets; outside it a `<ul>` keeps the browser's
  40px indent (W4B: a list in a card there needs `list-none pl-0`).
- **Layering is the safety model.** `components.css` and `layout.css` are unlayered; utilities are
  `@layer utilities`; `base.css` is `@layer base`. Unlayered beats layered whatever the
  specificity, so:
  - the design system wins every collision (proved by diffing the emitted stylesheet);
  - utilities beat `base.css` element defaults (stops `button { color: inherit }` putting dark ink
    on a maroon button);
  - **a utility LOSES to a design-system class on every property that class declares.**
    `className="card p-4"` keeps the card's padding; `<Meta className="mb-6">` gets no margin
    (`.meta` sets `margin: 0`); `mt-3` on `<Fieldset>` did nothing (`.fieldset` declares
    `margin: 0`, T6.15); `xl:hidden` on a `.btn` loses because `.btn` declares `display` (wrap
    it in a `span.xl:hidden`).
  - a utility for a property the class does NOT declare lands: `<Button
    className="justify-self-start">` stops a `.field-row` grid stretching a button (68px vs a
    551px cell). The answer is per PROPERTY, never per element: read the class first.
- **Mix at the component level, never the element level.** `<Tabs>` or `<Button>` from
  `@/components/ui` inside a `<Page>` is fine: `.tab` / `.btn` set their own padding, background
  and border, which the scoped reset cannot reach.
- **`@theme` maps onto the real tokens.** Tailwind's default palette, type, radius and shadow
  scales are deleted (`--color-*: initial` and friends): `bg-red-500` is a build error. Spacing is
  not remapped: `--s-1`…`--s-7` are exactly `p-1 p-2 p-3 p-4 p-6 p-8 p-12`. Two names are traps:
  - **`accent` is shadcn's neutral hover ground**, mapped to `--surface-hover`. The status teal is
    `ok` / `ok-wash` / `ok-ink` (wiring them together painted "today" on the calendar as a solid
    green block).
  - **`--font-*` is deleted entirely**: Tailwind's `--font-sans` / `--font-mono` are the exact
    variables `next/font` defines in the root layout, and Tailwind's default theme ships both.
- **shadcn writes to `src/components/shadcn/`** (`components.json`), never `components/ui/`: the
  CLI overwrites by filename and `ui/button.tsx` exists. **Never run `npx shadcn init`**: it
  rewrites `globals.css` with its own palette. `shadcn add <name>` is fine; read the diff.
- **No `lucide-react`.** `@/components/ui/icon` is the icon set: one family, 24-unit box, 1.75
  stroke. Grep it with `[a-zA-Z]`: half the names are camelCase and a lowercase-only pattern
  finds nothing (three chevrons got drawn twice that way).
- **The Tailwind `TableWrap` contains its table** (`relative` + layout containment), like
  `.tablewrap`; without it an absolutely positioned `.sr-only` in a cell escaped the scroller and
  widened the page at 390px (audit 2026-10-03).

## The Wave 4 foundation (2026-09-28)

What the reference screens (`/leads`, `/admin/firm`, `/proposals`) are built from and every later
screen reuses. **Add a prop; never rename one**: the sweeps depend on them.

- **Type.** Source Sans 3 (400/600/700, italic, `latin-ext` for ₹) through `next/font`, base 16px,
  line height 1.5 (`--leading`). Scale: `--t-xs` 14 · `--t-sm` 15 · `--t-md` 16 · `--t-base` 16 ·
  `--t-lg` 20 · `--t-xl` 24 · `--t-2xl` 32. IBM Plex Mono only for TRUE code (a content hash,
  permission keys, event codes, ids in a support disclosure, the trail's "Exact record"); money,
  dates, counts and references are never `.mono`. `.num` and `<time>` are sans with tabular figures.
- **Contrast** (measured, both themes): `--ink` 17.7:1 on a card, `--ink-2` 9.9, `--muted` 5.5,
  `--faint` 5.0; dark `--muted` 6.4. **A data value is never `--muted` or `--faint`**: grey is for
  labels and meta.
- **Tables** (`@/components/ui`): heads sentence case 14/600 `--ink-2` over one `--line-strong`
  rule; cells 16px full ink; rows ≥52px with a hover ground; `align="right"` = tabular figures;
  cell padding 10px across.
  - **Whole-row link**: `<Tr linked>` + one `<RowLink href>` (the row's name) + `<ThChevron />` /
    `<RowChevron />`. The link's `::after` covers the row, so a click anywhere opens it while it
    stays ONE link to a keyboard; other controls in the row are lifted above it. Playwright's
    `.click()` on another cell is refused ("subtree intercepts pointer events"): walks click by
    position (`clickAt` in `bib/demo-assets/tools/w4a-walk.mjs`).
  - **No card-in-card**: a `<TableWrap>` that is a DIRECT child of a padded `<Card>` drops its
    frame and runs to the card's edges.
  - **No bordered control in every row**: `<Select variant="quiet">` reads as its value, framed on
    hover/focus; `<Select variant="pill">` is a stage changed in place; `<Input variant="quiet">`
    is a name/order/rank renamed in place. Native elements; each needs an `aria-label` in a row.
  - **Free text in a cell** goes in `<span className="cell-text">` (24rem cap) or
    `.cell-text[data-size="narrow"]` (14rem, for tables with several free-text columns);
    `max-width` on a `<td>` is ignored. `.table` is max-content wide, so one unwrapped cell hides
    columns while the PAGE reports no overflow (the import template's SPOC list hid 2,124px; one
    long pricing note pushed Filings and Status 254px out of the Catalogue). Measure `.tablewrap`.
- **Pills**: a wash and a word at 14/600, no border. `<Pill dot>` is a STATE (dot + word: "New",
  "Sent", "Lost"); no dot on a label or count. `tone="code"` is a small outlined badge for an
  identifier ("IN", "AE"), sans face. A two-word firm-named state must not wrap inside its pill.
- **Empty values**: `<NotSet />` ("Not set", muted italic); `<NotStated>` renders the same.
- **Placeholders** are muted italic everywhere (`base.css` `::placeholder`, `.input`); the copy
  rules are in `writing-for-the-screen.md`.

## Motion (Wave 5, 2026-09-29: "decent, not bold")

Motion lives in three places and nowhere else, and all three stop under reduced motion
(`useReducedMotion`, `src/lib/reduced-motion.ts`, plus the CSS blocks):

- A `.btn` (and the shadcn button) rises 1px onto `--shadow-sm` under the pointer and settles to
  `scale(.98)` when pressed, quicker than it rose. Never on a disabled, `aria-disabled` or busy
  button, never on `link`, no shadow on `ghost`.
- A headline figure counts up ONCE: `<CountUp>`, `--dur-count` 500ms. **It never makes money a JS
  number**: each frame is the amount's `bigint` units at its own scale (`scaledUnits` in
  `lib/money`, which takes the API's four-place strings that `toMinorUnits` refuses) times an
  eased per-mille step, printed by `formatMoney`; the last frame is the final text. The final text
  holds the width invisibly; a screen reader hears only the final value. `<Stat>` (ui and tw)
  counts a NUMBER value itself and money when given `figure`; at rest it prints as before. Never
  in a table cell, pill, date, tab count or the nav.
- A chart draws itself in once.

## Charts: our own kit

`src/components/ui/chart` (`<BarChart>`, `<AreaChart>`), shadcn's look without its library.

- **Import each chart's own FILE, not `@/components/ui`**: the barrel is not tree-shaken and
  re-exporting the kit put ~4 KB gzip on every route (measured).
- Plain SVG in real pixels from a `ResizeObserver`, words as HTML over it, no dependency.
  Geometry is per mille of a round axis on `bigint` (`commonUnits`, `perMille`); ticks are
  `axisMoney` ("₹1 L", "₹50K", "AED 5K"); every figure a person reads is `formatMoney`.
- Pointer and keyboard (arrow keys between marks) show the same tooltip; "Show as a table" under
  every chart, so a tooltip never gates a number. Drawn marks are pointer-transparent (a bar that
  swallowed the pointer showed no tooltip).
- Different currencies never share an axis or a sum: small multiples, one per currency/company.
- Weight: W5 added no package. First-load JS gzip: `/receivables` 151.5 → 156.5 KB, `/dashboard`
  159.9 → 166.0 KB, every other screen ~+1.4 KB (`CountUp`). Next 16 prints no sizes: read
  `.next/diagnostics/route-bundle-stats.json` (script `C:\Users\happy\bib-wt\w5-route-sizes.mjs`;
  fixture `bib/demo-assets/tools/w5-fixture.mjs`: four companies, six months, a credit note, a
  cancelled invoice, 16 clients owing in four currencies).

## Wave 4 sweeps: the commercial screens (W4C) and the integration pass (W4D)

What each screen DOES is as it was; where things sit and how they read moved.

- **One brand button per screen**: Add a client (dialog), New proposal (client and lead pages), New
  engagement letter, Raise an invoice (dialog), Edit in the builder (a draft letter), and **Issue in the
  invoice's header** (a draft's one committing act, `tenant:admin`; Cancel stays in the document card,
  away from it). The task board's is **New task** (dialog); the task page's is **Send for review**.
- **A form used once per record is folded, not deleted**: Register it and Add an identifier on a client
  (OPEN while there is none: an unregistered company is why the calendar is empty), Add a section, each
  wording kind's Add a line, Add a service on the letter page, Record the e-invoice reference, Issue a
  credit note. The lead's three cards are one.
- **Codes in words wherever a reader sees them**: kind, entity type, identifier type (PAN, GSTIN, Email),
  stage, source, letter / invoice / engagement / dunning states, the letter's country (a name), a line's
  catalogue pin (`H1 · catalogue version 3`, never `key@version`).
- **`NoteList` takes an `example` prop** (the new line's "e.g." placeholder). A write is offered on the
  permission the API refuses without (the client page's identifier form is `party:write`).
- **Consistency is measured from the rendered page, not the source**:
  `bib/demo-assets/tools/w4final-sweep.mjs` opens 79 screens at 1280 and 1440 on four firms and counts
  computed styles (620 table heads in ONE style, 632 pills in one style, 0 of: western-grouped rupees,
  `.00` figures, "Rs", em dashes, page overflow, hidden table columns). What it still lists is deliberate:
  mono on true code, the import template's example dates and entity-type words, a vocabulary screen's codes.
- **A long company name is the test a table must pass**: "W4D Walk Traders … Private Limited" put
  `/proposals` 76px and `/leads` 11px past 1280 on a screen every seeded firm passed. The first column of
  both is capped (`block max-w-* whitespace-normal`). Seed a client with a real-length name before
  measuring a list.
- **Money on the screen is `formatMoney` only.** The proposal and letter documents keep the PDFs' own words
  (`pdfMoney`, `letterMoney`: "INR 1,250,000", en-US grouping) because the preview must say what the paper
  says; the PDFs group INR the western way by the renderer's choice (`render-source.ts`), a backend question
  left open.
- **The client's page (`/p/[token]`) totals per frequency (D8)**: one "Total ₹70,000" for ₹45,000 a month
  and ₹25,000 once is a number nobody is billed. Lines carry "How often" and totals are one per frequency;
  the nets are added in the browser with `addDecimals` (`lib/money`, takes the API's four-place strings);
  `toMinorUnits` is for what a person types and refuses them. With one frequency the API's total stands.
- **Turbopack can serve a stale `components.css`** (an edit never arrived through a touch and a restart; the
  served chunk still said `34rem`). Delete the worktree's `.next/dev` and restart. If a CSS change "does
  nothing", read the served chunk before debugging the rule.
- **The Accept link in the email names the API's `BIB_APP_BASE_URL`**, so a walk on another web port
  follows the token path, not the origin.
