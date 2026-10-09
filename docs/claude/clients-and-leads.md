# Clients, the account team, import, and leads

| Route | Is |
|---|---|
| `/clients` | the firm's book: tabs **Everyone** / **My clients**; **Add a client** (brand button, a dialog) |
| `/clients/[partyId]` | party 360: the account team, identifiers, registrations, relationships, and the client's cards (below) |
| `/clients/import` | bring in the book from spreadsheets (T6.12); `tenant:admin`, offered from `/clients` |
| `/leads` | the pipeline: capture with dedup, stage, ownership; **Capture a lead** opens the form |
| `/leads/[leadId]` | one lead (its three cards are one since W4C); **New proposal** is its brand button |

## `/clients`

- **Two tabs, not one filter.** "Everyone the firm stores" and "the clients I was put in charge
  of" are different questions: the second reads the assignments (`GET /api/v1/my-clients`, sent
  the browser's `asOf` because the API runs in UTC; without it a client assigned this morning was
  missing from its holder's book until the afternoon). One row per client with every role
  collected (a partner is often Key Manager AND a Dept's SPOC; listing twice reports a bigger
  book). An archived client is shown and marked, not dropped: somebody still holds it.
- **The firm's own companies are not clients** (`isOwnCompany`): New task and the Relationships
  picker never offer them; the client page hides client-only actions on one.
- **Add a client requires country and kind** (quick wins of 2026-10-05: Q066, Q027, Q059, Q064,
  Q076; the rest are below and in `shell-and-navigation.md` (Admin and record screens)), and the year end is `YearEndField` (`components/year-end-field.tsx`): India reads "31 March (fixed for India)" in
  a read-only input (so a FieldRow lines up); elsewhere a required month + day posting `MM-DD` in a
  hidden input. Also used by the register form and "Correct the country, kind or year end".
  Setup's `client_details` line links each gap to the client.

## `/clients/[partyId]`: the account team (G3.2)

It leads with **who at the firm owns this client**: the Key Manager and a SPOC per Dept.

- **The "as of" box is the point of the panel.** Nothing is edited over: a handover closes one row
  and opens the next, so "who was the SPOC in March" is a date in a box. The API returns the whole
  history at once; changing the date filters what is loaded. On a past date the End buttons
  disappear and a line names the day shown (acting on March's team would change the past).
- **The column says "Until", not "to"**: the dates are HALF-OPEN; an assignment ending 1 April was
  in force through 31 March, and "to" makes the changeover day look like two SPOCs.
- **A Dept can have more than one SPOC**: adding a SPOC adds one; ending the outgoing one is a
  separate, deliberate step, and the form says so. A new **Key Manager** is a handover and the form
  says that instead. The Dept picker is absent (not disabled) for Key Manager: the API refuses one.
- **Today is the browser's calendar day** (`browserDay`), never `toISOString()`.
- **The assign form is there for everybody who may assign** (since 2026-09-25): assigning needs
  `party:write`, which a manager holds, so its pickers read `/tenancy/colleagues` (active staff by
  name and rung, no emails: Shrestha's decision that every staff member may see colleagues' names)
  and `/tenancy/axes` (the ACTIVE Depts and teams), both `party:read`. Swapping only the first left
  the form hidden (the Dept list 403'd); only walking the page as a manager showed it.
- **Naming the team says what it moved** (the catch-up, T6.17, 2026-09-27). The assign route
  answers `caughtUp`; `AccountTeamPanel` turns it into one sentence per person ("1 task and 2 steps
  moved to Asha Associate."), named from the colleagues list it holds, in an `ok` Notice under
  "Work already created". Nothing when nothing was waiting; `null` (moving failed, the assignment
  saved) is a `warn` telling the reader to hand the work out from the board. Cleared BEFORE each
  assign.

## The client page's other cards

- **Identifiers**: "Attach an identifier" lives inside Identifiers; Register it and Add an
  identifier are folded, but OPEN while there is none (an unregistered company is why the calendar
  is empty). The identifier form is offered on `party:write` like every other write on the page
  (it was shown to everybody and refused by the API). Its Value box switches by Type: a phone box,
  PAN 10 characters, GSTIN 15.
- **Portal access** (2026-10-05 quick win): the invite form's "Also give access to the group's other
  companies: …" is ticked when the server's group (`GET /portal-access/clients/{id}/group`) is not
  empty; "Give another company" offers that group (sisters included) and "Give the whole group
  (N)"; a "Same group" notice offers contacts who see the group but not this company.
- **Engagements** has a Billing column and links to Work vs Billing (`billing-and-invoices.md`);
  **Advances** (`clients/[partyId]/advances.tsx`) and **TDS** (`tds-card.tsx`, `#tds`) likewise.
- **Filing clock** (`entity-clock.tsx`, US zones) and **Tax return periods** (`return-periods.tsx`:
  tax, monthly or quarterly, which months the quarters start in): S3, `compliance-calendar.md`.
- An Indian billing address picks its state from `StateSelect` (`forms-and-inputs.md`).
- **Building `/clients` and `/leads` found API gaps** no backend test had: `registerLegalEntity`
  was a write with no read, party 360 omitted the organisation/person detail the create form
  captured, and relationships came back as uuids. All fixed in the backend.

## `/clients/import`: the book from spreadsheets (T6.12)

One screen, in reading order: the three templates, the upload, the report, the row-by-row
verdict, and the letters.

- **Templates are header-only CSVs**, with the firm's own Depts expanded into one `SPOC: <code>`
  column each. No example row: a row of plausible values uploaded unchanged becomes a client. The
  upload takes a `.csv` or `.xlsx` per sheet; only Clients is required (in Excel, dates are typed
  normally; in a CSV, as `2026-08-23`).
- **Confirm sits on the report and is DISABLED while a blocking finding remains**; the sentence
  beside it says which state the screen is in.
- **The report and the outcome are one component**: before confirm a row shows what it WILL
  become, after, what it DID (the outcome's action and detail take over the verdict's columns).
  A created client links to its page, a signed letter to its own; a skipped row says what it was
  already on file as.
- **The compliance notice is the most important thing on the page, and a warning, not a block**:
  the API counts engagements older than the calendar's reach-back, and the screen says before
  confirm that without a go-live floor every filing already made in the old records will show as
  missed, linking to where the floor is set (Your firm → Deadlines).
- `Templates` and the report each render ONE `<TabPanel>` for the selected sheet: `TabPanel` takes
  no `hidden` prop, and rendering three stacks them.
- Walk (`bib/demo-assets/tools/s08-client-import.mjs`) traps: the "Upload" heading matched
  "Previous uploads" in a locator; the client page is headed by the DISPLAY name (trading name),
  not the legal name the row linked by.

## `/leads`

- **New lead, "Assign to"** (2026-10-05 quick win): required, nothing preselected (a colleague, the
  firm's rule, or unassigned). The hint says admins hear of every new lead.
- The filter box is "Value from", `placeholder="e.g. 1,00,000"` (the Wave 4 reference screen).
- A lead made by mistake is deleted, not closed as Lost (0086, `proposals-and-letters.md`).
