"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiError, readClauseBody } from "@/lib/api/client";
import type { ClauseBody, ConfigEntry, FirmEntity } from "@/lib/api/client";
import {
  Button,
  Card,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  Pill,
  TabPanel,
  Tabs,
  Textarea,
  useAppearFocus,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader, useSession } from "@/components/layout";
import { countryName } from "@/lib/country";
import { CountriesPicker } from "@/app/catalogue/parts";
import { keyFrom } from "@/app/catalogue/service";

/**
 * STANDARD TERMS: the clauses engagement letters are built from, beside
 * Standard prose under Documents (Wave 4 brief §8.6, 2026-09-28). They used to
 * be a card at the bottom of the Catalogue, which is about what the firm
 * SELLS; terms are about what it SIGNS.
 *
 * TABS LIKE STANDARD PROSE: Default, then one per company. A clause's law
 * follows the issuing company (D6): a letter is offered the terms whose
 * governing law and courts are its issuer's country (`lawFits`, the API's
 * `refuseForeignTerms`), plus every term that names no law. So:
 *
 *   Default   the terms that name no law or courts: on every company's letters
 *   <company> the terms under that company's country's law
 *
 * A company tab WRITES in that company's law: the country is the company's,
 * and the partner types only the words that print ("the laws of the Republic
 * of India", "the courts at New Delhi"). Two companies in one country share
 * one set, because the law is the country's. A term under a country none of
 * the firm's companies is in is listed on the Default tab as usable by none,
 * rather than dropped.
 *
 * A TERM IS WRITTEN AND PUT IN FORCE IN ONE ACT, as it was on the Catalogue:
 * there is no clause editor to come back to, and a draft left behind would
 * look written and be usable on no letter. The key is made from the title
 * (`keyFrom`), never typed. Each letter keeps the version it was drafted
 * from, so a later wording never changes a letter already sent.
 *
 * READ `config:read`, WRITE `tenant:admin`, like the Catalogue.
 */
export default function StandardTermsPage() {
  return (
    <Suspense fallback={<Loading label="Loading the standard terms" />}>
      <StandardTerms />
    </Suspense>
  );
}

const DEFAULT = "default";

interface Term {
  readonly entry: ConfigEntry;
  readonly body: ClauseBody;
  /** The country its law or courts name, or null when it names neither.
   *  "mixed" when the two name different countries: usable by no issuer. */
  readonly law: string | null;
  readonly published: boolean;
}

function termOf(entry: ConfigEntry): Term {
  const body = readClauseBody((entry.published ?? entry.pendingDraft)?.body);
  const named = [body.governingLaw, body.courts].filter((t) => t !== null).map((t) => t.jurisdiction);
  const law = named.length === 0 ? null : named.every((c) => c === named[0]) ? (named[0] ?? null) : "mixed";
  return { entry, body, law, published: entry.published !== null };
}

