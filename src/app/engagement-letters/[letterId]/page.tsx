"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Documents } from "@/lib/ui/documents";
import { DocumentBlocks } from "@/lib/ui/document-blocks";
import {
  LETTER_BLOCK_KINDS,
  PARAGRAPH_BLOCK_KINDS,
  api,
  apiError,
  clauseApplies,
  formatCount,
  formatMoney,
  lawFits,
  readClauseBody,
  readServiceBody,
} from "@/lib/api/client";
import type { ConfigEntry, LetterRecord, LetterRouting } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Button, Field, Input, LinkButton, Meta, MetaItem, Select, Textarea } from "@/components/ui";
import { FeeGroups, LineFee, groupFee } from "@/components/letter-builder/fee-groups";
import {
  Card,
  CardTitle,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { instantDay, longDay, longInstant } from "@/lib/day";
import { DeleteMistake, DeletedNotice } from "@/components/delete-mistake";
import { RoutingWarning } from "@/components/letter-builder/routing-warning";
import { totalWords } from "@/components/proposal-document";

/**
 * One engagement letter: the document, its signatures, and the work it created.
 *
 * The screen where the difference between a proposal and a letter shows. A
 * proposal can be superseded quietly; this cannot be changed at all once it is
 * signed — the database refuses it, not just this app — so the page stops
 * offering edits and starts showing what was agreed.
 *
 * IT READS LIKE THE DOCUMENT IT IS. Its reference, who it was written to, who
 * on the firm's side is bound by it, why the client is buying, when the work
 * begins, the terms as they were PINNED, and BOTH halves of the signature
 * block. Every one of those is a term the signature hash commits to, and until
 * they were on this page a letter's own screen could not show what its client
 * was holding.
 *
 * Where the API returns an id it also returns the NAME — the issuing entity,
 * the addressee, each line's entity, the letter this one replaces — so nothing
 * here has to render a uuid at a person.
 */
type StandardClausesAdded = components["schemas"]["StandardClausesAdded"];

export default function LetterPage() {
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const letterId = params.letterId;

  const [record, setRecord] = useState<LetterRecord | null>(null);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [clauses, setClauses] = useState<ConfigEntry[]>([]);
  // The entity a line is FOR (G0.1). An engagement is `service x ONE legal
  // entity` — vCFO for a group of four companies is four engagements, not one
  // — so a line has to name the company, and a dropdown of uuids would be
  // exactly the read-model failure this codebase keeps re-learning.
  //
  // THE CLIENT'S OWN COMPANIES, NOT THE FIRM'S BOOK (F-10-1). This was every
  // party the firm holds, so a line could be for another client's company and
  // its work then landed in THIS client's portal. The API refuses that now, and
  // this list is its own answer — the client, and what its page records under
  // it — so the picker offers exactly what the API accepts.
  const [entities, setEntities] = useState<{ id: string; displayName: string }[]>([]);
  // WHO WILL BIND THE FIRM. The letter's own block is a snapshot taken when it
  // is SENT, so a draft has none yet and the standing signatory is the only
  // honest answer to "whose name goes under Yours sincerely". Null is a real
  // state: a firm that has named nobody sends letters with no signature block.
  const [standing, setStanding] = useState<
    { userId: string; displayName: string | null; title: string } | null
  >(null);
  /**
   * WHOSE DESK THE WORK WILL LAND ON once this letter is signed (T6.17), read
   * only while it is unsigned: a draft, or sent and waiting. Null otherwise.
   */
  const [routing, setRouting] = useState<LetterRouting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** What "Add all standard terms" did last: the API's own list of what went
   *  on and what was left off, with each refusal's sentence (T6.18, D6). */
  const [standardTerms, setStandardTerms] = useState<StandardClausesAdded | null>(null);
  /**
   * WHICH CATALOGUE VERSION the add-a-line form is pointed at.
   *
   * A `<select>` with no state cannot say what was chosen, which is why picking
   * a service used to fill in nothing at all. Declared with the other hooks
   * rather than beside the value it feeds: this component returns early while
   * it loads, and a hook after an early return runs in a different order on the
   * two paths.
   */
  const [picked, setPicked] = useState("");
  /**
   * The section the add-a-service form is pricing by, or "" for its own price.
   * State for the same reason `picked` is: choosing a section HIDES the price
   * boxes, because a service in a section has no price of its own and the API
   * refuses one sent anyway.
   */
  const [addFee, setAddFee] = useState("");
  /**
   * Did the carry-forward that made this letter leave lines behind?
   *
   * Read from the URL, once, and deliberately NOT stored: which lines a
   * particular act skipped is a fact about that act — the ledger has it — and a
   * letter opened next week has nothing to say about it. `useSearchParams`
   * rather than `location.search` so this still reads correctly under the App
   * Router's client navigation, which is how the reader gets here.
   */
  const carriedPartially = useSearchParams().get("carried") === "partial";
  const [loaded, setLoaded] = useState(false);
  // What to OFFER, never what is allowed — the API is the only place the answer
  // lives, and its refusal is shown verbatim when one arrives.
  const [permissions, setPermissions] = useState<string[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const [one, catalogue, library, signatory, me] = await Promise.all([
      api.GET("/api/v1/engagement-letters/{letterId}", { params: { path: { letterId } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }),
      api.GET("/api/v1/tenancy/firm-signatory"),
      api.GET("/api/v1/auth/me", {}),
    ]);
    setPermissions(me.data?.permissions ?? []);
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setRecord(one.data);
    // Published only, for both. A draft was never in force, and the API refuses
    // to put one in a contract — offering it would be a dropdown entry whose
    // only outcome is an error.
    if (catalogue.data) setServices(catalogue.data.entries.filter((e) => e.published !== null));
    if (library.data) setClauses(library.data.entries.filter((e) => e.published !== null));
    // After the letter, because it is the LETTER's client whose companies these
    // are. One more request, and only the page's first paint waits for it.
    // A draft deleted as a mistake (0086) will never be signed, so it has no
    // work to route and nothing to warn about.
    const unsigned =
      (one.data.letter.status === "draft" || one.data.letter.status === "sent") &&
      one.data.letter.deletedAt === null;
    const [structure, routed] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}/structure", {
        params: { path: { partyId: one.data.party.id } },
      }),
      // The owner rule's forecast for each Dept (T6.17). Only while the account
      // team can still change where the work goes: once signed, the work is
      // routed and its own page says whose it is.
      unsigned
        ? api.GET("/api/v1/engagement-letters/{letterId}/routing", { params: { path: { letterId } } })
        : Promise.resolve(null),
    ]);
    if (structure.data) setEntities(structure.data.entities);
    setRouting(routed?.data ?? null);
    // Read on `config:read`, so a caller who may not administer the firm still
    // sees whose signature will be on what they are drafting. A 403 leaves it
    // null, which reads the same as "nobody named" — the page says which.
    setStanding(signatory.data?.signatory ?? null);
    setError(null);
    setLoaded(true);
  }, [letterId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Run one call, show the API's refusal verbatim, reload on success — and
   *  say which, so a form closes only when what was typed in it was kept. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return false;
    }
    await load();
    setBusy(null);
    return true;
  }

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger" role="alert">
          {error ?? "No such engagement letter."}
        </Notice>
      </Page>
    );
  }

  const { letter, totals, lines, engagements, feeGroups } = record;
  const groupOf = (id: string | null) => feeGroups.find((g) => g.id === id) ?? null;
  // The catalogue version the picker is on, so the two boxes beside it can be
  // filled from it. Falls back to the FIRST option, because that is what a
  // `<select>` shows before anybody touches it.
  const pickedService = (() => {
    const entry = services.find((e) => e.published?.id === picked) ?? services[0];
    return entry === undefined ? null : readServiceBody(entry.published?.body);
  })();
  // A draft deleted as a mistake (0086) is still a draft by status, and FINAL:
  // nothing on this page may be offered for it, so it is not a draft here.
  const deleted = letter.deletedAt !== null;
  const isDraft = letter.status === "draft" && !deleted;
  const isSigned = letter.status === "signed";
  // HOW THIS LETTER IS SIGNED (0080). `sends` is the deployment's answer:
  // true means sending raises a DocuSign envelope, so the send form asks whom
  // to send it to and the client signs there, not on this page.
  const { signing } = record;
  const signatureRequest = signing.request;
  const providerName = signing.provider === "docusign" ? "DocuSign" : signing.provider;
  // The hand-recorded signature form is for a signature obtained ELSEWHERE —
  // on paper, or through a provider the firm drives itself. Under DocuSign the
  // sweep records it; the form stays only for a letter sent before envelopes
  // existed, which has no request and no other way to be signed.
  const recordsByHand = !signing.sends || signatureRequest === null;
  // The day it was SIGNED, where the reader is. `signed_at` is a
  // `timestamptz` and this feeds `begins()` beside `effective_from`, which is a
  // `date` — one printing path, so the instant becomes a day first. It was
  // `.slice(0, 10)`, which is the UTC day: yesterday in India for anything
  // signed after 05:30, which is most of a working morning.
  const signatureDay = letter.signedAt === null ? null : instantDay(letter.signedAt);
  // Clauses already on the letter, so the picker does not offer a duplicate —
  // the same term twice on one contract is a drafting error, and the API
  // refuses it anyway.
  const alreadyOn = new Set(record.clauses.map((c) => c.clauseVersionId));
  const available = clauses.filter((entry) => {
    const published = entry.published;
    if (published === null || alreadyOn.has(published.id)) return false;
    // Offer only what will work: a clause written for another jurisdiction is
    // refused by the API, and so is one naming another law or courts than the
    // ISSUER's (D6) — the same two rules, used to decide what to show.
    const body = readClauseBody(published.body);
    return clauseApplies(body, letter.jurisdiction) && lawFits(body, record.issuer.jurisdiction);
  });

  /**
   * When work begins, and WHERE that answer came from.
   *
   * The rule is two defaults deep — a line falls back to the letter, the letter
   * falls back to the signature date — and a blank cell would hide both. So the
   * page states the day AND its provenance: "1 Oct 2026, this line only" is a
   * different fact from "1 Oct 2026, with the letter", and on an unsigned
   * letter the honest answer is that the day is not decided yet.
   *
   * Nothing is computed that the API has already resolved: once the letter is
   * signed, each engagement carries its own stored `effectiveFrom` and that is
   * what the Engagements table below shows.
   */
  function begins(lineEffectiveFrom: string | null): { day: string | null; from: string } {
    if (lineEffectiveFrom !== null) return { day: lineEffectiveFrom, from: "this line only" };
    if (letter.effectiveFrom !== null) {
      return { day: letter.effectiveFrom, from: "with the letter" };
    }
    if (signatureDay !== null) return { day: signatureDay, from: "the signature date" };
    return { day: null, from: "the day it is signed" };
  }

  const letterBegins = begins(null);
  const letterBeginsNote = [
    letter.effectiveFrom === null && letterBegins.day !== null ? "the signature date" : null,
    lines.some((l) => l.effectiveFrom !== null) ? "some lines start later" : null,
  ]
    .filter((note): note is string => note !== null)
    .join(" · ");

  return (
    <Page>
      {/* The tab says what the caller is holding, for the same reason the header
          does. React hoists this into the document head. */}
      <title>{`${letter.ref} · ${letter.title}`}</title>

      {/* The reference goes in the eyebrow. This is the string a client reads
          down the phone; the uuid in the address bar is the system's name for
          the letter, not the firm's. */}
      <PageHeader
        eyebrow={<span className="mono">{letter.ref}</span>}
        title={letter.title}
        lede={
          <>
            {record.party.displayName} · issued by {record.issuingEntity.displayName} · country{" "}
            {letter.jurisdiction} ·{" "}
            <Pill tone={letter.status === "withdrawn" || deleted ? "danger" : "neutral"}>
              {deleted ? "deleted" : letter.status}
            </Pill>{" "}
            {/* WHICH DOCUMENT THE PDF IS (0083). Every letter drafted now is
                the firm's Annexure format; one issued before it re-renders in
                the classic layout it went out in, and says so. */}
            <Pill tone="neutral">
              {letter.layout === "annexure" ? "Annexure format" : "classic format"}
            </Pill>
          </>
        }
        /* This letter's own timeline, scoped to it. The sidebar's Audit trail
           is the whole firm's, so it is not a substitute. */
        actions={
          <div className="cluster">
            {isDraft && permissions.includes("party:write") && (
              <LinkButton size="sm" variant="primary" href={`/engagement-letters/${letterId}/build?step=preview` as Route}>
                Edit in the builder
              </LinkButton>
            )}
            <LinkButton size="sm" href={`/audit?type=engagement_letter&id=${letterId}`}>
              History
            </LinkButton>
          </div>
        }
      />

      <ErrorNotice error={error} />

      {letter.deletedAt !== null && (
        <DeletedNotice what="This draft" deletedAt={letter.deletedAt} deletedBy={record.deletedBy}>
          It never went out for signature. It is not on the list of letters, its number{" "}
          {letter.ref} is not used again, and nothing about it changes.
        </DeletedNotice>
      )}

      {/* WHAT DID NOT COME ACROSS, said on the page you land on.
          The quote screen warns before it carries, which is where the decision
          is; this is the other half, because a letter that dropped two of eight
          terms LOOKS complete — and the whole failure this carry-forward exists
          to prevent is a contract that reads as finished and is not. Carried in
          the URL rather than on the record: which lines were skipped is a fact
          about one act, not a property of the letter, and a letter opened next
          week has nothing to say about it. */}
      {carriedPartially && (
        <Notice tone="warn" eyebrow="Some lines did not carry">
          <p>
            This letter was written up from a quote, and not every line came across. Every line
            on a letter must name the company the work is for. Compare it against{" "}
            {letter.proposalId === null ? (
              "the quote"
            ) : (
              <Link href={`/proposals/${letter.proposalId}`}>the quote</Link>
            )}{" "}
            and add what is missing before you send it.
          </p>
        </Notice>
      )}

      {/* LINEAGE, both directions and by reference. A signed letter is never
          edited — it is replaced — and until this the instruction the model gave
          had nowhere to be recorded and nothing to follow. */}
      {(record.supersededBy !== null || record.supersedes !== null) && (
        <Card>
          {record.supersededBy !== null && (
            <p className={record.supersedes === null ? "" : "mb-2"}>
              <Pill tone="danger">superseded</Pill>{" "}
              Replaced by{" "}
              <Link className="mono" href={`/engagement-letters/${record.supersededBy.id}`}>
                {record.supersededBy.ref}
              </Link>
              . <span className="text-sm text-muted">This is no longer the agreement in force.</span>
            </p>
          )}
          {record.supersedes !== null && (
            <p>
              Replaces{" "}
              <Link className="mono" href={`/engagement-letters/${record.supersedes.id}`}>
                {record.supersedes.ref}
              </Link>
              . <span className="text-sm text-muted">That letter stays exactly as it was signed.</span>
            </p>
          )}
        </Card>
      )}

      {/* THE DOCUMENT — the half a client reads before the table of fees. */}
      <Card>
        <CardTitle level={2}>The document</CardTitle>
        {/* `<Meta>`, which is the product's ONE way of drawing label-and-value
            pairs — `/invoices/[invoiceId]`, `/work-items/[workItemId]` and
            `/catalogue` all read their record this way and this screen had
            invented a second, out of `.field-row` (a FORM primitive) and four
            `<p className="label">`. Two of its three inline styles were
            no-ops besides: `.field-row` already sets `align-items: start`. */}
        {/* The gap is on a WRAPPER, not on `<Meta className="mb-6">`, which is
            what this was first written as and which silently did nothing:
            `.meta` is unlayered and sets `margin: 0`, and every utility is in
            `@layer utilities`. Measured on the page — `margin-bottom: 0px` —
            and the Background heading came up to sit 11px under the record.
            The rule is per PROPERTY, though: `justify-self` on a `.btn` further
            down this screen DOES land, because `.btn` never declares it. */}
        <div className="mb-6">
          <Meta>
          {/* A named PERSON, care-of the client — not who is BILLED, which is
              the client and is unchanged. Until the letter could store an
              individual there was no individual to address. */}
          <MetaItem label="Addressed to">
            {record.addressedTo === null ? (
              <span className="text-sm text-muted">
                {record.party.displayName} (no individual named)
              </span>
            ) : (
              <>
                {record.addressedTo.displayName}
                <span className="mt-0.5 block text-md text-muted">
                  care of {record.party.displayName}
                </span>
              </>
            )}
          </MetaItem>
          {/* WHICH of the firm's own entities is contracting. The jurisdiction
              says WHERE the work is; this says WHO on our side is bound by it,
              and the two are not the same question. */}
          <MetaItem label="Issued by">
            {record.issuingEntity.displayName}
            <span className="mt-0.5 block text-md text-muted">
              under {letter.jurisdiction} law
            </span>
          </MetaItem>
          {/* The document's OWN date, distinct from when this system
              transmitted it. Null defaults to the day it is sent, so the page
              says which of the two it is showing. */}
          <MetaItem label="Dated">
            {letter.issuedOn !== null ? (
              longDay(letter.issuedOn)
            ) : letter.sentAt === null ? (
              <span className="text-sm text-muted">the day it is sent</span>
            ) : (
              <>
                {longInstant(letter.sentAt)}
                <span className="mt-0.5 block text-md text-muted">the day it was sent</span>
              </>
            )}
          </MetaItem>
          <MetaItem label="Work begins">
            {/* A day by the time it reaches here — `effective_from` straight
                from the API, or the signature instant already turned into one
                — so it prints with `longDay`, which SPLITS. */}
            {letterBegins.day === null ? (
              <span className="text-sm text-muted">on the day it is signed</span>
            ) : (
              longDay(letterBegins.day)
            )}
            {letterBeginsNote !== "" && (
              <span className="mt-0.5 block text-md text-muted">{letterBeginsNote}</span>
            )}
          </MetaItem>
          </Meta>
        </div>
        <h3 className="eyebrow">Background</h3>
        {letter.background === null ? (
          <p className="text-md text-muted">
            None written. The letter opens straight with the services. This cannot be changed
            after the letter is sent.
          </p>
        ) : (
          // Prose, as prose: this is the paragraph the client reads first, and
          // it is a TERM — inside the canonical content the signature commits
          // to, not presentation around it.
          <p className="whitespace-pre-wrap">{letter.background}</p>
        )}
      </Card>

      {isSigned && (
        <Card>
          <CardTitle level={2}>Signed</CardTitle>
          {/* NOT `<Meta>`, unlike the record above, and the reason is the
              labels: these are company NAMES, and `.meta dt` is 10px uppercase
              mono. "FOR COBALT FOODS PRIVATE LIMITED" shouted over a signature
              block is worse than the sentence-case caption. The inline
              `align-items` that used to be here was a no-op — `.field-row`
              already sets `align-items: start`. */}
          <div className="field-row">
            {/* The CLIENT's half. */}
            <div>
              <p className="label" style={{ marginBottom: 2 }}>
                For {record.party.displayName}
              </p>
              <p>{letter.signedByName}</p>
              <p className="text-md text-muted">
                {letter.signedByTitle ?? "capacity not recorded"}
              </p>
              <p className="text-md text-muted">
                {signatureDay === null ? "" : longDay(signatureDay)} ·{" "}
                {letter.signatureMethod}
                {letter.signatureReference !== null && ` · ref ${letter.signatureReference}`}
              </p>
            </div>
            {/* The FIRM's half — the "Yours sincerely, …, Director" that was
                never modelled, so the block rendered as a blank line. It is a
                SNAPSHOT taken at send: naming a successor next year must not
                restate who signed a letter in 2026. */}
            <div>
              <p className="label" style={{ marginBottom: 2 }}>
                For {record.issuingEntity.displayName}
              </p>
              {record.firmSignatory === null ? (
                <p className="text-md text-muted">
                  No signature block. The firm had not named a signatory when this letter went out.
                </p>
              ) : (
                <>
                  <p>
                    {record.firmSignatory.displayName ?? (
                      // The name is a read-time join; the title is what the
                      // document said. An erased account stops resolving, and
                      // that is the record being right rather than a bug.
                      <span className="text-sm text-muted">name no longer on record</span>
                    )}
                  </p>
                  <p className="text-md text-muted">
                    {record.firmSignatory.title}
                  </p>
                  <p className="text-md text-muted">
                    {longInstant(record.firmSignatory.signedAt)}
                  </p>
                </>
              )}
            </div>
          </div>
          {/* The fingerprint of exactly what was signed. On the page because
              verifying it should not need a database session — recompute the
              canonical rendering and compare. */}
          <p className="mono break-all text-xs text-muted">{letter.signedContentHash}</p>
          <p className="text-sm text-muted">
            This letter can no longer be changed. To change the terms, draft a new letter that
            replaces this one.
          </p>
        </Card>
      )}

      {/* THE SECTIONS OF ANNEXURE 1, and the fee each one charges (0083).
          Before the services, because a service is put INTO a section. */}
      {(letter.layout === "annexure" || feeGroups.length > 0) && (
        <FeeGroups
          letterId={letterId}
          groups={feeGroups}
          lines={lines}
          editable={isDraft && permissions.includes("party:write")}
          busy={busy}
          act={act}
        />
      )}

      <Card>
        <CardTitle level={2}>Services</CardTitle>
        <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th>Begins</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Net</Th>
              {isDraft && <Th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const start = begins(l.effectiveFrom);
              return (
                <tr key={l.id}>
                  <Td>
                    <div>{l.description}</div>
                    {/* WHOSE entity the work is for. One line per group company
                        is the whole reason a letter has more than one. */}
                    {l.entity !== null && <div className="text-sm text-muted">{l.entity.displayName}</div>}
                    {l.service !== null && (
                      <div className="mono text-muted">
                        {l.service.key}@{l.service.version}
                      </div>
                    )}
                    {/* WHAT THE LETTER PRINTS FOR IT — the four blocks as
                        RESOLVED, this letter's wording where it tailored one
                        and the catalogue's where it did not. Closed, because
                        it is long, and here because until now nothing on this
                        page showed the scope the client is agreeing to. */}
                    {(["scope", "clientObligations", "volumeLimits", "exclusions"] as const).some(
                      (k) => l.terms[k].text !== null,
                    ) && (
                      <details className="text-sm">
                        <summary>What it covers</summary>
                        {(
                          [
                            ["scope", "Scope"],
                            ["clientObligations", "Client's responsibilities"],
                            ["volumeLimits", "Volume limits"],
                            ["exclusions", "Exclusions"],
                          ] as const
                        ).map(([k, label]) => {
                          const term = l.terms[k];
                          return term.text === null ? null : (
                            <div key={k} className="mt-1">
                              <div className="label">
                                {label}
                                {term.tailored && " · written for this letter"}
                              </div>
                              <p className="whitespace-pre-wrap">{term.text}</p>
                            </div>
                          );
                        })}
                      </details>
                    )}
                  </Td>
                  <Td>
                    {start.day === null ? (
                      <span className="text-sm text-muted">on signature</span>
                    ) : (
                      longDay(start.day)
                    )}
                    <div className="text-xs text-muted">
                      {start.from}
                    </div>
                  </Td>
                  <Td align="right" className="mono">
                    {formatCount(l.quantity)}
                  </Td>
                  {l.feeGroupId !== null ? (
                    // PRICED BY ITS SECTION (0083): no figure of its own to
                    // show, and a blank would read as free.
                    <Td align="right" colSpan={2} className="text-sm text-muted">
                      in {groupOf(l.feeGroupId)?.code ?? "a section"}
                      {(() => {
                        const g = groupOf(l.feeGroupId);
                        return g === null ? "" : ` · ${groupFee(g)}`;
                      })()}
                    </Td>
                  ) : (
                    <>
                      <Td align="right" className="mono">
                        {formatMoney(l.unitAmount, l.currency)}
                      </Td>
                      <Td align="right" className="mono">
                        {formatMoney(l.net, l.currency)}
                      </Td>
                    </>
                  )}
                  {isDraft && (
                    <Td align="right">
                      {permissions.includes("party:write") && (
                        <LineFee
                          letterId={letterId}
                          line={l}
                          groups={feeGroups}
                          currency={letter.currency}
                          busy={busy}
                          act={act}
                        />
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        /* Named by the LINE. Six buttons reading "Remove" is
                           one name, and the one duplicate on this screen that
                           destroys work. */
                        aria-label={`Remove ${l.description} from this letter`}
                        disabled={busy !== null}
                        onClick={() => {
                          void act(l.id, () =>
                            api.DELETE("/api/v1/engagement-letters/{letterId}/lines/{lineId}", {
                              params: { path: { letterId, lineId: l.id } },
                            }),
                          );
                        }}
                      >
                        Remove
                      </Button>
                    </Td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <Td colSpan={6} className="text-sm text-muted">
                  No services on this letter yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableWrap>
        <div className="mt-4 text-right">
          {/* PER FREQUENCY (D8), never one mixed net: a monthly fee and a
              one-time fee added together is a number nobody is billed. Summed
              by the database, a section's fee once at its own frequency. */}
          <div className="mono text-lg">
            {(() => {
              const { withheld, sentence } = totalWords(record.totalsByFrequency, totals.currency);
              if (withheld) return <span className="text-muted">Fees not shown to you</span>;
              return sentence ?? <span className="text-muted">No fixed fee yet</span>;
            })()}
          </div>
          {letter.advanceRequired && (
            <div className="text-md text-muted">
              advance {formatMoney(letter.advanceAmount, totals.currency)}
              {letter.advanceRecordedAt === null
                ? " · outstanding"
                : ` · recorded ${longInstant(letter.advanceRecordedAt)}`}
            </div>
          )}
        </div>
      </Card>

      {/* ── The letter's own prose ─────────────────────────────────────
          Not clauses. A clause is a term of the contract, drawn from a versioned
          library and pinned; these are the document's own exclusions, commercial
          notes and team block — COPIED from the firm's standard set when the
          letter was drafted, and this letter's from then on. Editing the
          standard set changes the next letter and never this one. */}
      {/* THE PROSE IS EDITABLE UNTIL IT IS SIGNED, and the database is what
          says so: `crm.refuse_signed_child_change()` fires on this table too,
          resolving its parent from `engagement_letter_id`. The exclusions a
          client agreed to are part of what they agreed to. */}
      <DocumentBlocks
        blocks={record.blocks}
        owner={{ engagementLetterId: letterId }}
        /* The cover letter and the acceptance print only in the Annexure
           layout; a classic letter carries the three it always did. */
        kinds={LETTER_BLOCK_KINDS.filter(
          (k) => letter.layout === "annexure" || !PARAGRAPH_BLOCK_KINDS.includes(k),
        )}
        canWrite={permissions.includes("party:write")}
        /* And a draft deleted as a mistake is as final as a signed letter
           (0086, 0087) — the database refuses its prose too, by name. */
        editable={!isSigned && !deleted}
        frozenNote={
          deleted
            ? "This draft was deleted as made by mistake, so its wording no longer changes."
            : "This letter is signed, so its wording can no longer be changed. Different wording means a new letter."
        }
        onChanged={load}
      />

      <Card>
        <CardTitle level={2}>Terms</CardTitle>
        {record.clauses.length === 0 ? (
          <p className="text-sm text-muted">
            None yet. A letter cannot be sent without terms. Add them below.
          </p>
        ) : (
          record.clauses.map((c) => (
            <div key={c.id} className="mb-4">
              <div className="text-md strong">
                {c.title}{" "}
                {/* The version that was PINNED. On a signed letter this is the
                    wording the client agreed to, not today's. */}
                <span className="mono annot">
                  {c.key}@{c.version}
                </span>
              </div>
              <div className="text-md">{c.text}</div>
              {/* WHOSE LAW, structured. The prose above prints it; these are the
                  comparable halves, and the API refuses a clause whose law is
                  not the ISSUING ENTITY's — the exact mistake the firm caught
                  when a US-issued letter named Indian law and Delhi courts.
                  Shown so a reader can see the letter is internally consistent,
                  rather than trusting that it is. */}
              {(c.governingLaw !== null || c.courts !== null) && (
                <div className="mt-1 text-sm text-muted">
                  {c.governingLaw !== null && (
                    <span>
                      Governed by {c.governingLaw.text}{" "}
                      <span className="pill" data-tone="code">
                        {c.governingLaw.jurisdiction}
                      </span>
                    </span>
                  )}
                  {c.governingLaw !== null && c.courts !== null && " · "}
                  {c.courts !== null && (
                    <span>
                      Heard by {c.courts.text}{" "}
                      <span className="pill" data-tone="code">{c.courts.jurisdiction}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* EVERY STANDARD TERM IN ONE PRESS (T6.18, D6): the API runs each
            published clause through the same rules as adding one by hand, so
            a term naming another country's law or courts than the issuer's is
            left off, with the refusal's own sentence. Ten terms were ten
            presses of Add. */}
        {isDraft && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="cluster">
              <Button
                variant="secondary"
                loading={busy === "standard-terms"}
                disabled={busy !== null}
                onClick={() => {
                  setStandardTerms(null);
                  void act("standard-terms", async () => {
                    const result = await api.POST("/api/v1/engagement-letters/{letterId}/clauses/standard", {
                      params: { path: { letterId } },
                    });
                    if (result.data) setStandardTerms(result.data);
                    return result;
                  });
                }}
              >
                Add all standard terms for {record.issuingEntity.displayName}
              </Button>
            </div>
            <p className="text-sm text-muted">
              Every published term for {letter.jurisdiction} whose law and courts are{" "}
              {record.issuingEntity.displayName}&apos;s. A term naming another country&apos;s law is
              left off, and the list below says why.
            </p>
            {standardTerms !== null && (
              <Notice tone={standardTerms.added.length > 0 ? "ok" : "info"} role="status">
                <div>
                  <p>
                    {standardTerms.added.length === 0
                      ? "No term was added."
                      : `Added ${String(standardTerms.added.length)}: ${standardTerms.added.map((a) => a.title).join(", ")}.`}
                  </p>
                  {standardTerms.skipped.length > 0 && (
                    <ul className="mt-1 text-sm">
                      {standardTerms.skipped.map((s) => {
                        const entry = clauses.find((c) => c.entry.key === s.clauseKey);
                        const title =
                          entry?.published === null || entry === undefined
                            ? s.clauseKey
                            : readClauseBody(entry.published.body).title || s.clauseKey;
                        return (
                          <li key={s.clauseKey}>
                            Left off {title}: {s.reason}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Notice>
            )}
          </div>
        )}

        {isDraft && (
          <form
            className="mt-4"
            action={(form) => {
              void act("clause", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/clauses", {
                  params: { path: { letterId } },
                  body: { clauseVersionId: String(form.get("clauseVersionId")) },
                }),
              );
            }}
          >
            <div className="field-row">
              <Field
                label="Add a term"
                hint={
                  available.length === 0
                    ? `Every published clause for ${letter.jurisdiction} is already on this letter. Write and publish another in the catalogue.`
                    : undefined
                }
              >
                <Select name="clauseVersionId" required disabled={available.length === 0}>
                  {available.map((entry) => {
                    const body = readClauseBody(entry.published?.body);
                    return (
                      <option key={entry.entry.id} value={entry.published?.id}>
                        {body.title || entry.entry.key}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <div>
                <Button
                  type="submit"
                  className="justify-self-start"
                  disabled={busy !== null || available.length === 0}
                >
                  Add
                </Button>
              </div>
            </div>
          </form>
        )}
      </Card>

      {isDraft && (
        <Card>
          <CardTitle level={2}>Agree a service</CardTitle>
          <form
            action={(form) => {
              const effectiveFrom = String(form.get("effectiveFrom") ?? "").trim();
              // Only the tailored blocks somebody actually wrote. An empty box
              // means "print the catalogue's words", and the API refuses a
              // blank override outright.
              const tailored = Object.fromEntries(
                (
                  [
                    "scopeOverride",
                    "clientObligationsOverride",
                    "volumeLimitsOverride",
                    "exclusionsOverride",
                  ] as const
                )
                  .map((k) => [k, String(form.get(k) ?? "").trim()] as const)
                  .filter(([, v]) => v !== ""),
              );
              void act("line", () =>
                api.POST("/api/v1/engagement-letters/{letterId}/lines", {
                  params: { path: { letterId } },
                  body: {
                    entityPartyId: String(form.get("entityPartyId")),
                    serviceVersionId: String(form.get("serviceVersionId")),
                    description: String(form.get("description")),
                    quantity: String(form.get("quantity")),
                    // IN A SECTION it has no price of its own (0083): the
                    // section's fee pays for it, so neither box is sent.
                    ...(addFee === ""
                      ? {
                          unitAmount: String(form.get("unitAmount")),
                          discountPercent: String(form.get("discountPercent")),
                        }
                      : { feeGroupId: addFee, discountPercent: "0" }),
                    // Sent only when the drafter set one. Absent means "whatever
                    // the letter says", which is a different fact from a date
                    // that happens to match it.
                    ...(effectiveFrom === "" ? {} : { effectiveFrom }),
                    ...tailored,
                  },
                }),
              );
            }}
          >
            {/* `<Field>` throughout, which is what wires a label to its
                control and points `aria-describedby` at the hint. Hand-rolled,
                every one of these had a HARDCODED id — `description`,
                `quantity`, `reference` — the shape that put the cursor in the
                wrong card on /admin/workflows the moment a second form opened.
                `Field` generates one with `useId`. And the sentence under
                "Begins" was a loose paragraph beside the control it explains:
                measured, this form described 0 of its 7. */}
            <div className="field-row mb-4">
              <Field
                label="For which company"
                hint={`${record.party.displayName} and the companies its client page records under it. A company missing here needs that link recorded first.`}
              >
                {/* UNCHOSEN, for the same reason as the party selects on the
                    list screens: this one opened on "10x Global", so a line
                    added without touching it was delivered to the firm. */}
                <Select name="entityPartyId" required>
                  <option value="">Choose the company…</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              {/* IT FILLS THE TWO BOXES BESIDE IT NOW, and it says the price
                  in the option so the choice can be checked before it is made.
                  Walked: picking a service left both the wording and the price
                  empty, so the catalogue's own figure was typed in by hand —
                  and the price is exactly what a catalogue exists to stop
                  somebody mistyping. Prefilled and EDITABLE: what a client
                  agreed is routinely not the list price, which is why the line
                  keeps its own copy of both. */}
              <Field
                label="From the catalogue"
                hint="Fills in the wording and the list price below. You can change either. The letter records what this client agreed."
              >
                <Select
                  name="serviceVersionId"
                  required
                  value={picked}
                  onChange={(e) => {
                    setPicked(e.target.value);
                  }}
                >
                  {services.map((entry) => {
                    const body = readServiceBody(entry.published?.body);
                    return (
                      <option key={entry.entry.id} value={entry.published?.id}>
                        {body.name || entry.entry.key}
                        {body.listPrice !== null &&
                          ` (${formatMoney(body.listPrice.amount, body.listPrice.currency)})`}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <Field label="As it reads on the letter">
                {/* KEYED ON THE PICK: `defaultValue` is read once at mount, so
                    without this a second choice leaves the first one's wording
                    in the box. */}
                <Input
                  key={`d-${picked}`}
                  name="description"
                  defaultValue={pickedService?.name ?? ""}
                  required
                />
              </Field>
            </div>
            {feeGroups.length > 0 && (
              <div className="field-row mb-4">
                <Field
                  label="Its fee"
                  hint="In a section, the section's fee pays for it and it has no price of its own."
                >
                  <Select
                    name="feeGroupId"
                    value={addFee}
                    onChange={(e) => {
                      setAddFee(e.target.value);
                    }}
                  >
                    <option value="">Priced on its own</option>
                    {feeGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        In {g.code} · {g.title} ({groupFee(g)})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <div className="field-row mb-4">
              <Field label="Quantity">
                <Input name="quantity" defaultValue="1" required />
              </Field>
              {addFee === "" && (
              <Field label={`Agreed price (${letter.currency})`}>
                {/* THE LIST PRICE ONLY IN THIS LETTER'S OWN CURRENCY. A
                    catalogue priced in USD on a rupee letter would put the
                    number in the box with the wrong currency beside it, which
                    is worse than an empty field: one is obviously unanswered,
                    the other is quietly wrong on a document somebody signs. */}
                <Input
                  key={`u-${picked}`}
                  name="unitAmount"
                  defaultValue={
                    pickedService?.listPrice !== null &&
                    pickedService?.listPrice !== undefined &&
                    pickedService.listPrice.currency === letter.currency
                      ? pickedService.listPrice.amount
                      : ""
                  }
                  required
                />
              </Field>
              )}
              {addFee === "" && (
              <Field label="Discount %">
                <Input name="discountPercent" defaultValue="0" required />
              </Field>
              )}
              {/* Per line as well as per document, because per line can express
                  a single shared date and the reverse cannot: an Incorporation
                  line starts the day it is signed while the GST line beside it
                  starts next period. */}
              <Field label="Begins" hint="Leave blank to start with the letter.">
                <Input name="effectiveFrom" type="date" />
              </Field>
            </div>
            {/* THIS LETTER'S OWN WORDING for the service (G1.6), which the
                screen could not write until the Annexure letter printed it.
                Empty boxes print the catalogue's words — shown as each box's
                placeholder, so a drafter can see what they would be replacing. */}
            <details className="mb-4">
              <summary>Tailor the wording for this letter</summary>
              <div className="field-row mt-2">
                <Field label="Scope" optional>
                  <Textarea
                    key={`s-${picked}`}
                    name="scopeOverride"
                    rows={4}
                    placeholder={pickedService?.scope ?? "The catalogue states none."}
                  />
                </Field>
                <Field label="Client's responsibilities" optional>
                  <Textarea
                    key={`c-${picked}`}
                    name="clientObligationsOverride"
                    rows={4}
                    placeholder={pickedService?.clientObligations ?? "The catalogue states none."}
                  />
                </Field>
              </div>
              <div className="field-row mt-2">
                <Field label="Volume limits" optional>
                  <Textarea
                    key={`v-${picked}`}
                    name="volumeLimitsOverride"
                    rows={2}
                    placeholder={pickedService?.volumeLimits ?? "The catalogue states none."}
                  />
                </Field>
                <Field label="Exclusions" optional>
                  <Textarea
                    key={`e-${picked}`}
                    name="exclusionsOverride"
                    rows={2}
                    placeholder={pickedService?.exclusions ?? "The catalogue states none."}
                  />
                </Field>
              </div>
            </details>
            <div className="cluster">
              <Button type="submit" disabled={busy !== null}>
                Add line
              </Button>
            </div>
          </form>
        </Card>
      )}

      {engagements.length > 0 && (
        <Card>
          <CardTitle level={2}>Engagements</CardTitle>
          <p className="text-md text-muted">
            One engagement per service line, created when the letter was signed. Work and
            filings are scheduled from these. Each starts on its line’s date, else the letter’s
            date, else the day of signature.
          </p>
          <TableWrap>
        <Table>
            <tbody>
              {engagements.map((e) => (
                <tr key={e.id}>
                  <Td>
                    {lines.find((l) => l.id === e.engagementLetterLineId)?.description ??
                      e.engagementLetterLineId}
                  </Td>
                  <Td>
                    {/* `state`, not `status`: the stored status is the
                        COMMERCIAL gate, and `pending_start` is the calendar
                        narrowing it. An engagement that begins in October is
                        agreed, paid for and not started. */}
                    <span
                      className="pill"
                      /* `undefined`, not `""`. An empty attribute is still an
                         attribute; `data-tone=""` matches no rule and reads in
                         the DOM as a tone that was set to nothing. */
                      data-tone={
                        e.status === "pending_advance" || e.status === "cancelled"
                          ? "danger"
                          : undefined
                      }
                    >
                      {e.state.replace("_", " ")}
                    </span>
                  </Td>
                  <Td className="text-sm text-muted">from {longDay(e.effectiveFrom)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        </Card>
      )}

      {/* Nothing stands, and nothing is sent, for a draft deleted as a mistake. */}
      {!deleted && (
        <Card>
          <CardTitle level={2}>
            {isDraft ? "Send it" : "Where it stands"}
          </CardTitle>

          {isDraft && (
            // Whose name will be under "Yours sincerely" — read from the firm's
            // standing signatory, because the letter has none until it is sent.
            <p className="text-md text-muted">
              {standing === null
                ? "The firm has not named a signatory, so this letter goes out with the firm's half of the signature block blank. Name one under The firm itself."
                : `When sent, this letter carries the firm's signature block as it is now: ${
                    standing.displayName ?? "the named account"
                  }, ${standing.title}. Changing the signatory later does not change this letter.`}
            </p>
          )}

          {(isDraft || letter.status === "sent") && routing !== null && (
            <RoutingWarning routing={routing} client={record.party} />
          )}

          {isDraft && signing.sends && (
            // WHOM DOCUSIGN SHOULD ASK. The client's signatory, by name and
            // address; DocuSign emails them the letter and they sign there. The
            // name starts as the addressee's because that is usually who signs,
            // and it stays editable because it often is not.
            <form
              className="mt-2"
              action={(form) => {
                void act("send", () =>
                  api.POST("/api/v1/engagement-letters/{letterId}/send", {
                    params: { path: { letterId } },
                    body: {
                      signer: {
                        name: String(form.get("signerName") ?? "").trim(),
                        email: String(form.get("signerEmail") ?? "").trim(),
                      },
                    },
                  }),
                );
              }}
            >
              <p className="text-md text-muted">
                {providerName} will email the letter to the person below, and they sign it there. It
                is recorded here as signed a few minutes after they finish.
              </p>
              <div className="field-row">
                <Field label="Who signs for the client">
                  <Input
                    name="signerName"
                    required
                    defaultValue={record.addressedTo?.displayName ?? ""}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Their email address">
                  <Input name="signerEmail" type="email" required autoComplete="off" />
                </Field>
                {/* `self-end` puts the button on the inputs' line rather than
                    the labels': neither field carries a hint, so the bottoms of
                    the three cells are the same line. */}
                <div className="self-end">
                  <Button type="submit" className="justify-self-start" disabled={busy !== null}>
                    Send for signature
                  </Button>
                </div>
              </div>
            </form>
          )}

          {letter.status === "sent" && signing.sends && signatureRequest !== null && (
            signatureRequest.envelopeId === null ? (
              // THE SEND HAPPENED AND THE ENVELOPE DID NOT. The terms are frozen
              // and the letter is dated either way; what failed is DocuSign, in
              // its own words, and trying again is one button.
              <Notice
                tone="warn"
                role="alert"
                actions={
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      void act("retry", () =>
                        api.POST("/api/v1/engagement-letters/{letterId}/signature-request", {
                          params: { path: { letterId } },
                        }),
                      );
                    }}
                  >
                    Try again
                  </Button>
                }
              >
                {providerName} has not sent this letter to {signatureRequest.signerName} (
                {signatureRequest.signerEmail}) yet.
                {signatureRequest.lastFailure !== null && (
                  <> {providerName} said: {signatureRequest.lastFailure}</>
                )}
              </Notice>
            ) : (
              <Notice tone="info" role="status">
                Out for signature with {providerName}. Sent to {signatureRequest.signerName} (
                {signatureRequest.signerEmail})
                {signatureRequest.raisedAt !== null && <> on {longInstant(signatureRequest.raisedAt)}</>}
                . This page shows it as signed within a few minutes of them finishing. Withdrawing
                also cancels the envelope.{" "}
                <span className="mono text-xs">{signatureRequest.envelopeId}</span>
              </Notice>
            )
          )}

          {/* Both of the inline styles that used to be here were no-ops:
              `.cluster` already sets `flex-wrap: wrap` and no margin at all —
              which is why `mt-3` is here: under DocuSign a form or a notice
              now sits directly above this row. */}
          <div className="cluster mt-3">
            {isDraft && !signing.sends && (
              <Button
                disabled={busy !== null}
                onClick={() => {
                  void act("send", () =>
                    api.POST("/api/v1/engagement-letters/{letterId}/send", {
                      params: { path: { letterId } },
                    }),
                  );
                }}
              >
                Send for signature
              </Button>
            )}
            {/* A letter the client has SEEN is withdrawn, which keeps the record
                that it was offered. A draft nobody has seen is deleted instead,
                at the foot of the page (0086) — so Withdraw is for `sent` only. */}
            {letter.status === "sent" && (
              <Button
                variant="destructive-quiet"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  void act("withdraw", () =>
                    api.POST("/api/v1/engagement-letters/{letterId}/withdraw", {
                      params: { path: { letterId } },
                    }),
                  );
                }}
              >
                Withdraw
              </Button>
            )}
            {letter.advanceRequired && isSigned && letter.advanceRecordedAt === null && (
              <Button
                disabled={busy !== null}
                onClick={() => {
                  void act("advance", () =>
                    api.POST("/api/v1/engagement-letters/{letterId}/advance", {
                      params: { path: { letterId } },
                    }),
                  );
                }}
              >
                Record the advance
              </Button>
            )}
          </div>

          {letter.status === "sent" && recordsByHand && (
            <form
              className="mt-4"
              action={(form) => {
                const signedByTitle = String(form.get("signedByTitle") ?? "").trim();
                void act("sign", () =>
                  api.POST("/api/v1/engagement-letters/{letterId}/signature", {
                    params: { path: { letterId } },
                    body: {
                      signedByName: String(form.get("signedByName")),
                      reference: String(form.get("reference") ?? ""),
                      // The capacity they signed in — optional, because it is not
                      // always known when a wet signature is attested afterwards,
                      // and a letter recorded without it is still verifiable.
                      ...(signedByTitle === "" ? {} : { signedByTitle }),
                    },
                  }),
                );
              }}
            >
              <p className="text-md text-muted">
                {/* Said plainly, because the audit trail will say it too: this
                    records an attestation by somebody at the firm, not a
                    cryptographic signature. */}
                Record here that the client has signed, on paper or through an e-signing provider
                the firm already uses. The audit trail records who confirmed it.
              </p>
              <div className="field-row">
                <Field label="Who signed">
                  <Input name="signedByName" required />
                </Field>
                <Field label="In what capacity" optional>
                  <Input name="signedByTitle" placeholder="Director" />
                </Field>
                <Field label="Reference" hint="The firm’s own note of where the paper is.">
                  <Input name="reference" placeholder="paper-001" />
                </Field>
                <div>
                  {/* `justify-self`, and it is the grid property that matters:
                      `.field-row` is a `minmax(12rem, 1fr)` GRID, so a bare
                      button in a cell stretches the whole column. `.btn` never
                      declares `justify-self`, so the utility beside it lands. */}
                  <Button type="submit" className="justify-self-start" disabled={busy !== null}>
                    Record the signature
                  </Button>
                </div>
              </div>
            </form>
          )}

          {letter.status === "withdrawn" && (
            <p className="text-md text-muted">
              This letter was withdrawn on{" "}
              {letter.withdrawnAt === null ? "an unrecorded date" : longInstant(letter.withdrawnAt)}
              {signatureRequest?.outcome === "declined" &&
                `, because ${signatureRequest.signerName} declined to sign it in ${providerName}`}
              . It stays on record as withdrawn.
            </p>
          )}
        </Card>
      )}
      {/* The letter's own paperwork. THE signed copy belongs here: the API
          stores a content hash per version, and `crm.engagement_letter` carries
          one too — which is what makes "is the PDF the client holds the one we
          issued" a comparison rather than a matter of trust. */}
      <Documents
        subjectKind="engagement_letter"
        subjectRef={letterId}
        // A deleted draft gains nothing (0086): its files stay readable.
        canWrite={permissions.includes("party:write") && !deleted}
        renderable="engagement_letter"
        emptyHint="Nothing attached yet. Upload the signed copy of this letter here."
      />

      <DeleteMistake
        title="Made by mistake?"
        intro={
          <p className="muted">
            A draft that should never have been started can be deleted. Nobody outside the firm has
            seen it. A letter that has gone to the client is withdrawn instead.
          </p>
        }
        label="Delete this draft"
        consequence={
          <>
            <p>
              {letter.ref} leaves the list of letters, and its number is not used again. Its files
              stay where they are.
            </p>
            <p>
              The page stays readable from its link, and the audit trail records that you deleted
              it. This cannot be undone.
            </p>
          </>
        }
        name={letter.ref}
        refusal={record.deleteRefusal}
        explained={[]}
        canWrite={permissions.includes("party:write")}
        onDelete={async () => {
          setError(null);
          const result = await api.DELETE("/api/v1/engagement-letters/{letterId}", {
            params: { path: { letterId } },
          });
          if (result.error) {
            setError(apiError(result.error).message);
            return false;
          }
          await load();
          return true;
        }}
      />
    </Page>
  );
}
