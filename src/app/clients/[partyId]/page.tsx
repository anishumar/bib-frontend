"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import { api, apiError } from "@/lib/api/client";
import type { IdentifierType, PartyProfile } from "@/lib/api/client";
import { AccountTeamPanel } from "./account-team";
import { PortalContactsPanel } from "./portal-contacts";
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

  const load = useCallback(async (): Promise<void> => {
    const [one, me] = await Promise.all([
      api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId } } }),
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
        <CardTitle level={2}>Relationships</CardTitle>
        {profile.relationships.length === 0 ? (
          <p className="muted">
            None recorded.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Counterparty</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                </tr>
              </thead>
              <tbody>
                {profile.relationships.map((r) => (
                  <tr key={r.relationship.id}>
                    {/* Direction matters: "Priya is a director of Meridian" and
                        "Meridian has Priya as a director" are one row read from
                        two ends, and the sentence is different each way. */}
                    <Td>
                      {r.relationship.type} {r.direction === "outgoing" ? "→" : "←"}
                    </Td>
                    <Td>
                      <Link href={`/clients/${r.counterparty.id}`}>
                        {r.counterparty.displayName}
                      </Link>
                    </Td>
                    <Td className="muted">{longDay(r.relationship.validFrom)}</Td>
                    {/* Effective dating: an open relationship has no end, which is
                        a different fact from one that ended today. */}
                    <Td className="muted">{r.relationship.validTo === null ? "open" : longDay(r.relationship.validTo)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
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
