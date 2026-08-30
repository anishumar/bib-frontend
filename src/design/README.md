# The design system

Everything visual in this app is decided here, once. This file is how to use
it; the CSS files beside it are why each decision is what it is.

It is the **same design language as 10x CRM** (`../../../10xcrm`) — the two
products are used by the same firm on the same day, and where a token name
exists in both, it means the same thing.

## The one rule

> **Colour is spent in one place and means one thing.**

Status, and nothing else. A button is not coloured because a button is not a
status. A card is not tinted because a card is not a state. That is what keeps
a scan down a busy screen answering *"what needs me?"* without reading a word.

## Where things live

```
src/design/
  tokens.css       every value. Nothing else may invent one.
  base.css         element defaults, built only from tokens.
  layout.css       the app shell, and the page primitives.
  components.css   one block per component.

src/components/
  ui/              the components. Import from "@/components/ui".
  layout/          Page, PageHeader, Stack, Row, Cluster, Grid, Section,
                   AppShell, ThemeSwitch.
  states/          Loading, Empty, NoResults, ErrorState, Denied.
```

There is no `legacy.css`. There was, while the migration ran; its deletion is
what "the migration finished" means.

## "I need a…"

| You need | Use | Import from |
|---|---|---|
| a button | `<Button>` | `@/components/ui` |
| a button that navigates | `<LinkButton href>` | `@/components/ui` |
| a text input | `<Field label><Input/></Field>` | `@/components/ui` |
| a dropdown of values | `<Field label><Select/></Field>` | `@/components/ui` |
| a status indicator | `<Pill tone>` | `@/components/ui` |
| a modal | `<Dialog>` | `@/components/ui` |
| a menu of actions | `<Menu>` + `<MenuItem>` | `@/components/ui` |
| a container | `<Card>` | `@/components/ui` |
| a table | `<TableWrap><Table>` + `<Th>` / `<Td>` | `@/components/ui` |
| tabs | `<Tabs id>` + `<TabPanel tabsId>` | `@/components/ui` |
| a warning or a refusal | `<Notice tone>` / `<ErrorNotice error>` | `@/components/ui` |
| label/value pairs | `<Meta>` + `<MetaItem>` | `@/components/ui` |
| a headline number | `<Strip>` + `<Stat>` | `@/components/ui` |
| a page | `<Page>` + `<PageHeader>` | `@/components/layout` |
| spacing between things | `<Stack>` / `<Cluster>` / `<Grid>` | `@/components/layout` |
| a loading screen | `<Loading>` / `<LoadingCard>` | `@/components/states` |
| an empty screen | `<Empty>` / `<NoResults>` | `@/components/states` |
| a failure | `<ErrorState>` / `<Denied>` | `@/components/states` |
| an icon | `<Icon name>` | `@/components/ui` |

## Tokens

### Colour

Semantic names only. Never a hex, never a raw ramp value.

| Token | Is |
|---|---|
| `--paper` | the page ground |
| `--surface` | a card, a table, a dialog |
| `--surface-sunk` | a table head, a well |
| `--ink` / `--ink-2` | body text / slightly quieter |
| `--muted` / `--faint` | skippable / barely there |
| `--line` / `--line-soft` | a separator / a row rule |
| `--accent` / `--accent-ink` / `--accent-wash` | the firm's mark |
| `--warn` / `--warn-wash` | needs attention |
| `--danger` / `--danger-wash` | wrong, refused, or overdue |

Both themes redefine **only** these. Sizes, spacing, shape, type and motion are
theme-invariant and appear exactly once. **A component never branches on
theme** — if you are writing a dark-mode rule inside a component, the token is
missing; add it to `tokens.css` instead.

### Type

Base is **16px**. The scale is `--t-xs` (12), `--t-sm` (13), `--t-md` (14),
`--t-base` (16), `--t-lg` (18), `--t-xl` (24), `--t-2xl` (32).

As classes: `.text-xs`, `.text-sm`, `.text-md`, `.text-lg`. Body needs none.

`13px`, `15px` and `17px` are not on the ladder. The linter says so.

### Spacing

`--s-1` (4px) through `--s-7` (48px). Related things sit at `--s-2`; sections
separate at `--s-5`. Prefer `<Stack>` / `<Cluster>` over writing a gap at all.

### Shape and motion

Two radii (`--r`, `--r-sm`), one shadow (`--shadow`), one easing curve, two
durations. A third of any of them is a decision nobody made on purpose.

## Do

- **Compose from primitives.** A new screen should need no new CSS.
- **Use `<Field>` for every control.** It wires the label, the hint, the error,
  `aria-describedby` and `aria-invalid` — none of which anyone has to remember.
- **Wrap every table in `<TableWrap>`.** A seven-column table must scroll inside
  its own box; without it the page scrolls sideways and takes the nav with it.
- **Say something on an empty screen.** "No clients", "no clients *match*", and
  "you may not see clients" are three different facts.
- **Let the API's words through.** `<ErrorNotice error>` shows the message
  verbatim. Several are deliberately vague — the API must not confirm who holds
  an account, and a friendlier local rewrite would leak what it refused to.

## Don't

- **No inline `fontSize`, `color`, `borderRadius` or `boxShadow`.** All four are
  lint errors, each naming what to use instead.
- **No hex values in components.** Add a token, if it is genuinely new — and it
  almost never is.
- **No second nav.** The sidebar in `AppShell` is the only navigation. A page
  that lists its own links is a second thing to keep in step.
- **No one-off component for one screen** unless it is genuinely local — see
  `PermissionChecklist` in `/admin/roles` for the shape that is fine: local to
  the screen, built from shared parts.
- **No new tab implementation.** There were three. Now there is `<Tabs>`.

## Accessibility is part of the system, not a later pass

The components carry it so screens do not have to:

- `<Field>` generates the id, ties the label, points `aria-describedby` at the
  hint and the error, sets `aria-invalid`, and gives the error `role="alert"`.
- `<Tabs>` is a real tablist: `role`, `aria-selected`, `aria-controls`, arrow
  keys, Home/End, and a roving tabindex.
- `<Dialog>` is the native element, so the focus trap, Escape and the inert
  background come from the browser rather than from code that is *almost* right.
- `<Switch>` is a real checkbox under the track — it keeps every keyboard and
  screen-reader behaviour a checkbox already has.
- One focus ring, defined once in `base.css`, on everything.
- Icons are `aria-hidden`: the label beside them is already the accessible name.

When a column has no visible header, give it one anyway:
`<Th><span className="sr-only">Actions</span></Th>`.

## Responsive

One breakpoint strategy, in `layout.css`. At **60rem** the sidebar folds into a
horizontal scroller and page padding tightens. Everything else is fluid by
construction — `auto-fit` grids, wrapping clusters, scrolling tables — so no
page needs a media query of its own, and none has one.

## Themes

Light, dark, and follow-the-system, switched in the topbar. "System" is the
default and stamps no attribute, which is what lets `prefers-color-scheme` do
its job. The choice is applied before first paint by an inline script in the
root layout, so there is no flash.
