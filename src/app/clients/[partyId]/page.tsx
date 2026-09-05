"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import { api, apiError } from "@/lib/api/client";
import type {
  ConfigEntry,
  IdentifierType,
  PartyProfile,
  PartyRelationship,
  PartySummary,
  RelationshipType,
} from "@/lib/api/client";
import { AccountTeamPanel } from "./account-team";
import { PortalContactsPanel } from "./portal-contacts";
import { ChasingPanel } from "./chasing";
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";
import { browserDay, longDay } from "@/lib/day";
import { groupCompanies } from "@/lib/group";

/**
 * Party 360 — everything the firm knows about one counterparty.
 *
 * The identifiers are the interesting half. A PAN, a GSTIN, a CIN: the API
 * validates each against its own format and normalises it before storing, so a
 * mistyped PAN is refused here with a message that says which one and why. This
 * screen does not reimplement any of that; it shows the refusal.
 *
 * Identifiers are also what makes lead capture deduplicate — the same company
 * arriving twice by two routes resolves to this one party rather than becoming
 * two.
 */
export default function PartyPage() {
  const router = useRouter();
  const params = useParams<{ partyId: string }>();
  const partyId = params.partyId;

  const [profile, setProfile] = useState<PartyProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // What to OFFER, never what is allowed.
  const [permissions, setPermissions] = useState<string[]>([]);
  // Two fields on the Register form share one explanation, so the paragraph
  // stays outside them and they point at it. A hook, so it lives up here with
  // the others and not after an early return.
  const registerHintId = useId();
  /**
   * The two lists the Relationships card needs, and neither is about this
   * party.
   *
   * `types` is the product's own vocabulary — six codes and the English each
   * one reads as. `parties` is the firm's book, for the other end of a new
   * relationship. Both are loaded once with the profile rather than when the
   * form opens: the card BELOW them renders the existing relationships as
   * sentences, and a vocabulary that arrived only when somebody pressed a
   * button would leave the table printing `parent_of` until they did.
   */
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [parties, setParties] = useState<PartySummary[]>([]);
  /** Which party the new relationship is with. Controlled, because the
   *  sentences offered beneath it NAME it — see `RecordRelationship`. */
  const [relOther, setRelOther] = useState("");
  /** Its OWN busy flag. Three forms on this page already share `busy`, so a
   *  fourth joining them would put every submit button on the screen into a
   *  loading state whenever any one of them saved. */
  const [relBusy, setRelBusy] = useState(false);
  /**
   * Which relationship is being CLOSED, if any — one panel for the whole table.
   *
   * A date field and a confirm button per open row would be N forms sharing two
   * names, and the row's own button already says which relationship it is
   * about. The panel names it again in a sentence, because a reader who has
   * scrolled past the table needs to know what they are about to end.
   */
  const [ending, setEnding] = useState<PartyRelationship | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  /** The refusal lives IN the panel. This page is 3,000px long and its one
   *  error notice is at the top of it, so a refusal about a date typed at the
   *  bottom would render where the reader cannot see it happen. */
  const [endError, setEndError] = useState<string | null>(null);
  const [endErrorAt, setEndErrorAt] = useState(0);
  const endErrorRef = useRef<HTMLDivElement>(null);
  const endPanelRef = useRef<HTMLDivElement>(null);
  /** The button that opened the panel, so Cancel gives focus back to it rather
   *  than dropping it on `<body>` when the panel unmounts. */
  const endTriggerRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus goes when the row that held the trigger is gone — which is
   *  what SUCCESS looks like here: the relationship is closed, so the button
   *  that opened the panel no longer exists. */
  const relCardRef = useRef<HTMLHeadingElement>(null);
  /**
   * The firm's published reminder cadence, for the chasing panel's lede.
   *
   * Read here rather than in the panel because it is one request for the whole
   * page and because it is the FIRM's setting, not this client's — the panel
   * takes it as a fact and says what it says. Empty is a real answer: with no
   * published ladder the sweep chases nobody, and a freeze would change
   * nothing.
   */
  const [rungs, setRungs] = useState<ChaseRung[]>([]);

  useEffect(() => {
    if (ending !== null) endPanelRef.current?.focus();
  }, [ending]);

  useEffect(() => {
    // Bumped even when the sentence repeats: pressing a refused button twice
    // has to move focus twice, and `endError` alone does not change.
    if (endErrorAt > 0) endErrorRef.current?.focus();
  }, [endErrorAt]);

  const load = useCallback(async (): Promise<void> => {
    const [one, me, vocab, book, chaser] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId } } }),
      api.GET("/api/v1/auth/me", {}),
      api.GET("/api/v1/parties/relationship-types", {}),
      // Archived parties are out by default, which is what a picker wants: a
      // company the firm has put away is not one to record a new live
      // relationship with.
      api.GET("/api/v1/parties", {}),
      // Only a PUBLISHED version chases — a draft cadence is one somebody is
      // still thinking about, and `ladderFor` in the backend reads exactly the
      // same way.
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "chaser" } } }),
    ]);
    setPermissions(me.data?.permissions ?? []);
    // Neither of these is worth failing the page for. The profile is the
    // screen; a vocabulary that did not arrive costs the sentences and the
    // form, and the card says so rather than the whole page refusing.
    setTypes(vocab.data?.types ?? []);
    setParties(book.data?.parties ?? []);
    setRungs(readRungs(chaser.data?.entries ?? []));
    if (one.response.status === 401) {
      router.push("/login");
      return;
    }
    if (one.error) {
      setError(apiError(one.error).message);
      setLoaded(true);
      return;
    }
    setProfile(one.data);
    setError(null);
    setLoaded(true);
  }, [partyId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Archive, or bring back.
   *
   * NOT a delete, and the API says so in its own summary: it hides the party
   * from pickers and lists. Everything the firm did with them — engagements,
   * invoices, the trail — stays exactly where it was, which is why this is
   * offered on the record rather than as a row action somebody could hit by
   * accident on the way past.
   */
  async function setArchived(archive: boolean): Promise<void> {
    setArchiving(true);
    setError(null);
    const result = archive
      ? await api.POST("/api/v1/parties/{partyId}/archive", { params: { path: { partyId } } })
      : await api.POST("/api/v1/parties/{partyId}/unarchive", { params: { path: { partyId } } });
    if (result.error) {
      setError(apiError(result.error).message);
      setArchiving(false);
      return;
    }
    await load();
    setArchiving(false);
  }

  /**
   * Register the company — which country's law it exists under, and what kind
   * of company it is.
   *
   * THIS FORM DID NOT EXIST, AND ITS ABSENCE WAS LOAD-BEARING.
   * `POST /parties/organizations/{id}/legal-entities` shipped with the party
   * model and had no caller in this app, so the only way to register a client
   * was a curl command. That is not a cosmetic gap: **a compliance rule matches
   * an entity's jurisdiction exactly**, so an unregistered company generates no
   * calendar at all — it is the `entity_not_registered` row on
   * `/calendar` -> Not covered. A firm could add a client through this screen,
   * agree work with it, and never find out why nothing was ever due.
   *
   * Found by walking a new client end to end for a demo, which is the rule this
   * repo already runs on: a write with no read — or, here, with no writer — is
   * not a stored fact.
   */
  async function registerEntity(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const incorporatedOn = String(form.get("incorporatedOn") ?? "").trim();
    const financialYearEnd = String(form.get("financialYearEnd") ?? "").trim();
    const result = await api.POST("/api/v1/parties/organizations/{partyId}/legal-entities", {
      params: { path: { partyId } },
      body: {
        jurisdiction: String(form.get("jurisdiction")).trim().toUpperCase(),
        entityType: String(form.get("entityType")).trim(),
        ...(incorporatedOn === "" ? {} : { incorporatedOn }),
        ...(financialYearEnd === "" ? {} : { financialYearEnd }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  async function addIdentifier(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const jurisdiction = String(form.get("jurisdiction") ?? "").trim();
    const result = await api.POST("/api/v1/parties/{partyId}/identifiers", {
      params: { path: { partyId } },
      body: {
        type: String(form.get("type")) as IdentifierType,
        value: String(form.get("value")).trim(),
        validFrom: String(form.get("validFrom")),
        isPrimary: form.get("isPrimary") === "on",
        ...(jurisdiction === "" ? {} : { jurisdiction }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  /**
   * Record a relationship — the write this card has never had.
   *
   * `POST /api/v1/parties/relationships` shipped with the party model and had
   * no caller anywhere in this app. The card below RENDERED relationships and
   * could not record one, so a directorship or a group shareholding reached the
   * database by curl or not at all — which matters more than it sounds, because
   * `core.party_relationship` is what a group is, and a group is how a portal
   * contact reaches a sister company.
   *
   * ## Direction is chosen as a SENTENCE, and that is the whole design
   *
   * The API takes `fromPartyId` and `toPartyId`, and getting them the wrong way
   * round is silent: "Cobalt Foods is the parent of Nilgiri Textiles" and the
   * reverse are both valid rows, and only one is true. So the form does not ask
   * for a direction at all. It asks for the other company first, then offers
   * twelve complete sentences with both real names in them — six codes, each
   * read from both ends — and the chosen sentence decides which uuid goes in
   * which field. There is nothing left to get backwards.
   *
   * ## Ending one is a DIFFERENT act, and it now exists
   *
   * This form's end date records a relationship that was already over when the
   * firm heard about it. Closing one that is open is `endRelationship` below,
   * against `POST /parties/relationships/{id}/end` — the route that was missing
   * while `party_relationship.ended` sat in the ledger vocabulary with nothing
   * raising it, which is what this comment used to say instead.
   */
  async function addRelationship(form: FormData): Promise<void> {
    const other = String(form.get("otherParty") ?? "");
    // "parent_of:out" — the code and which end THIS party is standing at.
    const [type = "", end = ""] = String(form.get("relation") ?? "").split(":");
    if (other === "" || type === "") return;
    const validTo = String(form.get("relValidTo") ?? "").trim();
    setRelBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/parties/relationships", {
      body: {
        fromPartyId: end === "out" ? partyId : other,
        toPartyId: end === "out" ? other : partyId,
        type,
        validFrom: String(form.get("relValidFrom")),
        ...(validTo === "" ? {} : { validTo }),
      },
    });
    setRelBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setRelOther("");
    await load();
  }

  /**
   * Close an open relationship on the day it stopped being in force.
   *
   * ── A DATE, NOT "TODAY", and that is the difference from the account team ──
   *
   * `AccountTeamPanel` ends an assignment on the caller's own day, because that
   * is an operational fact the firm controls as it happens. A directorship is
   * not: it ended on the day the registrar recorded, the firm hears afterwards,
   * and "End today" would be wrong by however long the post took. So this asks.
   *
   * ── HALF-OPEN, LIKE EVERY OTHER RANGE IN THIS PRODUCT ─────────────────────
   *
   * `validTo` is the FIRST DAY NOT IN FORCE. A director who resigned on the
   * 12th is ended on the 12th and the 11th is her last day, and the field says
   * so rather than leaving a partner to guess which convention this screen is
   * on. The API refuses a date that is not after the day it began — so does the
   * database — and that refusal renders here, beside the field.
   */
  async function endRelationship(form: FormData): Promise<void> {
    if (ending === null) return;
    const validTo = String(form.get("endValidTo") ?? "").trim();
    if (validTo === "") return;
    setEndBusy(true);
    setEndError(null);
    const result = await api.POST("/api/v1/parties/relationships/{relationshipId}/end", {
      params: { path: { relationshipId: ending.relationship.id } },
      body: { validTo },
    });
    setEndBusy(false);
    if (result.error) {
      setEndError(apiError(result.error).message);
      setEndErrorAt((n) => n + 1);
      return;
    }
    setEnding(null);
    await load();
    // The row's button is gone with the relationship it belonged to, so focus
    // goes to the card's own heading — the table underneath it is what changed.
    relCardRef.current?.focus();
  }

  if (!loaded) return <Loading />;
  if (profile === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such party."}</Notice>
      </Page>
    );
  }

  // THE READER'S OWN CALENDAR DAY. `new Date().toISOString().slice(0, 10)` is
  // the UTC day: a firm in India is on tomorrow's date from 00:00 to 05:30
  // local every morning, so this date field defaulted to TOMORROW for five and
  // a half hours a day. Fixed on five other screens already; this file was
  // Anish's and uncommitted at the time, so it was left alone until now.
  const today = browserDay();
  // The same permission the Files panel on this page is gated on, and the one
  // the API takes for archiving.
  const canWrite = permissions.includes("party:write");

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title={<>{profile.party.displayName}</>}
        aside={
          <>
            {/* The state, where the action to change it is. The book already
                rendered this pill and could not set it. */}
            {profile.party.archivedAt !== null && <Pill tone="danger">archived</Pill>}
            {canWrite && (
              <Button
                size="sm"
                variant={profile.party.archivedAt === null ? "destructive-quiet" : "secondary"}
                loading={archiving}
                onClick={() => void setArchived(profile.party.archivedAt === null)}
              >
                {profile.party.archivedAt === null ? "Archive" : "Restore"}
              </Button>
            )}
          </>
        }
      />
      {/* The subtype detail. The display name prefers a trade name, so the LEGAL
          name is a different fact and worth showing when they differ — it is
          what goes on an engagement letter. */}
      <p className="muted">
        {profile.organization !== null
          ? [
              profile.organization.legalName === profile.party.displayName
                ? null
                : profile.organization.legalName,
              profile.organization.industry,
              profile.organization.website,
            ]
              .filter((v): v is string => v !== null && v !== "")
              .join(" · ") || "organization"
          : profile.person !== null
            ? [profile.person.nationality, profile.person.dateOfBirth]
                .filter((v): v is string => v !== null && v !== "")
                .join(" · ") || "person"
            : profile.party.kind}
      </p>

      <ErrorNotice error={error} />

      {/* First, because "who at the firm looks after this client" is the
          question somebody opening a client page most often has, and until
          G3.2 nothing in this product could answer it. */}
      <AccountTeamPanel partyId={partyId} clientName={profile.party.displayName} />

      {/* THE CLIENT'S OWN PEOPLE. Two panels in a row and they are opposite
          halves of the same question: the one above is who at the FIRM owns
          this client, this one is who at the CLIENT can see us. Neither is
          derivable from the other, and until now only the first had a screen —
          `/admin/people` pointed at this one and it did not exist. */}
      <PortalContactsPanel
        partyId={partyId}
        clientName={profile.party.displayName}
        canGrant={permissions.includes("portal:grant")}
        /* THE GROUP, READ FROM THE RELATIONSHIPS ON THIS PAGE. Derived here
           rather than inside the panel because the profile is already loaded —
           and because the card lower down is where those relationships are
           RECORDED, so the two are visibly the same fact: a picker that does
           not offer a sister company is a sister company nobody has written
           down yet. */
        group={groupCompanies(profile, today)}
      />

      {/* THE THIRD THING ABOUT TALKING TO THIS CLIENT, after who owns them and
          who at their end can see us: whether the product is reminding them
          about what they owe. It is the panel whose NAME is most misleading —
          "freeze the client" stops the outward reminder ladder and nothing
          else — so the card states what it does not do above the control that
          does it. */}
      <ChasingPanel
        partyId={partyId}
        clientName={profile.party.displayName}
        canFreeze={permissions.includes("tenant:admin")}
        rungs={rungs}
      />

      {/* ALWAYS RENDERED, even when there is nothing in it. An unregistered
          company is not a blank space on this page — it is the reason its
          compliance calendar is empty, and the empty state is the only place
          anybody would find that out. */}
      {profile.party.kind === "organization" && (
        <Card>
          <CardTitle level={2}>Registered</CardTitle>
          {profile.legalEntities.length === 0 ? (
            <p className="muted measure">
              Not registered anywhere yet. A compliance rule matches a
              company&rsquo;s country exactly, so until this is filled in
              nothing is ever due for this client and the calendar has nothing
              to generate — it will say so on{" "}
              <Link href="/calendar">the calendar</Link>, under Not covered.
            </p>
          ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Jurisdiction</Th>
                  <Th>Type</Th>
                  <Th>Incorporated</Th>
                  <Th>FY end</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {profile.legalEntities.map((e) => (
                  <tr key={`${e.jurisdiction}-${e.entityType}`}>
                    <Td className="mono">{e.jurisdiction}</Td>
                    <Td>{e.entityType}</Td>
                    <Td className="muted">{e.incorporatedOn === null ? "—" : longDay(e.incorporatedOn)}</Td>
                    {/* MM-DD: a financial year ends on a date in the calendar,
                        not in a particular year. */}
                    <Td className="muted">{e.financialYearEnd ?? "—"}</Td>
                    <Td>
                      <Pill tone={e.status === "active" ? "neutral" : "danger"}>
                        {e.status}
                      </Pill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          )}

          {/* The write that had no caller. Offered on `party:write`, the same
              permission the identifier form below takes — registering a company
              is a fact about a client, not an administrative act. */}
          {permissions.includes("party:write") && (
            <form
              className="card-foot"
              action={(form) => {
                void registerEntity(form);
              }}
            >
              <p className="eyebrow">Register it</p>
              <FieldStack>
                <FieldRow>
                  {/* The paragraph below explains BOTH of these and neither on
                      its own, so it stays outside the fields and they point at
                      it by hand — `Field`'s own `hint` would have had to say it
                      twice, once under each. */}
                  <Field label="Country">
                    <Input
                      name="jurisdiction"
                      maxLength={2}
                      placeholder="IN"
                      required
                      aria-describedby={registerHintId}
                      style={{ textTransform: "uppercase" }}
                    />
                  </Field>
                  <Field label="Kind of company">
                    <Input
                      name="entityType"
                      placeholder="private_limited"
                      required
                      aria-describedby={registerHintId}
                    />
                  </Field>
                  <Field label="Incorporated" optional>
                    <Input name="incorporatedOn" type="date" />
                  </Field>
                  {/* MM-DD, never a full date: a financial year ends on a day in
                      the calendar, not in one particular year. */}
                  <Field label="FY ends" optional>
                    <Input
                      name="financialYearEnd"
                      placeholder="03-31"
                      pattern="[0-9]{2}-[0-9]{2}"
                    />
                  </Field>
                </FieldRow>
                <p className="field-hint" id={registerHintId}>
                  The country is what a compliance rule is matched against, and
                  the kind of company narrows which rules apply. Both are the
                  firm&rsquo;s own words for them — <span className="mono">IN</span>{" "}
                  and <span className="mono">private_limited</span> are what the
                  shipped India rules look for.
                </p>
                <div className="cluster">
                  <Button type="submit" loading={busy}>
                    Register
                  </Button>
                </div>
              </FieldStack>
            </form>
          )}
        </Card>
      )}

      <Card>
        <CardTitle level={2}>Identifiers</CardTitle>
        {profile.identifiers.length === 0 ? (
          <p className="muted">
            None yet. A PAN or an email is what lets a second capture of this
            counterparty find this record instead of making another.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Value</Th>
                  <Th>Where</Th>
                  <Th>From</Th>
                </tr>
              </thead>
              <tbody>
                {profile.identifiers.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      {i.type}
                      {i.isPrimary && (
                        <>
                          {" "}
                          <Pill>primary</Pill>
                        </>
                      )}
                    </Td>
                    {/* Stored normalised by the API — uppercase, unspaced — which
                        is what makes two captures of one company match. */}
                    <Td className="mono">{i.value}</Td>
                    <Td className="muted">{i.jurisdiction ?? "—"}</Td>
                    <Td className="muted">{longDay(i.validFrom)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card>
        {/* `tabIndex={-1}` so it can be FOCUSED without becoming a tab stop —
            the same half-fix the skip link needed. It is where focus goes when
            a relationship has just been closed and the button that closed it no
            longer exists. */}
        <CardTitle level={2} ref={relCardRef} tabIndex={-1}>
          Relationships
        </CardTitle>
        <p className="muted">
          Who owns this company, who signs for it, and which other companies it is grouped
          with — each one effective-dated, because compliance never asks who a director is,
          it asks who was a director on 31 March. Read every row as a sentence beginning{" "}
          <strong>{profile.party.displayName}</strong>.
        </p>
        {profile.relationships.length === 0 ? (
          <p className="muted">
            None recorded.{" "}
            {canWrite
              ? "Recording a shareholding or a parent company here is also what lets a portal contact be given a sister company to look at — that picker reads this list and nothing else."
              : "Recording one needs permission to write parties."}
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Is</Th>
                  <Th>Whom</Th>
                  <Th>From</Th>
                  <Th>Until</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {profile.relationships.map((r) => (
                  <tr key={r.relationship.id}>
                    {/* THE SENTENCE, NOT THE COLUMN VALUE. This cell printed
                        `parent_of →` until the vocabulary became readable — a
                        database code and an arrow, shown to a partner. Direction
                        matters and is the reason the lookup carries both halves:
                        "Priya is a director of Cobalt Foods" and "Cobalt Foods
                        has director Priya" are ONE row read from two ends. */}
                    <Td>{relationSentence(r, types)}</Td>
                    <Td>
                      <Link href={`/clients/${r.counterparty.id}`}>
                        {r.counterparty.displayName}
                      </Link>
                    </Td>
                    <Td className="muted">{longDay(r.relationship.validFrom)}</Td>
                    {/* Half-open, like every other date range in this product:
                        `validTo` is the first day NOT in force. An open
                        relationship has no end at all, which is a different fact
                        from one that ended today. */}
                    <Td className="muted">
                      {r.relationship.validTo === null
                        ? "open"
                        : longDay(r.relationship.validTo)}
                    </Td>
                    <Td>
                      {canWrite && r.relationship.validTo === null && (
                        /* NAMED BY THE ROW, not by the word on it. A company
                           with four directors draws four buttons saying "End
                           it", and the sentence plus the counterparty is what
                           the row IS — neither is editable anywhere on this
                           screen. */
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`End it — ${profile.party.displayName} ${relationSentence(
                            r,
                            types,
                          )} ${r.counterparty.displayName}`}
                          onClick={(e) => {
                            endTriggerRef.current = e.currentTarget;
                            setEndError(null);
                            setEnding(r);
                          }}
                        >
                          End it
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}

        {ending !== null && (
          /*
           * ONE PANEL FOR THE WHOLE TABLE, and it names what it is about.
           *
           * A date field per open row would be N forms answering to two names,
           * which is the shape this repo has had to unpick on six screens. The
           * panel is focused when it opens and Cancel hands focus back to the
           * button that opened it — a form that appears below the control that
           * summoned it still loses focus to `<body>` when it closes.
           */
          <div
            ref={endPanelRef}
            tabIndex={-1}
            className="card"
            style={{ marginTop: "var(--s-4)" }}
          >
            <CardTitle>End this relationship</CardTitle>
            <p className="muted">
              <strong>{profile.party.displayName}</strong> {relationSentence(ending, types)}{" "}
              <strong>{ending.counterparty.displayName}</strong>, from{" "}
              {longDay(ending.relationship.validFrom)}.
            </p>
            <div ref={endErrorRef} tabIndex={-1}>
              <ErrorNotice error={endError} />
            </div>
            <form action={endRelationship}>
              <FieldStack>
                {/* A DATE BOX, NOT A BANNER — and `FieldRow` does not do it,
                    which was worth measuring rather than assuming.
                    `.field-row` is `repeat(auto-fit, minmax(12rem, 1fr))`, and
                    auto-fit COLLAPSES the tracks nothing sits in and hands
                    their space to the one that is filled: measured at 1068px
                    with a single field in it, the same width `FieldStack`
                    already gave it. The cap is what makes it a control. It is
                    an inline width because this system has no token for one —
                    the same case as the `maxWidth: 62ch` prose measures on
                    /admin/structure. */}
                <div style={{ maxWidth: "16rem" }}>
                <Field
                  label="The first day it is no longer in force"
                  hint="Half-open, like every date range here: a director who resigned on the 12th is ended on the 12th, and the 11th is her last day. It has to be after the day the relationship began, and it cannot be changed afterwards — the ledger records an ending once."
                >
                  <Input type="date" name="endValidTo" defaultValue={today} required />
                </Field>
                </div>
                <div className="cluster">
                  <Button type="submit" loading={endBusy}>
                    {endBusy ? "Ending…" : "End it"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEnding(null);
                      setEndError(null);
                      endTriggerRef.current?.focus();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldStack>
            </form>
          </div>
        )}

        {canWrite && types.length > 0 && (
          <details style={{ marginTop: "var(--s-4)" }}>
            {/* THE DISCLOSURE AND THE BUTTON INSIDE IT ARE TWO ACTIONS, and
                naming both "Record a relationship" only moves the collision.
                The summary opens a form; the button writes the row. */}
            <summary aria-label="The form for a new relationship">
              Record a relationship
            </summary>
            <form
              style={{ marginTop: "var(--s-3)" }}
              action={(form) => {
                void addRelationship(form);
              }}
            >
              {/* A NAMED GROUP WITH NO LEGEND, and it is not decoration.
                  Measured on this page with the form open: the account team's
                  Assign form asks for a date called "From" and so does this
                  one, so two controls on one document shared one whole
                  accessible name. `.fieldset` is border 0, margin 0, padding 0
                  — nothing moves, and the two "From"s stop being the same
                  field to anybody who cannot see which card they are in. */}
              <fieldset className="fieldset" aria-label="A new relationship">
              <FieldStack>
                <FieldRow>
                  <Field
                    label="The other party"
                    hint="Every company and person on the firm's book, except this one and anything archived. A relationship needs two ends and a party cannot be its own."
                  >
                    {/* CONTROLLED, because the sentences below NAME what is
                        chosen here. No pre-selected party: a relationship
                        recorded against whoever happened to sort first is a
                        wrong fact, not a typo. */}
                    <Select
                      name="otherParty"
                      required
                      value={relOther}
                      onChange={(e) => {
                        setRelOther(e.target.value);
                      }}
                    >
                      <option value="" disabled>
                        Choose a company or a person
                      </option>
                      {parties
                        .filter((c) => c.id !== partyId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </FieldRow>

                <Field
                  label="How they are related"
                  hint="Twelve sentences, and each one names both companies — six kinds of relationship, read from each end. The API stores a from and a to, and choosing the sentence is what decides which is which."
                >
                  {/* DIRECTION IS NOT A SEPARATE QUESTION. Asking for it as a
                      radio or an arrow is asking somebody to translate a fact
                      they know into a field order they do not — and getting it
                      backwards is SILENT, because both rows are valid and only
                      one is true. Naming both parties in every option means
                      there is nothing left to get backwards. */}
                  <Select name="relation" required defaultValue="" disabled={relOther === ""}>
                    <option value="" disabled>
                      {relOther === ""
                        ? "Choose the other party first"
                        : "Choose what is true"}
                    </option>
                    {relationChoices(
                      types,
                      profile.party.displayName,
                      parties.find((c) => c.id === relOther)?.displayName ?? "",
                    ).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.sentence}
                      </option>
                    ))}
                  </Select>
                </Field>

                <FieldRow>
                  <Field
                    label="From"
                    hint="The day it became true — an incorporation, a share transfer, a board resolution. Not today unless today is the day."
                  >
                    <Input type="date" name="relValidFrom" defaultValue={today} required />
                  </Field>
                  <Field
                    label="Until (optional)"
                    hint="The first day it is NO LONGER true, not the last day it was. Leave it empty while it still stands."
                  >
                    <Input type="date" name="relValidTo" />
                  </Field>
                </FieldRow>

                <div className="cluster">
                  <Button type="submit" loading={relBusy}>
                    {relBusy ? "Recording…" : "Record it"}
                  </Button>
                  {/* TWO DIFFERENT ACTS, and the form says which one it is.
                      Filling in Until records a relationship that was already
                      over when the firm heard about it. Closing one that is
                      still open is the row's own "End it" — it writes
                      `party_relationship.ended`, and it happens once. */}
                  <p className="field-hint">
                    <em>Until</em> is for one that has already ended. To close a relationship
                    that is still open, use <em>End it</em> on its row above.
                  </p>
                </div>
              </FieldStack>
              </fieldset>
            </form>
          </details>
        )}
      </Card>

      <Card>
        <CardTitle level={2}>Attach an identifier</CardTitle>
        <form
          action={(form) => {
            void addIdentifier(form);
          }}
        >
          <FieldStack>
            <FieldRow>
              <Field label="Type">
                <Select name="type">
                  {IDENTIFIER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Value">
                <Input name="value" required />
              </Field>
              <Field label="Jurisdiction">
                <Input name="jurisdiction" maxLength={2} placeholder="IN" />
              </Field>
              {/* This field and the account team's "From" BOTH hardcoded
                  `id="validFrom"`, and both render on this page — so the
                  document carried the id twice and clicking THIS label put the
                  cursor in the other card's input. `Field` generates its id
                  with `useId`, which is why the whole class of bug goes away
                  rather than this one instance of it. */}
              <Field label="Valid from">
                <Input name="validFrom" type="date" defaultValue={today} required />
              </Field>
            </FieldRow>
            <Checkbox label="The primary one of its type for this party." name="isPrimary" />
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {busy ? "Attaching…" : "Attach"}
              </Button>
            </div>
          </FieldStack>
        </form>
      </Card>
      {/* The client's file. `partyId` is passed so every document carries the
          column the client portal's record scope (Gate 4) will filter on —
          adding it later would mean backfilling a fact nobody recorded. */}
      <Documents
        subjectKind="party"
        subjectRef={partyId}
        partyId={partyId}
        canWrite={canWrite}
        emptyHint="Nothing on file yet. A PAN card, a certificate of incorporation, a board resolution — whatever the firm would have to go looking for."
      />
    </Page>
  );
}

/**
 * The identifier types the API accepts.
 *
 * Listed here because the generated schema gives them as a union type, which
 * TypeScript cannot enumerate at runtime — `satisfies` makes anything that is
 * not one of them a compile error, so this cannot drift silently past a
 * regenerate.
 */
const IDENTIFIER_TYPES = [
  "pan",
  "gstin",
  "cin",
  "llpin",
  "tan",
  "din",
  "uen",
  "trn",
  "ein",
  "crn",
  "vat",
  "passport",
  "email",
  "phone",
  "other",
] as const satisfies readonly IdentifierType[];

/**
 * One relationship as a PREDICATE, read from this party's end.
 *
 * The row's subject is the party whose page this is, printed once in the card's
 * lede rather than on every row, so the table stays narrow and still reads as a
 * sentence across: "Cobalt Foods · is the parent of · Cobalt Logistics".
 *
 * `label` completes "{from} is {label} {to}", so an OUTGOING row — this party
 * is the `from` — needs the "is" put back. `inverseLabel` is a verb phrase that
 * completes "{to} … {from}" on its own ("has director", "is a subsidiary of"),
 * so an INCOMING row takes it as it stands. Migration 0074 exists because one
 * of the six was a noun phrase and produced a sentence with no verb in it.
 *
 * Falls back to the raw code, which is what the whole app showed before this
 * function: the vocabulary is a separate read and a page that rendered before
 * it arrived would otherwise print nothing where the relationship should be.
 */
function relationSentence(r: PartyRelationship, types: readonly RelationshipType[]): string {
  const t = types.find((x) => x.code === r.relationship.type);
  if (t === undefined) return r.relationship.type;
  return r.direction === "outgoing" ? `is ${t.label}` : t.inverseLabel;
}

/**
 * The twelve sentences a new relationship could be, with both real names in
 * each — six codes read from both ends.
 *
 * The VALUE encodes the code and which end this party stands at (`out` = this
 * party is the `from`), which is the only thing the writer needs to fill
 * `fromPartyId` and `toPartyId` correctly. Nothing else on the form asks about
 * direction, because the sentence has already answered it.
 *
 * Returns nothing at all until the other party is chosen: a sentence with a
 * blank in it is not a sentence, and offering "Cobalt Foods is the parent of"
 * with nothing after it invites somebody to choose it.
 */
function relationChoices(
  types: readonly RelationshipType[],
  thisName: string,
  otherName: string,
): { value: string; sentence: string }[] {
  if (otherName === "") return [];
  return types.flatMap((t) => [
    { value: `${t.code}:out`, sentence: `${thisName} is ${t.label} ${otherName}` },
    { value: `${t.code}:in`, sentence: `${otherName} is ${t.label} ${thisName}` },
  ]);
}

/**
 * The firm's reminder cadence, off a config body that is typed as `unknown`.
 *
 * `config.version.body` is jsonb and reaches the wire as an open object, so
 * there is no generated type to lean on — which means this is the one place in
 * this file that has to check what it got. It reads the same shape the
 * backend's `readChaserBody` does and drops anything that is not it, because
 * the alternative is a lede that says "reminder after undefined days".
 *
 * A missing entry, an unpublished draft and a malformed body all return the
 * same empty list, and the panel renders that as the real state it is: nothing
 * is being chased at all.
 */
function readRungs(entries: readonly ConfigEntry[]): ChaseRung[] {
  const body = entries.find((e) => e.entry.key === "default")?.published?.body;
  const raw = (body as { rungs?: unknown } | undefined)?.rungs;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): ChaseRung[] => {
    const row = r as { key?: unknown; label?: unknown; afterDays?: unknown };
    return typeof row.key === "string" &&
      typeof row.label === "string" &&
      typeof row.afterDays === "number"
      ? [{ key: row.key, label: row.label, afterDays: row.afterDays }]
      : [];
  });
}

interface ChaseRung {
  key: string;
  label: string;
  afterDays: number;
}