function StandardTerms() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const tabsId = useId();
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [companies, setCompanies] = useState<FirmEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const saidRef = useAppearFocus(said);

  const load = useCallback(async (): Promise<void> => {
    const [clauses, firm] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "clause" } } }),
      api.GET("/api/v1/firm-entities", {}),
    ]);
    if (clauses.response.status === 401) {
      router.push("/login");
      return;
    }
    if (clauses.error) {
      setError(apiError(clauses.error).message);
      setLoaded(true);
      return;
    }
    setEntries(clauses.data.entries);
    setCompanies(firm.data?.entities ?? []);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading the standard terms" />;

  const canWrite = session?.permissions.includes("tenant:admin") ?? false;
  const terms = entries.map(termOf).sort((a, b) => a.body.title.localeCompare(b.body.title));
  const countries = new Set(companies.map((c) => c.jurisdiction).filter((c): c is string => c !== null));
  const defaults = terms.filter((t) => t.law === null);
  const orphans = terms.filter((t) => t.law !== null && (t.law === "mixed" || !countries.has(t.law)));

  const asked = params.get("company");
  const tab = asked !== null && companies.some((c) => c.partyId === asked) ? asked : DEFAULT;
  const company = companies.find((c) => c.partyId === tab) ?? null;
  const shown = company === null ? defaults : terms.filter((t) => t.law !== null && t.law === company.jurisdiction);

  function choose(value: string): void {
    setSaid(null);
    router.replace(
      (value === DEFAULT ? "/admin/standard-terms" : `/admin/standard-terms?company=${value}`) as Route,
      { scroll: false },
    );
  }

  async function publish(term: Term): Promise<void> {
    const draft = term.entry.pendingDraft;
    if (draft === null) return;
    setBusy(true);
    setError(null);
    setSaid(null);
    const result = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "clause", key: term.entry.entry.key, version: draft.version } },
    });
    await load();
    setBusy(false);
    if (result.error) setError(apiError(result.error).message);
    else setSaid(`${term.body.title || "The term"} is live. New letters can use it.`);
  }

  return (
    <Page>
      <PageHeader
        title="Standard terms"
        aside={
          canWrite && (company === null || company.jurisdiction !== null) ? (
            <Button
              onClick={() => {
                setSaid(null);
                setWriting(true);
              }}
            >
              Write a term
            </Button>
          ) : undefined
        }
      />
      <ErrorNotice error={error} />
      {said !== null && (
        <Notice tone="ok" ref={saidRef} tabIndex={-1}>
          {said}
        </Notice>
      )}

      <Tabs
        id={tabsId}
        label="Whose terms"
        value={tab}
        onChange={choose}
        tabs={[
          { value: DEFAULT, label: "Default", count: defaults.length },
          ...companies.map((c) => ({
            value: c.partyId,
            label: c.name,
            ...(c.jurisdiction === null ? {} : { count: terms.filter((t) => t.law === c.jurisdiction).length }),
          })),
        ]}
      />
      <TabPanel tabsId={tabsId} value={tab}>
        <div className="stack">
          <p className="text-md">
            {company === null ? (
              "These name no law, so every company's letters can use them."
            ) : company.jurisdiction === null ? (
              <>
                {company.name} has no country yet. Set it on <Link href="/admin/firm">Your firm</Link> to
                write its terms.
              </>
            ) : (
              <>
                {company.name}&rsquo;s letters get these, under the law of{" "}
                {countryName(company.jurisdiction)}, and the Default terms.
              </>
            )}
          </p>
          {(company === null || company.jurisdiction !== null) && (
            <Card>
              {shown.length === 0 ? (
                <p className="text-md">
                  {company === null
                    ? "No terms here yet."
                    : `No terms under ${countryName(company.jurisdiction ?? "")} law yet, so ${company.name}'s letters get only the Default terms.`}
                </p>
              ) : (
                <ul className="stack m-0 list-none pl-0">
                  {shown.map((t) => (
                    <TermItem key={t.entry.entry.id} term={t} canWrite={canWrite} busy={busy} onPublish={publish} />
                  ))}
                </ul>
              )}
            </Card>
          )}
          {company === null && orphans.length > 0 && (
            <Card>
              <h2 className="card-title">Not usable by any company</h2>
              <p className="text-md">
                Their law is a country none of your companies is in, so no letter can use them.
              </p>
              <ul className="stack mt-4 mb-0 list-none pl-0">
                {orphans.map((t) => (
                  <TermItem key={t.entry.entry.id} term={t} canWrite={canWrite} busy={busy} onPublish={publish} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      </TabPanel>

      {writing && (
        <WriteTerm
          company={company}
          suggested={[...countries].sort((a, b) => countryName(a).localeCompare(countryName(b)))}
          taken={new Set(entries.map((e) => e.entry.key))}
          onClose={() => {
            setWriting(false);
          }}
          onWritten={async (title) => {
            setWriting(false);
            await load();
            setSaid(
              company === null
                ? `${title} is live. Every company's new letters can use it.`
                : `${title} is live. New letters from ${company.name} can use it.`,
            );
          }}
        />
      )}
    </Page>
  );
}

function TermItem({
  term,
  canWrite,
  busy,
  onPublish,
}: {
  term: Term;
  canWrite: boolean;
  busy: boolean;
  onPublish: (term: Term) => Promise<void>;
}) {
  const { body } = term;
  const facts = [
    body.governingLaw === null ? null : `Law: ${body.governingLaw.text}`,
    body.courts === null ? null : `Courts: ${body.courts.text}`,
    body.jurisdictions.length === 0 ? "Usable on every letter" : `Only for ${body.jurisdictions.map(countryName).join(", ")}`,
  ].filter((f): f is string => f !== null);
  return (
    <li className="stack tight border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="cluster">
        <h3 className="text-md font-semibold">{body.title === "" ? term.entry.entry.key : body.title}</h3>
        {!term.published && <Pill dot>Not published</Pill>}
        {term.law === "mixed" && <Pill dot tone="warn">Law and courts name different countries</Pill>}
      </div>
      {body.text !== "" && <p className="max-w-[var(--measure)] whitespace-pre-wrap text-md">{body.text}</p>}
      <p className="text-sm text-ink-2">{facts.join(" · ")}</p>
      {!term.published && canWrite && (
        <div className="cluster">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onPublish(term)}>
            Publish it
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * The writer, in a dialog over the tab it was opened from. On a company's tab
 * the country is that company's and fixed; the partner writes the words that
 * print. A half-stated term (a country with no words) is never sent: the
 * company tab asks for the law's words, and the courts are optional.
 */
function WriteTerm({
  company,
  suggested,
  taken,
  onClose,
  onWritten,
}: {
  company: FirmEntity | null;
  suggested: readonly string[];
  taken: ReadonlySet<string>;
  onClose: () => void;
  onWritten: (title: string) => Promise<void>;
}) {
  const formId = useId();
  const country = company?.jurisdiction ?? null;
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [lawText, setLawText] = useState("");
  const [courtsText, setCourtsText] = useState("");
  const [usableIn, setUsableIn] = useState<string[]>([]);
  const [refused, setRefused] = useState<Partial<Record<"title" | "text" | "law", string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    const local: Partial<Record<"title" | "text" | "law", string>> = {};
    if (title.trim() === "") local.title = "Give the term a title, e.g. Confidentiality.";
    if (text.trim() === "") local.text = "Write the term as it will print.";
    if (country !== null && lawText.trim() === "") local.law = "Say whose law applies, e.g. the laws of the Republic of India.";
    setRefused(local);
    const first = (["title", "text", "law"] as const).find((k) => local[k] !== undefined);
    if (first !== undefined) {
      document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    const key = keyFrom(country === null ? title : `${title} ${country}`, taken);
    const body: Record<string, unknown> = {
      title: title.trim(),
      text: text.trim(),
      jurisdictions: usableIn,
      ...(country === null ? {} : { governingLaw: { jurisdiction: country, text: lawText.trim() } }),
      ...(country === null || courtsText.trim() === ""
        ? {}
        : { courts: { jurisdiction: country, text: courtsText.trim() } }),
    };
    const made = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind: "clause" } },
      body: { key, body },
    });
    if (made.error) {
      setFailure(apiError(made.error).message);
      setBusy(false);
      return;
    }
    const put = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
      params: { path: { kind: "clause", key, version: 1 } },
    });
    setBusy(false);
    if (put.error) {
      setFailure(`It is saved but not published: ${apiError(put.error).message}`);
      return;
    }
    await onWritten(title.trim());
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={company === null ? "Write a Default term" : `Write a term for ${company.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={busy}>
            Save and make it live
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FieldStack>
          <ErrorNotice error={failure} />
          <Field id={`${formId}-title`} label="Title" error={refused.title ?? null}>
            <Input
              value={title}
              autoFocus
              placeholder={country === null ? "e.g. Confidentiality" : "e.g. Governing law and jurisdiction"}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field id={`${formId}-text`} label="The term, as it prints" error={refused.text ?? null}>
            <Textarea
              rows={5}
              value={text}
              placeholder="e.g. Each party keeps the other's information confidential."
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {country !== null && (
            <FieldRow>
              <Field
                id={`${formId}-law`}
                label={`Law of ${countryName(country)}, as it prints`}
                error={refused.law ?? null}
              >
                <Input
                  value={lawText}
                  placeholder="e.g. the laws of the Republic of India"
                  onChange={(e) => setLawText(e.target.value)}
                />
              </Field>
              <Field label="Courts, as they print" optional>
                <Input
                  value={courtsText}
                  placeholder="e.g. the courts at New Delhi"
                  onChange={(e) => setCourtsText(e.target.value)}
                />
              </Field>
            </FieldRow>
          )}
          <CountriesPicker
            label="Letters it can go on"
            value={usableIn}
            suggested={suggested}
            onChange={setUsableIn}
            noneMeans="Letters for clients anywhere"
          />
        </FieldStack>
      </form>
    </Dialog>
  );
}
