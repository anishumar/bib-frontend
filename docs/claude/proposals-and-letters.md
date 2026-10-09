# Proposals, engagement letters, and their PDFs

| Route | Is |
|---|---|
| `/proposals` | what the firm has quoted; **New proposal** opens the builder |
| `/proposals/new` | builder step 1 for a proposal not yet drafted (T6.18); `?clientPartyId=` / `?leadId=` arrive with the client chosen |
| `/proposals/[proposalId]/build` | the builder on a draft, `?step=client\|services\|preview`; a sent proposal opens on the preview |
| `/proposals/[proposalId]` | one proposal AS ITS PDF, edited on the page while a draft, the Send panel under it; below, its services with the catalogue version and list price each was pinned to, its files, and deleting a draft made by mistake. A draft's header offers **Edit in the builder** |
| `/p/[token]` | **PUBLIC**: the proposal as its recipient reads it; accept, decline, download its PDF. No session |
| `/engagement-letters` | what the firm has AGREED; **New engagement letter** (also on a client's page) |
| `/engagement-letters/new` → `/engagement-letters/[letterId]/build` | the letter builder (T6.18 S6), `?step=client\|services\|preview` |
| `/engagement-letters/[letterId]` | one letter: sections and fees, services and their wording, terms, signature, the engagements it created, deleting a draft made by mistake |

Builders' code: `src/components/proposal-builder/`, `src/components/letter-builder/`,
`src/components/proposal-document/` (editors, Send panel, store, words), `src/components/pdf-pages/`.

## The preview IS the PDF (2026-09-28)

The user: *"I want proposal preview and EL preview exactly same as we send pdf with logos, cover
etc, not like a receipt."* Two layouts drift, so there is one: the server's. The HTML imitations
(`<ProposalDocument>`, `<LetterDocument>`) are gone; `<ProposalPdf>` and `<LetterPdf>` draw the
PDF.

- **`src/components/pdf-pages/`**: pdf.js (`pdfjs-dist`), dynamically imported on these screens
  only (`load.ts`). The worker is bundled from `node_modules` with `new URL(…, import.meta.url)` so
  it is served from OUR origin: the CSP has no `worker-src`, so `script-src 'self'` applies and a
  CDN or `blob:` worker is refused. `useWasm: false` (the CSP grants no `'wasm-unsafe-eval'`).
  Pages are drawn off-screen to canvases at `devicePixelRatio` and swapped in whole; a white sheet
  per page with "Page 2 of 6" under it, fitted to the column.
- **Where the bytes come from.** A DRAFT: `POST /documents/preview` (files nothing; dated the day
  Send will be, with the firm's signature block, so an unedited draft is Send's own bytes), asked
  again 800ms after the record last changed (`usePreview`, revision = the record's JSON). A SENT
  proposal: its PDF of record (`sentPdf`, `fetchDocumentBytes`), never a fresh render. A sent
  LETTER: its signed copy when one is filed (an `uploaded` PDF of kind `engagement_letter`), else
  the preview route on its frozen rows. `/p/[token]`: `POST /proposals/shared/pdf`.
- **Editing ON the page.** The API returns `anchors` (a key and a rectangle per page in PDF points
  from the top-left: `line:<id>.scope`, `fee:group:<id>`, `block:<id>`, `add:commercial`).
  `<PdfPages>` lays an invisible `button[data-anchor]` over each (outline and pencil on hover,
  `tabIndex=-1`); a click opens that piece's editor in a popover under it. `<PdfWorkspace>` also
  lists every piece in an **Edit** panel beside the pages (a `<Dialog>` below `xl`) for the
  keyboard, screen readers, and pieces that print nothing yet (an empty Background). A hotspot
  clicked scrolls the list to its piece; a piece hovered outlines its hotspots. Pieces are built by
  `textPiece` / `choicePiece` / `blockPiece` / `addPiece` (`proposal-document/proposal-pdf.tsx`)
  over `EditableText` / `EditableChoice` / `EditableFee` (`initiallyEditing` / `onClose` for the
  popover).
- **Traps.** A popover's `close` is bound to ITS anchor: an editor finishing its save after another
  piece was clicked must not close the new one. The drawer button is wrapped in `span.xl:hidden`
  because `.btn` declares `display`. With the company's cover artwork the proposal prints NO title
  (0084), so the title is edited from the list.
- **Brand**: one quiet line over the pages when the issuing company has no logo or cover, linking
  to `/admin/brand#brand-entity-<id>`.
- Measured by `bib/demo-assets/tools/pdf-walk.mjs` (1440 and 390; shots in
  `bib/demo-assets/notes/pdf-preview/`): saving redraws in ~1.8–2.0s; a proposal's preview and its
  PDF of record hash the same, as do the letter's preview and the PDF Send renders.

## Editing a piece in place (D10)

On a live draft, for `party:write`: a pencil on hover, on its own keyboard focus, and always on a
screen without hover; the piece becomes a box that saves on blur or Ctrl/Cmd+Enter (Enter for one
line); Escape keeps what it said. The refusal is a plain `role="alert"` beside the box, not an
`ErrorNotice` (`forms-and-inputs.md`). Where each piece writes:

- Title, the two cover names, Background, validity → `PATCH /proposals/{id}` (answers the whole
  record; absent means "leave it", so each save sends only its field).
- A Notes line → the document-block routes (edit, strike off, add).
- A service's name, its four scope texts ("Back to standard" = a null override) and its fee →
  `PATCH /proposals/{id}/lines/{lineId}`. An empty scope text is not drawn (the PDF does not draw
  it); a row under the service offers to add one.
- A letter's item edit goes to every line it prints for; fee groups to the fee-group routes.

A sent document draws no controls and says why in one line.

## One record, one store

`proposal-document/store.ts` keeps the record per id: a write that answers with the whole record
puts it in (`putProposal`); every other write re-reads. A read requested while one is out waits
and reads again (the one out may predate the write); a read that left before a `putProposal` is
dropped. The page, the builder's three steps, the PDF and the Send panel all read it
(`useProposal`), so a fee changed on step 3 moves the footer total in the same render, and sending
turns everything read-only at once. The letter builder has its own (`letter-builder/store.ts`,
`putLetter`).

## One way of saying money on a document

`pdfMoney`, `FREQUENCY_WORDS` and `totalWords` (`proposal-document/words.ts`) are the proposal
renderer's own wording ("INR 50,000 Yearly", INR in lakhs, ISO code), and the builder's rows,
Details form and footer import them: "AED 4,000 Monthly" on step 2 is the same words on step 3 and
on paper. `totalWords` drops a frequency whose every line has no fixed fee (the staff read sums it
as "0" where the PDF's read has NULL; never print "AED 0 One-time"). The Summary of Fees total line
("Total INR 25,000 Monthly + INR 62,500 Yearly, plus 1 service as mutually agreed") is D8
(`totalsByFrequency`, added by the database). Letters use `letter-builder/words.ts` ("INR 5,000.00
per month", "Annually", "One-off"), the letter PDF's words. The PDF joins a service and its company
with a dash; the screen says "for".

## The proposal builder (T6.18, 2026-09-28)

A full page (D14). **Step 1**: who it is for (an existing client picked by typing, or a new
prospect via lead capture so the pipeline's dedup holds, D12), which of the firm's companies issues
it (the firm's country rule, D4, from `GET /firm-entities`) and the currency that company quotes in
(D1). **Step 2**: the catalogue one country at a time, the issuer's first, grouped by Dept then
delivery team; ticking adds the line at its list price when that price is in the document's
currency, otherwise asks "Set fee" with the box focused (D3); Details changes fee, frequency and the
four scope texts for this proposal only (D7). Step 2 is services only (its prose editor went: the
preview edits the same rows). **Step 3**: `<ProposalPdf>` + `<ProposalSendPanel>`, the same two the
proposal page mounts. The step is in the URL.

- **Step 1 is keyed on the proposal's head** (`key={JSON.stringify(proposal)}`): it copies the
  draft into its boxes once, and a cached or colleague-changed record would otherwise be saved back
  over a newer one.
- **The footer's Send does not send**: it scrolls to the panel and focuses the address box (address,
  note and channel are the panel's to decide). It is still the step's one committing act, so brand.
- The lettering of Dept sections is the API's: the read carries `document`, built by the same
  `planProposal` call the renderer makes; `plan.ts` only joins items back to lines (a local copy of
  the rules read "A. FRC" until the Dept list arrived). The cover's date is the read's `issuedOn`.
- Measured (`bib/demo-assets/tools/epb-s4-walk.mjs`, 71 checks): **8 clicks** from "New proposal"
  to Sent for one company and three services (from ~20). A UAE prospect is issued by the Gulf
  company in AED; a second draft moved to another company is asked first and gets that company's
  prose (D9).

## Sending a proposal, and the client's answer (0085, D13)

`<ProposalSendPanel>` (`delivery.tsx` is gone): "Email it to" (the person it is prepared for, in
the box BEFORE anybody presses, when the firm holds their email), an optional note, then **Send by
email**, **Send on WhatsApp** (the same send with no email, then an `Open WhatsApp` link to
`wa.me/<digits>?text=` with the one-time link, or `wa.me/?text=` with no phone on record; again
after Send again), **Just give me the link**, and **Download PDF** (a draft renders one; a sent
proposal downloads its PDF of record).

- bib emails the PDF of record with Accept and Decline buttons; replies go to the preparer. The card
  says "Emailed to …", or (the proposal IS sent either way) the mail server's own failure beside the
  link.
- **The share link is shown ONCE**, on the send response: only its fingerprint is stored. **Send
  again** issues a new one and the old one dies; the form says so. The issued-link card shows only
  while the proposal is `sent`. An **Emailed** history lists each send.
- **Client declined** (with the reason) stays for an answer given by phone or in a meeting, for
  `party:write`. The one-click "Client accepted" is gone: the API refuses an accept through
  `/decision`; a yes given outside bib is recorded (below).
- **`<Documents key={sentPdf.versionId}>`**: sending files the PDF of record, and the panel reads
  its list only on mount (it said "Nothing attached yet" beside the email that attached it).

### `/p/[token]`: the public page

- The token is in the URL because a link must be sendable; the page moves it into a request
  **body** at once, so it never reaches the API's access logs or a Referer. **Download PDF** is a
  `fetch` of `POST /proposals/shared/pdf` saved as a blob, never an `href`.
- **The email's buttons open `/p/<token>?answer=accept|decline` and answer NOTHING**: mail filters
  open every link. The answer is a form: a name for either answer, and for acceptance a tick against
  `acceptanceStatement`, the API's own sentence shown WORD FOR WORD (the API records the same
  words). Arriving from a button scrolls to and focuses the answer card with that answer ready. The
  API's refusals are written to the client ("Type your full name.", "already accepted, and that
  answer stands") and shown verbatim.
- **Totals per frequency (D8)**: one "Total ₹70,000" for ₹45,000 a month and ₹25,000 once is a
  number nobody is billed. Lines carry "How often" and there is one total per frequency, added in
  the browser with `addDecimals` on the API's four-place strings (the shared read has no
  per-frequency sum). With one frequency the API's own total and discount note stand. A zero
  discount arrives as "0.00": compare it as a decimal, not to "0" (it drew "after ₹0 off").
- The public page lists only a proposal's prose kinds (`PROPOSAL_BLOCK_KINDS`).

### The evidence card

`ClientAnswer` on the staff page: the name typed, when (with the time and the reader's zone,
`longInstantTime`, the one place a minute matters), which email's link, the statement ticked, the
PDF's SHA-256, the address and the browser. A colleague's recorded answer has no such card; the
History names them.

### A yes given outside bib: Record client's acceptance (0317, 2026-09-30)

`<RecordAcceptance>` / `<RecordedAcceptanceCard>` (`src/components/record-acceptance.tsx`) on BOTH
the proposal's Send panel and the letter page, for `acceptance:record` (a partner by default),
only while the document is `sent`. How (a select), On (a date box, sent day to today; sends
`asOf=browserDay()`), Who at the client, Their role, a Note, the client's email (**required on a
letter**, optional on a proposal). The file goes up first through `POST /documents` (kind
`correspondence`, role `acceptance_evidence`, attached to the same document); an upload that
worked is kept for a retry so a refused acceptance never files the email twice. Missing fields are
said before the confirmation opens (`ConfirmAction`'s `beforeOpen`). A recorded letter's method
reads "Recorded acceptance"; the card shows how, when, who, the note, the file and who recorded it;
both pages' `<Documents>` are keyed on the acceptance. Walk: `acceptance-walk.mjs` (21 checks,
incl. an associate refused).

## The proposal PDF: "Proposal For Services" (0084)

A COVER (the issuing company's artwork, brand asset `proposal_cover`, with "Prepared for" and
"Prepared by" drawn over it), Background, the in-scope services, the work in sections by Dept with
each service under its catalogue code, the Summary of Fees, "valid until", and the Notes (team,
general exclusions, commercials). Prepared for is a PERSON from the client's own `structure` (the
list the API checks) or the company alone; Prepared by a colleague from `/tenancy/colleagues`
(drafting names the drafter). The old "Cover and Background" card (`cover.tsx`) is gone: these are
edited on the PDF. The "Proposal PDF" panel is `<Documents renderable="proposal">`, not shared with
the portal by default (a quote may never be sent).

## The letter builder (T6.18 S6)

The proposal builder's shape and pieces. **Step 1**: client, country (decides the terms and, by the
firm's rule, the issuer), issuing company, currency, subject, addressee, work begins, Background,
advance ("Ask for an advance", with a note that work starts at signing: it has not waited for the
advance since 3 Oct), and "Replaces" when the client has a signed letter nothing replaced. On a
draft it PATCHes only what changed; issuer and country lock once a term is on the letter, currency
once anything is priced. **Step 2**: the proposal builder's `ServiceRow` (generic over `RowLine`;
`rowLineOf` maps a letter line; a line a section pays for reads "In section B"); "For which
company" is asked ONLY when the client's `structure` holds more than one company (a one-company
client is the client itself); "One fee for several services" is `FeeGroups`
(`letter-builder/fee-groups.tsx`). **Step 3**: `<LetterPdf>` in the Annexure's order, from the
read's `document` (`planAnnexure`). `<LetterSendPanel>` sends (DocuSign asks who signs) with the
owner rule's warning; Send is disabled, with the reason, until a service and a term are on it.

