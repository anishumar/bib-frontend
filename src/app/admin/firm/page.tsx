"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry } from "@/lib/api/client";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Meta,
  MetaItem,
  NotStated,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";
import { longDay } from "@/lib/day";

/**
 * The firm on paper — four facts every firm sets once, and until this screen
 * existed all four were reachable only through the API:
 *
 *   1. WHICH COMPANY issues its letters, and where that company is registered.
 *      A governing-law clause is refused on a letter issued by an entity with
 *      no registered jurisdiction (G1.8), so an unregistered firm cannot sign
 *      a single engagement.
 *   2. WHO SIGNS for it, and with what title. One signatory for the whole
 *      firm, printed on every letter.
 *   3. FROM WHICH DAY its deadlines count (`compliance_policy.missedFromOn`).
 *      A firm onboarding four hundred clients whose filings were made in Excel
 *      would otherwise open to hundreds of MISSED rows on its first morning.
 *   4. WHEN ITS FINANCIAL YEAR STARTS (`fiscalYearStartMonth`). Quarterly and
 *      annual services spawn nothing until the firm says.
 *
 * Every write goes through the same route the setup script used, so a firm
 * that sets itself up here is indistinguishable from one a script set up.
 */

interface FirmEntity {
  readonly id: string;
  readonly displayName: string;
  readonly jurisdiction: string | null;
}

interface Registration {
  readonly jurisdiction: string;
  readonly entityType: string;
  readonly incorporatedOn: string | null;
  readonly financialYearEnd: string | null;
  readonly status: string;
}

interface Signatory {
  readonly userId: string;
  readonly displayName: string | null;
  readonly title: string;
}

interface Colleague {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
}

interface Policy {
  readonly version: number;
  readonly missedFromOn: string | null;
  readonly fiscalYearStartMonth: number | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The published `default` policy off the registry list, or null when the
 *  firm has never published one — which is a real state, not an error. */
function policyOf(entries: readonly ConfigEntry[]): Policy | null {
  const entry = entries.find((e) => e.entry.key === "default");
  if (entry === undefined || entry.published === null) return null;
  const body = entry.published.body as Record<string, unknown>;
  const floor = body["missedFromOn"];
  const month = body["fiscalYearStartMonth"];
  return {
    version: entry.published.version,
    missedFromOn: typeof floor === "string" ? floor : null,
    fiscalYearStartMonth: typeof month === "number" ? month : null,
  };
}

export default function FirmPage() {
  const router = useRouter();
  const [entity, setEntity] = useState<FirmEntity | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [signatory, setSignatory] = useState<Signatory | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyKnown, setPolicyKnown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [prefs, sig, roster, policies] = await Promise.all([
      api.GET("/api/v1/firm-entities/preferences", {}),
      api.GET("/api/v1/tenancy/firm-signatory", {}),
      api.GET("/api/v1/tenancy/members", {}),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "compliance_policy" } } }),
    ]);
    if (prefs.response.status === 401) {
      router.push("/login");
      return;
    }
    if (prefs.error) {
      setError(apiError(prefs.error).message);
      setLoaded(true);
      return;
    }
    // The firm's own company is the one the `*` fallback preference names.
    // Every firm has that row from the day it is provisioned, so this is the
    // one read that can always find the issuing entity without a search.
    const fallback =
      prefs.data.preferences.find((p) => p.clientJurisdiction === "*") ?? prefs.data.preferences[0] ?? null;
    const firm = fallback === null ? null : fallback.firmEntity;
    setEntity(firm);
    if (firm !== null) {
      const profile = await api.GET("/api/v1/parties/{partyId}", { params: { path: { partyId: firm.id } } });
      setRegistrations(profile.data?.legalEntities ?? []);
    }
    setSignatory(sig.data?.signatory ?? null);
    setColleagues(
      (roster.data?.members ?? [])
        .filter((m) => m.membership.audience === "STAFF" && m.membership.isActive)
        .map((m) => ({ userId: m.membership.userId, displayName: m.displayName, email: m.email })),
    );
    setPolicy(policyOf(policies.data?.entries ?? []));
    setPolicyKnown(!policies.error);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write funnels through here, so one place owns the busy flag, the
   *  error and the reload. The API's refusal is shown verbatim — it is the
   *  whole explanation. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await load();
    setBusy(null);
  }

  function register(form: FormData): void {
    if (entity === null) return;
    const partyId = entity.id;
    const incorporatedOn = String(form.get("incorporatedOn") ?? "").trim();
    const financialYearEnd = String(form.get("financialYearEnd") ?? "").trim();
    void act("register", () =>
      api.POST("/api/v1/parties/organizations/{partyId}/legal-entities", {
        params: { path: { partyId } },
        body: {
          jurisdiction: String(form.get("jurisdiction") ?? "").trim().toUpperCase(),
          entityType: String(form.get("entityType") ?? "").trim(),
          ...(incorporatedOn === "" ? {} : { incorporatedOn }),
          ...(financialYearEnd === "" ? {} : { financialYearEnd }),
        },
      }),
    );
  }

  function nameSignatory(form: FormData): void {
    void act("signatory", () =>
      api.PUT("/api/v1/tenancy/firm-signatory", {
        body: {
          userId: String(form.get("userId") ?? ""),
          title: String(form.get("title") ?? "").trim(),
        },
      }),
    );
  }

  /** Publish the policy: define `default` on a firm that has none, or draft the
   *  next version on one that has, then put it in force in the same act. A
   *  draft floor governs nothing, and a screen that left one lying around
   *  would look set while every sweep ignored it. */
  function publishPolicy(form: FormData): void {
    const floor = String(form.get("missedFromOn") ?? "").trim();
    const month = Number(form.get("fiscalYearStartMonth") ?? 0);
    const body = {
      missedFromOn: floor === "" ? null : floor,
      fiscalYearStartMonth: month >= 1 && month <= 12 ? month : null,
    };
    void act("policy", async () => {
      if (policy === null) {
        const defined = await api.POST("/api/v1/config/{kind}", {
          params: { path: { kind: "compliance_policy" } },
          body: { key: "default", body },
        });
        if (defined.error) return defined;
        return api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
          params: { path: { kind: "compliance_policy", key: "default", version: 1 } },
        });
      }
      const drafted = await api.POST("/api/v1/config/{kind}/{key}/versions", {
        params: { path: { kind: "compliance_policy", key: "default" } },
        body: { body },
      });
      const version = drafted.data?.version;
      if (drafted.error || version === undefined) return drafted;
      return api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "compliance_policy", key: "default", version } },
      });
    });
  }

  if (!loaded) return <Loading />;

  return (
    <Page>
      <PageHeader
        eyebrow="The firm"
        title="The firm itself"
        lede="Set up the basics of your firm: which company issues your letters, who signs them,
        the date your deadlines are tracked from, and when your financial year starts. Every
        engagement letter and every calendar entry uses these."
      />
      <ErrorNotice error={error} />

      <IssuingEntity
        entity={entity}
        registrations={registrations}
        busy={busy === "register"}
        onRegister={register}
      />

      <SignatoryCard
        signatory={signatory}
        colleagues={colleagues}
        busy={busy === "signatory"}
        onName={nameSignatory}
      />

      <PolicyCard policy={policy} known={policyKnown} busy={busy === "policy"} onPublish={publishPolicy} />
    </Page>
  );
}

