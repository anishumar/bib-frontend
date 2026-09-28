"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BLOCK_KINDS,
  BLOCK_KIND_LABELS,
  PARAGRAPH_BLOCK_KINDS,
  PROPOSAL_BLOCK_KINDS,
  api,
  apiError,
} from "@/lib/api/client";
import type { BlockKind, FirmEntity, StandardBlock } from "@/lib/api/client";
import {
  Button,
  Card,
  CardHead,
  CardTitle,
  Checkbox,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Notice,
  NotSet,
  Pill,
  Table,
  TableWrap,
  Tabs,
  TabPanel,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";

/**
 * The firm's STANDARD prose: the exclusions, the commercial notes, the team
 * block, and a letter's cover and acceptance, that every new document is
 * written with.
 *
 * The whole screen turns on one fact: these are COPIED onto a document at
 * creation, not referenced by it. So editing a line here changes the NEXT
 * proposal and the NEXT letter, and changes nothing that has already gone out.
 * That is said on the page, because the opposite assumption (that fixing a
 * typo fixes it everywhere) is the one a person naturally arrives with, and
 * acting on it would mean silently rewriting what a signed agreement says the
 * firm excluded.
 *
 * PER COMPANY, INHERITING A DEFAULT (T6.18, D5). Each of the firm's own
 * companies has a tab. The rule is PER KIND: when a company has any active
 * line of a kind, its own lines are its documents' set of that kind;
 * otherwise the Default lines are. So a company tab shows, kind by kind,
 * either "Using the default wording" with the Default lines it inherits, or
 * its own lines with a way back. The rule is drawn as a table above the tabs
 * (company by kind, Own or Default), because a rule a partner has to go and
 * read somewhere is a rule they will get wrong.
 *
 * "Write this company's own" COPIES the Default lines of that kind into the
 * company (same order, heading flag and country) and opens them as text
 * boxes, so the company starts from exactly what it printed a moment ago.
 * "Go back to the default" RETIRES the company's lines of that kind.
 *
 * RETIRE, NEVER DELETE, for the same reason `/admin/grades` does: there is no
 * delete endpoint and no DELETE grant behind it. A line a document was written
 * from is part of why that document says what it says, so a retired line stays
 * listed, marked, and simply stops being copied onto anything new.
 *
 * `jurisdiction` ("Only in") still applies inside whichever set a company
 * uses. "All fees are exclusive of GST as applicable" is wrong on a UAE
 * proposal, and a firm that cannot see which of its standard lines are
 * country-scoped will eventually send one.
 */
export default function DocumentBlocksPage() {
  // `useSearchParams` suspends during prerender; the boundary is the
  // framework's requirement rather than a loading state anybody will see.
  return (
    <Suspense
      fallback={
        <Page>
          <PageHeader title="Standard prose" />
        </Page>
      }
    >
      <StandardProse />
    </Suspense>
  );
}

/** The Default tab's value. A company tab's value is its party id. */
const DEFAULT = "default";

/** Whose lines a card is showing: the Default set, or one company's. */
type Owner =
  { readonly kind: "default" } | { readonly kind: "company"; readonly company: FirmEntity };

function StandardProse() {
  const router = useRouter();
  const params = useSearchParams();
  const tabsId = useId();
  const [blocks, setBlocks] = useState<StandardBlock[]>([]);
  const [companies, setCompanies] = useState<FirmEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The card whose lines are open as text boxes: `<tab>:<kind>`. */
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [standard, firm] = await Promise.all([
      api.GET("/api/v1/document-blocks/standard", {}),
      api.GET("/api/v1/firm-entities", {}),
    ]);
    if (standard.response.status === 401) {
      router.push("/login");
      return;
    }
    if (standard.error) {
      setError(apiError(standard.error).message);
      setLoaded(true);
      return;
    }
    setBlocks(standard.data.blocks);
    setCompanies(firm.data?.entities ?? []);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every write goes through here. Cleared BEFORE the call, so the second
   *  press says what IT did; the API's refusal is shown word for word. */
  async function act(run: () => Promise<string | null>): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const failure = await run().catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    await load();
    setBusy(false);
    if (failure !== null) {
      setError(failure);
      return false;
    }
    return true;
  }

  if (!loaded) return <Loading label="Loading the standard wording" />;

  // The tab lives in the URL (`?company=`), so a link from Your firm lands
  // on the right one and a reload keeps it.
  const asked = params.get("company");
  const tab = asked !== null && companies.some((c) => c.partyId === asked) ? asked : DEFAULT;
  const company = companies.find((c) => c.partyId === tab) ?? null;

  function choose(value: string): void {
    setEditing(null);
    setNotice(null);
    router.replace(
      value === DEFAULT ? "/admin/document-blocks" : `/admin/document-blocks?company=${value}`,
      { scroll: false },
    );
  }

  const defaults = blocks.filter((b) => b.issuingEntityPartyId === null);
  const ownOf = (partyId: string): StandardBlock[] =>
    blocks.filter((b) => b.issuingEntityPartyId === partyId);

  return (
    <Page>
      {/* No lede (Wave 4). Editing a line changes the NEXT document only; one
          already issued keeps the wording it was written with. */}
      <PageHeader title="Standard prose" />
      <ErrorNotice error={error} />
      {notice !== null && <Notice tone="ok">{notice}</Notice>}

      <WhoUsesWhat blocks={blocks} companies={companies} />

      <Tabs
        id={tabsId}
        label="Whose wording"
        value={tab}
        onChange={choose}
        tabs={[
          { value: DEFAULT, label: "Default" },
          ...companies.map((c) => ({ value: c.partyId, label: c.name })),
        ]}
      />
      <TabPanel tabsId={tabsId} value={tab}>
        <div className="stack">
          {/* No intro line per tab (Wave 4): the table above says who uses
              what, and each card below says it for its kind. */}
          {BLOCK_KINDS.map((kind) => {
            const key = `${tab}:${kind}`;
            const cardProps = {
              kind,
              busy,
              editing: editing === key,
              onEdit: (open: boolean) => setEditing(open ? key : null),
              act,
              setNotice,
            };
            return company === null ? (
              <DefaultKind
                key={key}
                {...cardProps}
                lines={defaults.filter((b) => b.kind === kind)}
                companies={companies}
                blocks={blocks}
              />
            ) : (
              <CompanyKind
                key={key}
                {...cardProps}
                company={company}
                own={ownOf(company.partyId).filter((b) => b.kind === kind)}
                inherited={defaults.filter((b) => b.kind === kind && b.isActive)}
              />
            );
          })}
        </div>
      </TabPanel>
    </Page>
  );
}

