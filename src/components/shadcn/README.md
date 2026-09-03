# `src/components/shadcn/`

Where `npx shadcn@latest add <name>` puts things. Empty until the first one lands.

## Why this is not `src/components/ui/`

Because `src/components/ui/button.tsx` already exists, and so do `card`, `dialog`, `table`,
`tabs` and `tooltip`. shadcn's CLI writes a file per component under whatever
`aliases.ui` names, and it does not ask before overwriting. Pointing it at the design
system's own folder would have replaced this product's Button — used on 42 screens, carrying
the brand-primary decision written down in `tokens.css` — with a stock one, in a command that
looks like an install.

Two folders is also what makes a migration reviewable. A screen imports from `@/components/ui`
or from `@/components/shadcn`, and which one it is says how far that screen has been moved.

## Rules for anything added here

- **It comes out in this product's colours or it does not ship.** `src/design/tailwind.css`
  maps shadcn's token names (`background`, `primary`, `border`, `muted-foreground`, …) onto
  the real tokens, so a stock component should already be right. If one arrives looking like a
  different product, the mapping is missing a name — fix it there, not with a hex here.
- **Read the diff the CLI writes.** It is allowed to touch `components.json` and the CSS file;
  it is not allowed to introduce a second palette. `npx shadcn init` is the command that WOULD
  do that, which is why this project was wired up by hand instead.
- **No `lucide-react` unless a component genuinely needs it.** There is already an `Icon` in
  `@/components/ui/icon`. Two icon sets in one screen is visible.
- **Utilities lose to `components.css` right now** — see the header of
  `src/design/tailwind.css`. A component built here that still carries a design-system class
  will find its Tailwind classes silently outranked. Build them clean, on utilities only.

## The exception that is staying

`@/components/ui/dialog.tsx` is the native `<dialog>` element driven by `showModal()`. The
browser gives it a focus trap, Escape handling, an inert background and the top layer, all of
which Radix's Dialog re-implements in JavaScript on a `<div>`. Replacing it would be a
downgrade, so it is not on the list. `tabs.tsx` likewise already implements the full ARIA
tablist with arrow keys, Home/End and a roving tabindex.

The hand-rolled one that IS worth replacing is `menu.tsx`: it is a `<details>` element wearing
`role="menu"`, and it has no arrow-key navigation between items — an ARIA promise the markup
does not keep.