// ── 1. Which company issues the letters ──────────────────────────────────────

function IssuingEntity({
  entity,
  registrations,
  busy,
  onRegister,
}: {
  entity: FirmEntity | null;
  registrations: readonly Registration[];
  busy: boolean;
  onRegister: (form: FormData) => void;
}) {
  const hintId = useId();
  return (
    <Card>
      <CardTitle level={2}>Which company issues your letters?</CardTitle>
      {entity === null ? (
        <p className="muted">
          No issuing company is on file. Every firm gets one when its account is created, so
          please tell whoever set the firm up.
        </p>
      ) : (
        <>
          <Meta>
            <MetaItem label="The company">{entity.displayName}</MetaItem>
            <MetaItem label="Registered in">
              {entity.jurisdiction === null ? (
                <NotStated>nowhere yet</NotStated>
              ) : (
                <Pill tone="code">{entity.jurisdiction}</Pill>
              )}
            </MetaItem>
          </Meta>
          {/* The consequence, said before the form and not after the refusal:
              a letter can name a governing law only once the company issuing
              it is registered somewhere. Until then every engagement letter —
              typed or imported — is refused, and the import report says so
              on every row. */}
          {registrations.length === 0 ? (
            <p className="muted" style={{ maxWidth: "62ch" }}>
              <strong>Not registered anywhere yet.</strong> An engagement letter can only say
              which country&rsquo;s law governs it once the issuing company is registered in a
              country. Until this is filled in, no letter can go out and every imported
              engagement is rejected. One line is enough: the country, and what kind of company
              it is.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Country</Th>
                    <Th>Kind of company</Th>
                    <Th>Incorporated</Th>
                    <Th>FY ends</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => (
                    <tr key={`${r.jurisdiction}-${r.entityType}`}>
                      <Td>
                        <Pill tone="code">{r.jurisdiction}</Pill>
                      </Td>
                      <Td className="mono">{r.entityType}</Td>
                      <Td className="muted">{r.incorporatedOn === null ? "not stated" : longDay(r.incorporatedOn)}</Td>
                      <Td className="muted">{r.financialYearEnd ?? "not stated"}</Td>
                      <Td className="muted">{r.status}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <form
            action={(form) => {
              onRegister(form);
            }}
          >
            <FieldRow>
              <Field label="Country">
                <Input
                  name="jurisdiction"
                  maxLength={2}
                  placeholder="IN"
                  required
                  aria-describedby={hintId}
                  style={{ textTransform: "uppercase" }}
                />
              </Field>
              <Field label="Kind of company">
                <Input name="entityType" placeholder="llp" required aria-describedby={hintId} />
              </Field>
              <Field label="Incorporated" optional>
                <Input name="incorporatedOn" type="date" />
              </Field>
              {/* MM-DD, never a full date: a financial year ends on a day in the
                  calendar, not in one particular year. */}
              <Field label="FY ends" optional>
                <Input name="financialYearEnd" placeholder="03-31" pattern="[0-9]{2}-[0-9]{2}" />
              </Field>
            </FieldRow>
            <p className="field-hint" id={hintId}>
              The country is a two-letter code, such as <span className="mono">IN</span>,{" "}
              <span className="mono">AE</span> or <span className="mono">US</span>. The kind of
              company is in your own words: <span className="mono">llp</span>,{" "}
              <span className="mono">private_limited</span>, <span className="mono">partnership</span>.
              A firm with companies in two countries registers each one. Which company issues
              which client&rsquo;s letters is set under{" "}
              <Link href="/admin/brand">Brand</Link>.
            </p>
            <div className="cluster">
              <Button type="submit" loading={busy}>
                {registrations.length === 0 ? "Register the company" : "Register in another country"}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}

// ── 2. Who signs ─────────────────────────────────────────────────────────────

function SignatoryCard({
  signatory,
  colleagues,
  busy,
  onName,
}: {
  signatory: Signatory | null;
  colleagues: readonly Colleague[];
  busy: boolean;
  onName: (form: FormData) => void;
}) {
  const current = signatory === null ? null : colleagues.find((c) => c.userId === signatory.userId) ?? null;
  return (
    <Card>
      <CardTitle level={2}>Who signs for the firm?</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        One signature on every engagement letter the firm issues, whichever of its companies
        issues it. Naming someone new changes the name on letters drafted from then on. A
        letter already signed keeps the name it was signed with.
      </p>
      <Meta>
        <MetaItem label="Signs today">
          {signatory === null ? (
            <NotStated>nobody named yet, so no letter can be sent</NotStated>
          ) : (
            <span>
              {signatory.displayName ?? current?.email ?? signatory.userId}
              {" · "}
              <span className="muted">{signatory.title}</span>
            </span>
          )}
        </MetaItem>
      </Meta>
      <form
        action={(form) => {
          onName(form);
        }}
      >
        <FieldRow>
          <Field label="Who">
            <Select name="userId" required defaultValue={signatory?.userId ?? ""}>
              <option value="" disabled>
                Choose a colleague
              </option>
              {colleagues.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName ?? c.email}
                  {c.displayName === null ? "" : ` · ${c.email}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Signs as" hint="The title printed under the signature.">
            <Input name="title" placeholder="Managing Partner" required defaultValue={signatory?.title ?? ""} />
          </Field>
        </FieldRow>
        <div className="cluster">
          <Button type="submit" loading={busy}>
            {signatory === null ? "Name the signatory" : "Change the signatory"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── 3. From which day deadlines count, and when the year starts ─────────────

function PolicyCard({
  policy,
  known,
  busy,
  onPublish,
}: {
  policy: Policy | null;
  known: boolean;
  busy: boolean;
  onPublish: (form: FormData) => void;
}) {
  const floorHint = useId();
  const monthHint = useId();
  return (
    <Card>
      <CardTitle level={2}>From which day do your deadlines count?</CardTitle>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        Two facts the compliance calendar needs from you. Each change is saved as a new version,
        so you can always see what was set at any point in the past.
      </p>
      <Meta>
        <MetaItem label="Deadlines count from">
          {policy === null || policy.missedFromOn === null ? (
            <NotStated>{known ? "not set, so every past deadline is asked about" : "not read"}</NotStated>
          ) : (
            longDay(policy.missedFromOn)
          )}
        </MetaItem>
        <MetaItem label="Financial year starts in">
          {policy === null || policy.fiscalYearStartMonth === null ? (
            <NotStated>not set, so quarterly and annual work is not created</NotStated>
          ) : (
            MONTHS[policy.fiscalYearStartMonth - 1]
          )}
        </MetaItem>
        {policy !== null && (
          <MetaItem label="In force">
            <Pill tone="ok">v{policy.version}</Pill>
          </MetaItem>
        )}
      </Meta>
      <form
        action={(form) => {
          onPublish(form);
        }}
      >
        <FieldRow>
          <Field label="Deadlines count from" optional>
            <Input
              name="missedFromOn"
              type="date"
              defaultValue={policy?.missedFromOn ?? ""}
              aria-describedby={floorHint}
            />
          </Field>
          <Field label="Financial year starts in">
            <Select
              name="fiscalYearStartMonth"
              defaultValue={String(policy?.fiscalYearStartMonth ?? 0)}
              aria-describedby={monthHint}
            >
              <option value="0">not set</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <p className="field-hint" id={floorHint}>
          The day you went live on this system. A filing whose legal due date falls before this
          day is not created and is not flagged as missed, because it was handled the old way.
          If you leave it blank, every past deadline is treated as open: bring in four hundred
          clients and the first morning is four hundred filings to decide on.
        </p>
        <p className="field-hint" id={monthHint}>
          April for an Indian firm. This is what makes a quarter run April to June rather than
          January to March. Quarterly and annual services create no work until this is set.
        </p>
        <div className="cluster">
          <Button type="submit" loading={busy}>
            {policy === null ? "Publish" : "Publish a new version"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