// ── The rule, drawn ─────────────────────────────────────────────────────────

/** Which companies have their OWN active lines of a kind. */
function hasOwn(blocks: readonly StandardBlock[], partyId: string, kind: BlockKind): boolean {
  return blocks.some((b) => b.issuingEntityPartyId === partyId && b.kind === kind && b.isActive);
}

/**
 * THE INHERITANCE RULE, ON THE SCREEN (D5). Three sentences and a table of
 * company by kind, each cell saying "Own" or "Default". Nobody should have to
 * open five tabs to learn that the Gulf company prints its own commercial
 * notes and everybody else's exclusions.
 */
function WhoUsesWhat({
  blocks,
  companies,
}: {
  blocks: readonly StandardBlock[];
  companies: readonly FirmEntity[];
}) {
  const noDefault = (kind: BlockKind): boolean =>
    !blocks.some((b) => b.issuingEntityPartyId === null && b.kind === kind && b.isActive);
  return (
    <Card>
      <CardHead title="Which wording each company uses" level={2}>
        {/* THE RULE (D5), per KIND: a company with its own lines of a kind
            prints only those; otherwise the Default ones. "Only in" applies
            inside either set. Said in CLAUDE.md; one line here. */}
        <p className="lede">Each company uses the Default until it writes its own, kind by kind.</p>
      </CardHead>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Company</Th>
              {BLOCK_KINDS.map((kind) => (
                <Th key={kind}>{BLOCK_KIND_LABELS[kind]}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.partyId}>
                <Td>
                  {/* A LINK, because the tab is in the URL: it can be opened
                      in a new tab or sent to a colleague like any other. */}
                  <Link href={`/admin/document-blocks?company=${c.partyId}`} scroll={false}>
                    {c.name}
                  </Link>
                </Td>
                {BLOCK_KINDS.map((kind) => (
                  <Td key={kind}>
                    {hasOwn(blocks, c.partyId, kind) ? (
                      <Pill tone="neutral">Own</Pill>
                    ) : noDefault(kind) ? (
                      <NotSet>None</NotSet>
                    ) : (
                      "Default"
                    )}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Card>
  );
}

// ── One kind, on the Default tab ───────────────────────────────────────────

interface KindCardProps {
  kind: BlockKind;
  busy: boolean;
  editing: boolean;
  onEdit: (open: boolean) => void;
  act: (run: () => Promise<string | null>) => Promise<boolean>;
  setNotice: (notice: string | null) => void;
}

function DefaultKind({
  kind,
  lines,
  companies,
  blocks,
  busy,
  editing,
  onEdit,
  act,
  setNotice,
}: KindCardProps & {
  lines: readonly StandardBlock[];
  companies: readonly FirmEntity[];
  blocks: readonly StandardBlock[];
}) {
  const label = BLOCK_KIND_LABELS[kind];
  const own = companies.filter((c) => hasOwn(blocks, c.partyId, kind));
  const anyLive = lines.some((b) => b.isActive);
  return (
    <Card>
      <CardTitle level={2}>{label}</CardTitle>
      <div className="stack">
        <WherePrints kind={kind} />
        {/* The other half of the rule, said where the Default lines are: who
          these lines actually reach. Only when there ARE lines: "every company
          uses these lines" above "no standard lines yet" is two sentences
          disagreeing. */}
        {companies.length > 0 && anyLive && (
          <p className="text-md">
            {own.length === 0
              ? "Every company uses these lines."
              : `Every company uses these lines except ${names(own)}, which ${own.length === 1 ? "has its" : "have their"} own.`}
          </p>
        )}
        {!anyLive ? (
          <p className="text-md">No lines yet. New documents carry none.</p>
        ) : (
          <LineTable
            kind={kind}
            lines={lines.filter((b) => b.isActive)}
            whose="the Default"
            busy={busy}
            editing={editing}
            onEdit={onEdit}
            act={act}
            setNotice={setNotice}
          />
        )}
        <AddLine
          kind={kind}
          owner={{ kind: "default" }}
          count={lines.filter((b) => b.isActive).length}
          startOpen={false}
          busy={busy}
          act={act}
        />
        <Retired
          lines={lines}
          kind={kind}
          whose="the Default"
          hint="Restoring one puts it back on new documents."
          busy={busy}
          act={act}
          setNotice={setNotice}
        />
      </div>
    </Card>
  );
}

/** "A", "A and B", "A, B and C". */
function names(companies: readonly FirmEntity[]): string {
  const list = companies.map((c) => c.name);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1] ?? ""}`;
}

/** WHERE IT PRINTS, said on the card (0083). A partner writing a cover
 *  paragraph has to know it will never reach a quote, and the API refuses one
 *  written onto a quote by hand. */
function WherePrints({ kind }: { kind: BlockKind }) {
  if ((PROPOSAL_BLOCK_KINDS as readonly BlockKind[]).includes(kind)) return null;
  return (
    <p className="text-md text-ink-2">
      {/* Legal text, so nothing is written here for the firm. */}
      {kind === "cover"
        ? "Opens an engagement letter, after the salutation. Letters only."
        : "Printed above the client's signature on page one. Letters only."}
    </p>
  );
}

// ── One kind, on a company's tab ───────────────────────────────────────────

function CompanyKind({
  kind,
  company,
  own,
  inherited,
  busy,
  editing,
  onEdit,
  act,
  setNotice,
}: KindCardProps & {
  company: FirmEntity;
  /** This company's lines of the kind, retired ones included. */
  own: readonly StandardBlock[];
  /** The Default lines it uses while it has none of its own. */
  inherited: readonly StandardBlock[];
}) {
  const label = BLOCK_KIND_LABELS[kind];
  const lower = label.toLowerCase();
  const live = own.filter((b) => b.isActive);
  const usesOwn = live.length > 0;
  const owner: Owner = { kind: "company", company };

  /** Copy the Default lines of this kind into the company, as they are, and
   *  open them for editing. One call per line; if one is refused the ones
   *  already copied stay, and the card shows them. */
  async function writeOwn(): Promise<void> {
    const source = [...inherited].sort((a, b) => a.sortOrder - b.sortOrder);
    const ok = await act(async () => {
      for (const b of source) {
        const result = await api.POST("/api/v1/document-blocks/standard", {
          body: {
            kind,
            body: b.body,
            sortOrder: b.sortOrder,
            isHeading: b.isHeading,
            jurisdiction: b.jurisdiction,
            issuingEntityPartyId: company.partyId,
          },
        });
        if (result.error) return apiError(result.error).message;
      }
      return null;
    });
    if (ok) {
      setNotice(
        `${String(source.length)} ${source.length === 1 ? "line" : "lines"} copied to ${company.name}. Change the wording below and save it.`,
      );
      onEdit(true);
    }
  }

  /** Retire the company's own lines of this kind. Its next documents use the
   *  Default again; a document already drafted keeps what it copied. */
  async function backToDefault(): Promise<void> {
    const ok = await act(async () => {
      for (const b of live) {
        const result = await api.PATCH("/api/v1/document-blocks/standard/{blockId}", {
          params: { path: { blockId: b.id } },
          body: { isActive: false },
        });
        if (result.error) return apiError(result.error).message;
      }
      return null;
    });
    if (ok) {
      onEdit(false);
      setNotice(
        `${company.name} uses the Default ${lower} again. Documents already drafted keep the lines they have.`,
      );
    }
  }

  return (
    <Card>
      <CardHead
        title={label}
        level={2}
        aside={
          usesOwn ? (
            <Pill tone="neutral">{company.name}&rsquo;s own wording</Pill>
          ) : (
            <Pill tone="neutral">Using the default wording</Pill>
          )
        }
      />
      <div className="stack">
        <WherePrints kind={kind} />

        {usesOwn ? (
          <>
            <p className="text-md">Only these lines print on {company.name}&rsquo;s documents.</p>
            <LineTable
              kind={kind}
              lines={live}
              whose={company.name}
              busy={busy}
              editing={editing}
              onEdit={onEdit}
              act={act}
              setNotice={setNotice}
            />
            <AddLine
              kind={kind}
              owner={owner}
              count={live.length}
              startOpen={false}
              busy={busy}
              act={act}
            />
            <div className="stack" style={{ marginTop: "var(--s-3)" }}>
              {/* Retires the lines above; documents already drafted keep what
                  they copied. */}
              <p className="field-hint">New documents use the Default {lower} again.</p>
              <div className="cluster">
                <Button
                  variant="secondary"
                  disabled={busy}
                  aria-label={`Go back to the default ${lower} for ${company.name}`}
                  onClick={() => void backToDefault()}
                >
                  Go back to the default
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {inherited.length === 0 ? (
              <p className="text-md">
                The Default has none, so {company.name}&rsquo;s documents carry none.
              </p>
            ) : (
              <>
                <p className="text-md">Uses the Default lines:</p>
                <InheritedLines
                  lines={inherited}
                  label={`Default ${lower} used by ${company.name}`}
                />
                {/* Copies these lines to the company for it to change; from
                    then on only its own lines print for this kind. */}
                <div className="cluster">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Write ${company.name}'s own ${lower}`}
                    onClick={() => void writeOwn()}
                  >
                    Write this company&rsquo;s own
                  </Button>
                </div>
              </>
            )}
            {inherited.length === 0 && (
              <AddLine
                kind={kind}
                owner={owner}
                count={own.length}
                startOpen={false}
                busy={busy}
                act={act}
              />
            )}
          </>
        )}
        <Retired
          lines={own}
          kind={kind}
          whose={company.name}
          hint={
            usesOwn
              ? `Restoring one adds it back to ${company.name}'s own ${lower}.`
              : `Restoring one makes ${company.name} use its own ${lower} again, instead of the Default.`
          }
          busy={busy}
          act={act}
          setNotice={setNotice}
        />
      </div>
    </Card>
  );
}

