# Forms, inputs, refusals and focus

## Submitting a form (F05, audit 2026-10-03)

- **Never `<form action={fn}>`.** React 19 resets such a form once `fn` has run, whatever the API
  answered, so a refusal arrived over empty boxes. A lint rule refuses `action` on a `<form>`.
- Every form submits through `onSubmit={(event) => keepTyped(event, fn)}` (`@/lib/ui/keep-typed`),
  which hands `fn` the same `FormData` (the pressed button included) and resets nothing. `fn`
  resolves `true` only when the save went through AND the form stays on screen for the next entry
  (add a line, record a payment); only then is it cleared. A form that closes, navigates or
  remounts on success returns nothing.
- **Clear the refusal BEFORE the call, never on success.** `ErrorNotice` focuses itself when it
  APPEARS; cleared only on success, a second identical refusal never re-appears and is never
  announced. The same holds for outcome sentences ("13 added" left beside a removal's confirmation
  read as the removal's answer; the account team's "moved" notice is cleared before each assign).
- `bib/demo-assets/tools/audit-verify/f05-walk.mjs` refuses every form twice and checks the boxes,
  the focus and the second press.

## Refusals: where they are drawn, and focus

- **The API's message is shown verbatim** (`ErrorNotice`), never reworded.
- **A refusal is drawn beside the press that caused it, and takes focus** (`useAppearFocus`,
  which also scrolls it into view). A refused "Write it and add it to this service" once drew its
  alert 131px ABOVE the viewport over a 900px form; `FailureNote`'s own doc already said an error
  three screens above the button is an error nobody reads. A section with several acts remembers
  which one was pressed and draws the sentence inside that act's confirmation or save row (e.g.
  `RuleEditor`'s `refusal` slot).
- **Exception: an edit-in-place box** (`EditableText`, `proposal-document/editable.tsx`) shows its
  refusal as a plain `role="alert"`, NOT an `ErrorNotice`: taking focus blurs the box, blurring
  saves, and the refusal would fire the same save forever. Focus returns to the pencil only after a
  KEYBOARD exit (Ctrl/Cmd+Enter, Escape) and only if focus was lost; never after a blur.
- **Refuse locally what the request schema would refuse, before any call** (`RuleEditor`, the
  Catalogue's `refusalsOf`): check the fields the body requires, draw the sentence in the field's
  own `error` ("Give the filing a name, for example GSTR-3B."), show nothing until save is pressed,
  drop each sentence once its field is fixed, remember them per form, and move focus to the first
  refused field below the sticky bar (`scrollBelowBar`). zod's raw sentence ("name: String must
  contain at least 1 character(s)") must never be what a user reads. When a local refusal fires,
  clear the API's previous one (`onRefused`), or both sentences show.
- **A sentence answering a press takes focus when the press unmounts its own button** (a removal
  unmounts its row): `useAppearFocus`.
- `useSwapFocus` hands focus to whatever replaces a control (a form opening under a header button,
  a confirmation replacing its trigger) and back.
- **Arriving at an anchor** (`#rule-<id>`, `#brand-entity-<id>`): scroll with `scrollBelowBar`
  (`@/components/ui`, it measures the sticky bar; a fragment-only change is a same-page jump the
  browser makes itself, under the bar), make the row `tabIndex={-1}` and focus it with
  `preventScroll`, so the next Tab is the row's first control. Only on arrival (first answer and
  `hashchange`), never on a reload after a write.

## Controls that would be refused

- **Do not offer what the API will refuse**: a control that will 4xx is a slower error. Either
  leave it out (the refusal is about what the thing IS) or disable it **with the reason** in a
  sentence or `title` (the refusal is about something the reader can change). A vanishing control
  reads as a bug; an explained one reads as a rule.
- **A disabled control reads the API's own count** (Done disabled while `subStepsOpen > 0`, with a
  sentence saying how many are left); the API's 409 is still shown verbatim if it arrives.
- **Ask for what the API requires before the press** (a blocked state's reason box appears when
  the state is picked; Send back opens its note inline): a person who has pressed Save has lost the
  sentence they were about to write.
- **Never `window.confirm` / `window.prompt`**: a dialog or an inline confirmation.

## Confirm in place: KEY the two branches

