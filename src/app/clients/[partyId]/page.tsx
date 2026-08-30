"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Documents } from "@/lib/ui/documents";
import { api, apiError } from "@/lib/api/client";
import type { IdentifierType, PartyProfile } from "@/lib/api/client";
import { AccountTeamPanel } from "./account-team";
import { Button, Pill, Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

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

  if (!loaded) return <p className="muted">Loading…</p>;
  if (profile === null) {
    return (
      <Page>
        <p className="notice" data-tone="danger" role="alert">{error ?? "No such party."}</p>
      </Page>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
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

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {/* First, because "who at the firm looks after this client" is the
          question somebody opening a client page most often has, and until
          G3.2 nothing in this product could answer it. */}
      <AccountTeamPanel partyId={partyId} clientName={profile.party.displayName} />

      {profile.legalEntities.length > 0 && (
        <div className="card">
          <h2 className="card-title">Registered</h2>
          <table className="table">
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
                  <Td className="muted">{e.incorporatedOn ?? "—"}</Td>
                  {/* MM-DD: a financial year ends on a date in the calendar,
                      not in a particular year. */}
                  <Td className="muted">{e.financialYearEnd ?? "—"}</Td>
                  <Td>
                    <span
                      className="pill"
                      data-tone={e.status === "active" ? "" : "danger"}
                    >
                      {e.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-title">Identifiers</h2>
        {profile.identifiers.length === 0 ? (
          <p className="muted">
            None yet. A PAN or an email is what lets a second capture of this
            counterparty find this record instead of making another.
          </p>
        ) : (
          <table className="table">
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
                      <span className="pill" style={{ marginLeft: 8 }}>
                        primary
                      </span>
                    )}
                  </Td>
                  {/* Stored normalised by the API — uppercase, unspaced — which
                      is what makes two captures of one company match. */}
                  <Td className="mono">{i.value}</Td>
                  <Td className="muted">{i.jurisdiction ?? "—"}</Td>
                  <Td className="muted">{i.validFrom}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-title">Relationships</h2>
        {profile.relationships.length === 0 ? (
          <p className="muted">
            None recorded.
          </p>
        ) : (
          <table className="table">
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
                  <Td className="muted">{r.relationship.validFrom}</Td>
                  {/* Effective dating: an open relationship has no end, which is
                      a different fact from one that ended today. */}
                  <Td className="muted">{r.relationship.validTo ?? "open"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Attach an identifier</h2>
        <form
          action={(form) => {
            void addIdentifier(form);
          }}
        >
          <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
            <div>
              <label className="label" htmlFor="type">
                Type
              </label>
              <select className="select" id="type" name="type" style={{ width: "100%" }}>
                {IDENTIFIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "2 1 220px" }}>
              <label className="label" htmlFor="value">
                Value
              </label>
              <input className="input" id="value" name="value" required />
            </div>
            <div>
              <label className="label" htmlFor="jurisdiction">
                Jurisdiction
              </label>
              <input className="input" id="jurisdiction" name="jurisdiction" maxLength={2}
                     placeholder="IN" />
            </div>
            <div>
              <label className="label" htmlFor="validFrom">
                Valid from
              </label>
              <input className="input" id="validFrom" name="validFrom" type="date"
                     defaultValue={today} required />
            </div>
          </div>
          <label className="check" style={{ marginBottom: "var(--s-4)" }}>
            <input type="checkbox" name="isPrimary" />
            <span>The primary one of its type for this party.</span>
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Attaching…" : "Attach"}
          </button>
        </form>
      </div>
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