/**
 * RETIRED, NEVER DELETED, and kept out of the way. A line a document was
 * written from stays listed, with Restore, but behind a disclosure: after
 * "Go back to the default" and "Write this company's own" the same three
 * sentences were on the card twice, once live and once retired.
 */
function Retired({
  lines,
  kind,
  whose,
  hint,
  busy,
  act,
  setNotice,
}: {
  lines: readonly StandardBlock[];
  kind: BlockKind;
  whose: string;
  hint: string;
  busy: boolean;
  act: (run: () => Promise<string | null>) => Promise<boolean>;
  setNotice: (notice: string | null) => void;
}) {
  const retired = lines.filter((b) => !b.isActive);
  if (retired.length === 0) return null;
  const lower = BLOCK_KIND_LABELS[kind].toLowerCase();
  const of = whose === "the Default" ? `the Default ${lower}` : `${whose}'s ${lower}`;
  return (
    <details className="disclosure">
      <summary>
        Retired lines of {of} ({String(retired.length)})
      </summary>
      <div className="stack">
        {/* Kept because documents drafted while they were in use copied them. */}
        <p className="text-md">{hint}</p>
        <LineTable
          kind={kind}
          lines={retired}
          whose={whose}
          tableLabel={`Retired lines of ${of}`}
          busy={busy}
          editing={false}
          onEdit={() => undefined}
          act={act}
          setNotice={setNotice}
        />
      </div>
    </details>
  );
}