`DeleteMistake` (`src/components/delete-mistake.tsx`) found it: the quiet button and its
confirmation had the same shape (a `div` holding a `div.cluster` holding a `<Button>`), so React
REUSED the `<button>`, relabelled it "Delete it", and kept focus on it. A double-click or a second
Enter confirmed a warning nobody read. Both branches are keyed (`"ask"` / `"confirm"`), the quiet
button unmounts and `useSwapFocus` puts focus on the warning (measured with Playwright: mouse,
keyboard, a real `dblclick`). **Any confirm-in-place built from the same parts needs the same
keys** (the Catalogue's "Remove from this service" is safe only because its branches differ).

## Commit rules

- **Renames, ranks and lead times commit on blur or Enter**, never per keystroke: every commit
  writes an audit event, and per-keystroke saving turns one rename into twelve rows.
- **A select that is the control saves when picked** (Whose desk, a task's state, a country row on
  Your firm) and hands focus back after the reload. A row change says it held: People and Structure
  print "Saved. …" in a `role="status"` line, cleared before each call.
- **A select never answers for the user.** A choice somebody makes (a reason, a method, a source,
  who, which Dept, what kind of file) starts at a disabled "Choose…" with `defaultValue=""` and is
  `required` where the API requires it. A select that SHOWS a saved setting keeps its value.
  `bib/demo-assets/tools/audit-ux/select-defaults.mjs` lists every select whose first option is
  not empty. Files never default their kind ("What it is" starts empty, required).

## Layout of fields

- `.field-row` is a grid with `align-items: start` (it was `end` until 2026-09-26, which lifted the
  control of any column carrying a longer hint or an error above its neighbours; old notes saying
  "never put a hint inside a `<FieldRow>` column" are obsolete). A hint hangs under its own control.
- A button in a row of fields takes `.field-action` (drops one label so it is level with the
  controls), or `className="justify-self-start"` to stop the grid stretching it.
- A section that contains its own text boxes must sit OUTSIDE a parent `<form>` (Enter in any of
  them would submit the parent); the parent's submit reaches it with `form="<id>"`.
- Radio groups are named with `useId`: two groups with one name in a document are one group.
- **Accessible names lead with the visible words** (`Remove from this service: GSTR-3B`, `Keep it:
  GSTR-3B`), so six rows are six different buttons and voice control still reaches them.
- Popovers on a phone keep a 16px gutter (`collisionPadding={16}`).

## Reads behind a form

- **A list read that can race keeps only the newest answer** (a counter in a ref drops any answer
  that is not the latest read's). `/portal/requests` lost a client's first request behind a late
  mount read (F19, reproduced with a held response).
- **A native `<select>` that loads its options on its own focus is always empty**: it opens the
  instant it is clicked. Load on an earlier act (the reply box being touched, T6.8).
- **A component that reads its list only on mount needs a `key`** that changes when a write adds
  to it (`<Documents key={sentPdf.versionId}>` said "Nothing attached yet" beside the email that
  attached it).
- **A form copying a record into its boxes at mount is keyed on that record**
  (`key={JSON.stringify(proposal)}`), or a stale copy is saved back over a newer one.

## Typed boxes (2026-09-30)

- **Every box for a fee, price, quantity, discount, rate or advance is `<AmountInput>`**
  (`@/components/ui`). It takes digits, commas (people write 5,00,000) and one point, and no more
  places than `decimals` (2 money, 4 quantity or percentage, 10 an exchange rate); `signed` lets a
  leading minus in (a payment reversing one). A letter, "₹" or a second point is not taken. The
  value stays a string; **every submit strips the commas with `cleanAmount`** (the API takes digits
  only). A box the page filled with more places than it takes ("25000.0000") stays editable;
  prefill from an API decimal through `formatCount` ("1", "25000", never "1.0000").
- **A phone is `<PhoneInput>`** (`@/components/phone-input`, NOT in the ui barrel: it pulls in
  libphonenumber-js, which must not load on every page). A calling-code picker (open list "India
  +91", closed box "+91", `.phone-code`) and a number box taking digits and the usual separators,
  stopping at a complete number in the fixed-length countries (IN, AE, SG, US, CA) and at the
  plan's longest elsewhere; it picks the country from a pasted "+971 …" and says "Not a valid
  number for India" on leaving a bad one. It hands the page E.164 through `onChange`, or a hidden
  input named `name` for a `FormData` form; `country` makes the code follow the form's Country
  until somebody picks one. Stored phones print through `formatPhone` ("+91 98200 12345").
- **Countries** are the 249 ISO 3166-1 codes (`COUNTRY_CODES` in `@/lib/country`, the list the
  API enforces in `domain/country.ts`), picked with `CountrySelect`. Never build the list from
  AA..ZZ (the browser names retired codes); a saved code outside the list is shown as itself.
- **Kinds of company** come from `ENTITY_KINDS` / `EntityKindSelect`, saved as the codes a filing
  rule matches on; `entityKindLabel()` prints one.
- **Indian states** come from `components/state-select.tsx` (`GET /invoicing/states`), so a place
  of supply can always be read; a region typed before stays offered "as typed".
- Walk: `bib/demo-assets/tools/typed-inputs-walk.mjs` (21 checks, on an `epb-fixture.mjs` firm).