- **"Write it up" on an accepted quote lands on step 2** with the quote's lines, issuer, currency
  and prose (D11); the country is asked (starting at the issuer's) only when the lines disagree. The
  quote's form fills page one's four facts BEFORE anybody presses: Title ("Engagement Letter for
  <client>"), Addressed to (the quote's Prepared for), Background, Work begins (blank = the
  signature day). An emptied box is omitted, never sent as "" (every such letter once opened "Dear
  Sir or Madam," over no Background).
- The letters list's draft form is gone. Measured (`epb-s6-walk.mjs`, 69 checks): **9 clicks** from
  "New engagement letter" on a client page to Sent with 3 services and the standard terms (40+
  before), **5** from "Write it up".
- **No e-signature service configured**: the send button reads "Lock it as sent" and the page says
  nothing is emailed and what to do; with DocuSign the flow is unchanged.

## The letter page

- **A signed letter is a different kind of screen.** Edits stop because the DATABASE refuses them;
  it shows the signature, its method and the content hash, and says a change is a new letter. The
  signature form says it records a colleague's **attestation**, not a cryptographic signature
  (`signatureMethod: attested` in the trail).
- **The Annexure layout (0083)**: a cover letter, Annexure 1 (scope, deliverables, Summary of Fees
  by SECTION) and Annexure 2 (numbered terms). A letter issued before re-renders in the classic
  layout it went out in; the header's pill says which (`letter.layout`), never changeable.
- **"Sections and fees" is a fee group per section** (`fee-groups.tsx`): one fee for its services
  ("B. Ongoing recurring services, USD 5,000 per month" for twelve lines across four companies),
  whose lines carry no price. The section's LETTER is the API's `code`. Striking out a section that
  still prices a service is DISABLED with the sentence in its title.
- **A service joins a section when added** ("Its fee": the price boxes disappear, the API refuses a
  grouped line with a price) **or later from its row** (`LineFee`); moving one OUT opens the two
  boxes for what it costs now.
- **The four scope blocks**: "Tailor the wording for this letter" on the add form; each box's
  placeholder is "Blank prints: <the catalogue's words>"; an empty box sends nothing (= print the
  catalogue's). Each row's "What it covers" shows what the PDF prints, marked where the letter
  wrote its own.
- **Cover letter and Acceptance are two more kinds of the letter's own prose**, drawn as paragraphs.
  Every document screen passes `DocumentBlocks` the kinds its document carries
  (`LETTER_BLOCK_KINDS`, `PROPOSAL_BLOCK_KINDS`).
- **Terms**: **"Add all standard terms for <issuer>"** (T6.18 item 7, D6) adds every published
  clause through the add-one rules and lists what did not fit with the API's sentence ("…names IN
  as its governing law, and this letter is issued by an entity registered in AE…"). The one-at-a-time
  picker offers only what fits: the letter's country (`clauseApplies`) AND the issuer's law and
  courts (`lawFits`, from the read's `issuer.jurisdiction`), never what is already on it.
- **Who can supply what a letter lacks (CA#2 / CA#3)**: `useWhoMay(permission)`
  (`lib/ui/who-may.tsx`) names the active colleagues whose role holds a permission; `StandardsHelp`
  says, on the send panel, the letter page and an empty "Add all standard terms", where a missing
  opening or missing terms come from: links to Standard wording and Standard terms for `tenant:admin`,
  the names of who has it for anybody else.
- **"Signed by" (0343, Q005)**: `SignedBySelect` (`src/components/signatories/`), beside Send on
  the letter page and in `LetterSendPanel`: "Firm default: <name>, <title>" (saves null) plus every
  active signatory, and the current choice even if retired since, marked "(retired)", so the drafter
  sees why Send will be refused. A change PATCHes the letter at once and hands the answered record
  back (`putLetter` in the builder, so the PDF redraws with the new name and signature). A sent
  letter shows its frozen block instead. The list itself: `shell-and-navigation.md` (Admin and record screens).
- **"Won by" (Q049)**: `components/letter-originator.tsx`, a `MetaItem` in "The document": the
  originator and how it was arrived at ("From the lead's owner", "From who prepared the proposal",
  "Set by Pat Partner on 05 Oct 2026", "Nobody recorded"). **Change** only for `tenant:admin`
  (colleagues and "Nobody"); correctable on a SIGNED letter too (it is not a term).
- **An unsigned letter warns whose desk its work will land on** (T6.17): it reads
  `GET /engagement-letters/{id}/routing` while draft or sent, and `RoutingWarning` lists each Dept
  whose rung is not the SPOC, with the owner, why, and a link to the client. A `role="status"`
  warning, never a disabled Send; nothing when every Dept has a SPOC.
- Billing on the letter page (Billed column, Advance column/card, Advance received):
  `billing-and-invoices.md`.

## Who a letter or invoice may name (F-10-1, 2026-09-25)

Every party picker used to be the whole book, and the API checked only that the party was the
firm's: a letter could be issued by a client, cover another client's company (whose work then
landed in this client's portal), or be addressed to another client's director; an invoice could be
charged by a client (opening a numbered GST series in its name) or bill the firm itself. The API
refuses all of it, and **each picker offers exactly what it accepts, read from the API**:

| Picker | Reads |
|---|---|
| letter "Issued by", invoice "Charged by" | `/firm-entities`, the firm's own companies (members since 0313, whether or not a country points at them) |
| letter "Client", invoice "Bill to" | the book, minus those companies |
| letter line "For which company", a quote's "Which company is this work for?" | `/parties/{id}/structure` → `entities` |
| letter "Addressed to" | `/parties/{id}/structure` → `people`, re-read when the client changes |
| invoice line's engagement | `/parties/{id}/billable-engagements`, already the billed client's |

**`structure` is NOT `groupCompanies` (`lib/group.ts`), and swapping them is the bug.**
`groupCompanies` reads the group both ways round, for portal access; a letter may cover only the
client and what it HOLDS (subsidiaries at any depth, companies it is a shareholder or director of:
Shrestha's decision).

## Deleting a mistake: a lead, a draft proposal, a draft letter (0086, 2026-09-27)

A mistake had nowhere to go: a lead could only be closed as LOST (counted in the pipeline), a draft
proposal only SENT, a draft letter only WITHDRAWN (listed for ever). The user decided: delete what
was made by mistake while nothing depends on it and it has not left the firm, and **hide it rather
than erase it** (backend CLAUDE.md has the rule). One component, `DeleteMistake`
(`src/components/delete-mistake.tsx`), for all three, because a deletion is not an outcome and
cannot be undone, and three versions would phrase that differently.

- **The API says in advance whether it would work**: each read carries `deleteRefusal` (the code and
  sentence, or null). The card appears only when it will work, or, for refusals worth reading (each
  page's `explained`), shows the API's sentence where the button would be ("Proposal PR-2026-0005
  was drafted from this lead…", "only a firm administrator can…"). A refusal about what the thing IS
  (sent, signed, converted, deleted) draws no card. `party:write` comes from `useSession()`.
- **Confirmed in place** ("Delete it" destructive beside "Keep it"), with KEYED branches
  (`forms-and-inputs.md`: a double-click once deleted unseen).
- **After it works the page reloads and says so**: `DeletedNotice` (`warn`, nothing went wrong)
  names when (`longInstant`) and who, and every control that would be refused is gone (`isDraft`
  false once deleted; the lead page hides its forms; Documents stops offering to attach; the letter's
  wording is `editable={!isSigned && !deleted}`, which the walk found gated on "not signed" alone).
  Lists need no change: the API leaves deleted items out.
- **A draft letter has no Withdraw**: Withdraw is for a letter the client has SEEN.

## Your firm, its companies, signing and brand (`/admin/firm`, `/admin/brand`, prose and terms)

The admin screens that decide who issues a document and what it says.

### Your firm (`/admin/firm`, Wave 4: it holds all of it)

- Sections: **Setup** (readiness, below), **Companies** (with the country table), **Signing**,
  **Deadlines** (count-from day, financial-year start, time zone), and the **discount limit**. A
  section whose value is set shows it with **Change**; one that is not set shows its form straight
  away with the consequence as the field's one-line hint ("No letter can be sent until someone is
  named."). **The discount limit is PUBLISHED in the same act** (the API reads it live and treats no
  published limit as ZERO; the Catalogue's old card only drafted one, so a limit set there never took
  effect).
- **Why each is on it (G1.8): four setup steps once had no screen** and each blocks something a firm
  cannot see coming: an unregistered issuing company (every engagement letter refused), no signatory
  (no letter can be sent), no clause for the country (every imported engagement BLOCKING), no
  compliance floor (hundreds of MISSED filings the first morning after an import). **The consequence
  is said before the form, not after the refusal.**
- The issuing company is read off `/firm-entities/preferences` (the `*` fallback row every firm gets)
  and registered through the route the client page uses. The floor and the financial-year start are
  `compliance_policy`'s `default` entry, defined on a firm with none or drafted as the next version,
  and PUT IN FORCE in the same act (a draft floor governs nothing and would look set).
- **A half-written term is SENT as typed** so the registry's own refusal ("never half a statement")
  reaches the screen instead of being tidied into a clause naming no law.

### Setup readiness (V2.6, audit 2026-10-03)

`GET /api/v1/tenancy/readiness` (`tenant:admin`) returns lines as CODES; `lib/ui/readiness.tsx` is the
ONE place they become words and links, so Your firm and My day never phrase a gap twice.

- Your firm opens with a **Setup card** (`#setup`): a whole-row link per line to the screen that fixes
  it (Deadlines is `/admin/firm#deadlines`, which is why `SetOnce` takes an `id`), a Done / To do pill,
  up to three gaps under the label with the client LINKED ("and N more"). It is read in the page's own
  `load`, so saving Deadlines turns that line Done in the same reload. **My day shows "Setup: 5 of 8 ·
  See what is left"** for `tenant:admin` only, and nothing once all are done.
- **Thirteen lines, three states**: a line with nothing to look at yet (no clients, services, or check
  rule reading reporting lines) shows **Nothing to check yet** in a neutral pill and is left out of "N
  of M done". Lines include the companies' country and address, the time zone, colleagues, a service,
  standard terms.
- **The ladder line never suggests days** (it asks that each ladder is PUBLISHED; decision D3).
  `request_routing` counts `none` as not set although the API calls it a real answer: the brief asks
  that the firm CHOSE who picks up client requests.
- The time zone lives here (`#time-zone`, `lib/ui/time-zone.tsx`), not on Structure (`money-and-dates.md`).

### Companies (T6.18, 2026-09-28): the firm is several companies

- `GET /firm-entities` is the ONE list that Your firm, `/admin/brand`, the prose tabs and the builder's
  "Issued by" all read, so no two screens disagree about which companies the firm has. **Add a company**
  (a dialog) is one call (`POST /firm-entities`: organization, country and the routing row, in one
  transaction). A country another company already quotes is said under the picker and the button is not
  offered (`COUNTRY_ALREADY_SERVED`); **Change** sends only what changed; a country is offered only while
  the company has none (`JURISDICTION_FIXED`). The country table is the preferences route; **a pick
  SAVES** (a quiet select per row, focus handed back after the reload), "Everywhere else" is the `*` row,
  and there is no delete behind it. `/admin/companies` redirects to `/admin/firm#companies`; brand and
  wording links sit behind each company's **More** menu.
- Membership is by `crm.is_firm_entity`, not by a routing row (0313, S6): giving away a company's last
  country only re-routes clients and the list reads "no country yet". (Before 0313 a company left with no
  country vanished from every list.)
- **Measure the table, not only the page**: `.tablewrap` scrolls its table inside itself, so the first
  company list hid its currency and buttons at 1280 while the page reported 0 overflow
  (`bib/demo-assets/tools/epb-s5-walk.mjs`, 61 checks, measures every `.tablewrap`).

### Signing (0343, Q005)

Two components in `src/components/signatories/`, in their own files so `admin/firm/page.tsx` changed in a
few lines. **`SignatoriesCard`**: a table of Name (Default / Retired pills), Signs as, Signature, Change +
More (Make default, Retire / Reinstate); an empty list shows the add form; the first signatory becomes the
default (the API decides). **Change** edits the title and uploads the person's own signature as the brand
screen does: a document first (`POST /documents`, kind `brand_asset`), then `PATCH
/tenancy/signatories/{id}` with its version. A default with no image of their own reads "Uses each
company's signature" (what the letter prints); anyone else without one is Not set (a bare line, never
somebody else's signature). **`SignedBySelect`** is on the letter page and in the builder's
`LetterSendPanel` (see "The letter page"). Walk: `bib/demo-assets/tools/sig-walk.mjs` (24 checks).

### `/admin/brand`: the marks, per COMPANY

- Led by the entity, not three upload boxes: a letter its US company issues must not print the Indian logo
  (the same class of error as Indian governing law, G1.8). One table of four marks per company; the file
  picker opens from **Upload / Replace** and the file goes up as soon as it is chosen. Where each mark
  prints is the row's hint (`BRAND_ASSET_HINTS` in `client.ts`), including that the letterhead is stored
  and not printed yet. A company's link from Your firm lands on `#brand-entity-<partyId>`.
- **Putting one in force SUPERSEDES; it does not replace.** The previous mark stays stored and
  downloadable (last year's document was issued under last year's logo); no delete, no endpoint.
- Setting a mark is **two calls**: the bytes become an ordinary document, then that version is put in
  force. If the second fails the screen says the file was stored and is not in force, rather than sending
  somebody to re-upload a file the store already holds.

### Standard prose and standard terms: Default, and one tab per company (D5, D6)

- **`/admin/document-blocks` ("Standard prose")**: tabs **Default · each company** (`?company=<partyId>`).
  The rule (D5) is per KIND: a company with any active line of a kind prints only its own lines of that
  kind, otherwise the Default ones; "Only in" applies inside either set. Shown as a company-by-kind table
  (Own / Default / none) above the tabs. On a company tab each kind is either **Using the default
  wording** (inherited, read-only) with **Write this company's own** (COPIES the Default lines: order,
  heading, country, opened as text boxes), or its own lines with **Go back to the default** (RETIRES
  them); retired lines sit behind a disclosure with Restore. The boxes edit where a line prints too: the
  Default GST line is India-only, so a Gulf company rewriting it as VAT must change that or never see it.
  An empty kind's add form starts FOLDED.
- **`/admin/standard-terms`** (moved from the Catalogue, W4B): **Default** lists the terms that name no
  law (on every company's letters); a **company tab** lists the terms under its country's law (two
  companies in one country share them); a term under a country no company is in, or naming two
  countries, is listed on Default as usable by none, not dropped. A letter is offered the terms whose law
  fits its issuer (`lawFits`, the API's `refuseForeignTerms`) plus the no-law ones. **Write a term** (a
  dialog) writes and publishes in one act (no clause editor to come back to: a draft would be a clause
  the list marks "never in force" that no letter can pin); on a company tab the country is the company's
  and fixed, the partner types the words that print ("the laws of the DIFC"). A company with no country
  says so and links to Your firm. Read on `config:read` (an associate drafting a letter reads these).