/** The Default lines a company inherits, as they print: read-only, because
 *  changing them here would change them for every company. */
function InheritedLines({ lines, label }: { lines: readonly StandardBlock[]; label: string }) {
  return (
    <TableWrap>
      <Table aria-label={label}>
        <thead>
          <tr>
            <Th style={{ width: 70 }}>Order</Th>
            <Th>Line</Th>
            <Th style={{ width: 140 }}>Prints in</Th>
          </tr>
        </thead>
        <tbody>
          {[...lines]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((b) => (
              <tr key={b.id}>
                <Td>{b.sortOrder}</Td>
                <Td>{b.isHeading ? <strong>{b.body}</strong> : b.body}</Td>
                <Td>
                  <PrintsIn jurisdiction={b.jurisdiction} />
                </Td>
              </tr>
            ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function PrintsIn({ jurisdiction }: { jurisdiction: string | null }) {
  return jurisdiction === null ? (
    <>Everywhere</>
  ) : (
    <span title={jurisdiction}>{countryName(jurisdiction)} only</span>
  );
}

// ── The lines themselves ────────────────────────────────────────────────────

/**
 * One owner's lines of one kind: the order, the line, where it prints, and
 * Retire or Restore. "Change the wording" opens every live line as a text box
 * at once, which is also what "Write this company's own" lands on; Save sends
 * only the lines whose words changed.
 */
function LineTable({
  kind,
  lines,
  whose,
  tableLabel,
  busy,
  editing,
  onEdit,
  act,
  setNotice,
}: {
  kind: BlockKind;
  lines: readonly StandardBlock[];
  /** "the Default" or the company's name, for names and messages. */
  whose: string;
  /** Names the table when it is not the owner's live lines. */
  tableLabel?: string;
  busy: boolean;
  editing: boolean;
  onEdit: (open: boolean) => void;
  act: (run: () => Promise<string | null>) => Promise<boolean>;
  setNotice: (notice: string | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const label = BLOCK_KIND_LABELS[kind];
  const lower = label.toLowerCase();
  /** "the Default exclusions", "EPB Gulf FZE's exclusions". */
  const of = whose === "the Default" ? `the Default ${lower}` : `${whose}'s ${lower}`;
  const paragraph = PARAGRAPH_BLOCK_KINDS.includes(kind);
  const sorted = [...lines].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder,
  );
  const live = sorted.filter((b) => b.isActive);

  // The boxes open with the cursor in the first one: after "Write this
  // company's own" the next thing anybody does is change a word.
  useEffect(() => {
    if (!editing) return;
    formRef.current?.querySelector<HTMLElement>("textarea, input")?.focus();
  }, [editing]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // The words AND where the line prints. The second is not a nicety: the
    // Default "exclusive of GST" line is India only, so a Gulf company that
    // copies it and rewrites it as VAT has to be able to say it prints in the
    // UAE too, or the rewritten line never reaches a UAE proposal.
    const changed = live
      .map((b) => {
        const body = String(form.get(`line-${b.id}`) ?? "").trim();
        const where = String(form.get(`where-${b.id}`) ?? "");
        const jurisdiction = where === "" ? null : where;
        return {
          block: b,
          ...(body !== "" && body !== b.body ? { body } : {}),
          ...(jurisdiction !== b.jurisdiction ? { jurisdiction } : {}),
        };
      })
      .filter((c) => c.body !== undefined || c.jurisdiction !== undefined);
    if (changed.length === 0) {
      onEdit(false);
      return;
    }
    const ok = await act(async () => {
      for (const { block, ...change } of changed) {
        const result = await api.PATCH("/api/v1/document-blocks/standard/{blockId}", {
          params: { path: { blockId: block.id } },
          body: change,
        });
        if (result.error) return apiError(result.error).message;
      }
      return null;
    });
    if (ok) {
      onEdit(false);
      setNotice(
        `${String(changed.length)} ${changed.length === 1 ? "line" : "lines"} of ${of} saved. The next document uses the new wording.`,
      );
    }
  }

  function toggle(b: StandardBlock, isActive: boolean): void {
    void act(async () => {
      const result = await api.PATCH("/api/v1/document-blocks/standard/{blockId}", {
        params: { path: { blockId: b.id } },
        body: { isActive },
      });
      return result.error ? apiError(result.error).message : null;
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => void save(e)}>
      <TableWrap>
        <Table aria-label={tableLabel ?? of.charAt(0).toUpperCase() + of.slice(1)}>
          <thead>
            <tr>
              <Th style={{ width: 70 }}>Order</Th>
              <Th>Line</Th>
              <Th style={{ width: 180 }}>Prints in</Th>
              <Th style={{ width: 120 }}>
                <span className="sr-only">Retire or restore</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => (
              <tr key={b.id}>
                <Td>{b.sortOrder}</Td>
                <Td>
                  {editing && b.isActive ? (
                    paragraph ? (
                      <Textarea
                        name={`line-${b.id}`}
                        rows={4}
                        defaultValue={b.body}
                        aria-label={`${label}, line ${String(b.sortOrder)}`}
                        required
                      />
                    ) : (
                      <Input
                        name={`line-${b.id}`}
                        defaultValue={b.body}
                        aria-label={`${label}, line ${String(b.sortOrder)}`}
                        required
                      />
                    )
                  ) : (
                    <>
                      {/* A HEADING is a section title, not an item: the team
                          block is a table with headings, and without the
                          distinction it goes back to being one text blob. */}
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                      {b.isHeading && <span className="muted text-sm"> · heading</span>}
                    </>
                  )}
                </Td>
                <Td>
                  {editing && b.isActive ? (
                    <CountrySelect
                      name={`where-${b.id}`}
                      blankLabel="Every country"
                      defaultValue={b.jurisdiction ?? ""}
                      aria-label={`${label}, line ${String(b.sortOrder)}, prints in`}
                      style={{ width: "100%" }}
                    />
                  ) : (
                    <PrintsIn jurisdiction={b.jurisdiction} />
                  )}
                </Td>
                <Td style={{ textAlign: "right" }}>
                  {editing ? null : b.isActive ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      /* Nine of these read "Retire". Named by the LINE,
                         truncated: it is the only identity a block has that a
                         person would recognise. */
                      aria-label={`Retire the ${label.toLowerCase()} line “${b.body.slice(0, 60)}”`}
                      onClick={() => toggle(b, false)}
                    >
                      Retire
                    </Button>
                  ) : (
                    <span className="cluster" style={{ justifyContent: "flex-end" }}>
                      <Pill dot tone="danger">Retired</Pill>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        aria-label={`Restore the ${label.toLowerCase()} line “${b.body.slice(0, 60)}”`}
                        onClick={() => toggle(b, true)}
                      >
                        Restore
                      </Button>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {live.length > 0 && (
        <div className="cluster" style={{ marginTop: "var(--s-3)" }}>
          {editing ? (
            <>
              <Button type="submit" loading={busy} aria-label={`Save ${of}`}>
                Save the wording
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => onEdit(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              aria-label={`Change the wording of ${of}`}
              onClick={() => onEdit(true)}
            >
              Change the wording
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

/** A new line for one owner, behind "Add a line" so a tab of five kinds is
 *  not five open forms. Open from the start where the owner has no lines of
 *  the kind at all, because then adding one is the only thing to do. Named by
 *  the kind AND the owner: a company tab draws five of these. */
function AddLine({
  kind,
  owner,
  count,
  startOpen,
  busy,
  act,
}: {
  kind: BlockKind;
  owner: Owner;
  count: number;
  startOpen: boolean;
  busy: boolean;
  act: (run: () => Promise<string | null>) => Promise<boolean>;
}) {
  const label = BLOCK_KIND_LABELS[kind];
  const paragraph = PARAGRAPH_BLOCK_KINDS.includes(kind);
  const lower = label.toLowerCase();
  const of = owner.kind === "default" ? `the Default ${lower}` : `${owner.company.name}'s ${lower}`;
  return (
    <details className="disclosure" open={startOpen ? true : undefined}>
      <summary>{paragraph ? "Add a paragraph" : "Add a line"}</summary>
      <form
        action={(form) => {
          const jurisdiction = String(form.get("jurisdiction") ?? "");
          void act(async () => {
            const result = await api.POST("/api/v1/document-blocks/standard", {
              body: {
                kind,
                body: String(form.get("body") ?? ""),
                sortOrder: Number(form.get("order")),
                isHeading: form.get("heading") === "on",
                // Absent means "print everywhere", which is the ordinary case
                // and a different statement from any country code.
                ...(jurisdiction === "" ? {} : { jurisdiction }),
                ...(owner.kind === "company"
                  ? { issuingEntityPartyId: owner.company.partyId }
                  : {}),
              },
            });
            return result.error ? apiError(result.error).message : null;
          });
        }}
      >
        {/* NAMED, and no legend so nothing moves on screen: measured once,
            twelve controls answering to four names when three kinds drew
            this form. */}
        <fieldset className="fieldset" aria-label={`Add a line to ${of}`}>
          <FieldStack>
            {/* The line gets the whole width: it is a sentence, and a box a
                third of the card wide hid most of what was being typed. */}
            <Field label={paragraph ? "New paragraph" : "New line"}>
              {paragraph ? (
                <Textarea name="body" rows={3} required />
              ) : (
                <Input name="body" required />
              )}
            </Field>
            <FieldRow>
              <Field label="Order">
                <Input
                  name="order"
                  type="number"
                  min={1}
                  defaultValue={count + 1}
                  required
                  style={{ width: 90 }}
                />
              </Field>
              {/* No hint inside the row (the FieldRow rule). */}
              <Field label="Prints in">
                <CountrySelect name="jurisdiction" blankLabel="Every country" />
              </Field>
              <Checkbox label="Heading" name="heading" />
            </FieldRow>
            <div className="cluster">
              <Button
                type="submit"
                variant="secondary"
                disabled={busy}
                aria-label={`Add a line to ${of}`}
              >
                Add line
              </Button>
            </div>
          </FieldStack>
        </fieldset>
      </form>
    </details>
  );
}

/** Narrow the generated union without retyping it: the kinds come from the
 *  API's own schema, so a kind added there is a compile error here. */
export type { BlockKind };
