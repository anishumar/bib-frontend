"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { CountrySelect } from "@/components/country-select";
import {
  api,
  apiError,
  formatCount,
  formatMoney,
  PROPOSAL_STATUS_WORDS,
  readServiceBody,
} from "@/lib/api/client";
import type { ConfigEntry, ProposalRecord } from "@/lib/api/client";
import { Documents } from "@/lib/ui/documents";
import type { GroupCompany } from "@/lib/group";
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
  LinkButton,
  NotSet,
  Notice,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  type PillTone,
  AmountInput,
} from "@/components/ui";
import { totalWords } from "@/components/proposal-document";
import { QuantityField } from "@/components/quantity-field";
import { Loading } from "@/components/states";
import { longDay } from "@/lib/day";
import { Page, PageHeader, useSession } from "@/components/layout";
import { DeleteMistake, DeletedNotice } from "@/components/delete-mistake";
import { ConfirmAction } from "@/components/confirm-action";
import { CopyLineage } from "@/components/copy-as-draft";
import {
  ClientAnswer,
  ProposalPdf,
  ProposalSendPanel,
  useProposal,
} from "@/components/proposal-document";
import { cleanAmount } from "@/lib/money";

/** Somebody at the client a letter may be addressed to. */
interface Contact {
  readonly id: string;
  readonly name: string;
}

/**
 * One proposal: the document the client will read, and sending it (T6.18).
 *
 * THE DOCUMENT IS THE PAGE. `<ProposalPdf>` draws the proposal's own PDF
 * (2026-09-28): a draft as Send will print it, edited on the page, and a sent
 * one as the file the client was sent; `<ProposalSendPanel>` sits under it (email, WhatsApp, the PDF, and the
 * client's answer once it is out). Both take only the id and share one read of
 * the proposal (`useProposal`), which this page reads too, so a send turns the
 * document read-only and this page's own cards follow in the same instant.
 *
 * Everything else this page did stays, below the document and out of its way:
 * the client's recorded answer, writing an accepted quote up as a letter, the
 * services with their list and quoted prices (and adding or removing one),
 * the proposal's files, and deleting a draft made by mistake.
 *
 * Every rule belongs to the API and none is repeated here. Whether a discount
 * needs approval, whether this proposal may still be edited, whether it has
 * expired: all of them come back as a refusal with a message written to be
 * acted on, and this screen shows that message verbatim.
 */
export default function ProposalPage() {
  const router = useRouter();
  const params = useParams<{ proposalId: string }>();
  const proposalId = params.proposalId;
  const session = useSession();
  const { record, error: readError, loaded, signedOut, reload } = useProposal(proposalId);
  /** Set by the page that just copied a closed proposal into this draft when
   *  something did not come across (0316). A fact about that one act, so it
   *  travels in the URL and not on the record. */
  const copiedPartially = useSearchParams().get("copied") === "partial";

  /**
   * The companies a line with no company of its own could be filed against,
   * for writing an accepted quote up as a letter: the client this quote is FOR
   * and the companies its own page records under it, read from the API's own
   * `structure` (F-10-1), which is what writing the letter checks every line
   * against. Empty is the ordinary case and is handled as one.
   */
  const [entityChoices, setEntityChoices] = useState<GroupCompany[]>([]);
  /** Whom the letter may be addressed to: the people the client's structure
   *  records, the same read the API checks the choice against. */
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * WHICH CATALOGUE VERSION the add-a-line form is pointed at. Up here with the
   * other hooks: this component returns early while it is loading, and a hook
   * after an early return runs in a different order on the two paths.
   */
  const [picked, setPicked] = useState("");
  /** Bumped when a PDF is made or sent, so the files panel reads its list
   *  again (it reads it only on mount). */
  const [filesKey, setFilesKey] = useState(0);

  const partyId = record?.proposal.partyId ?? null;

  useEffect(() => {
    if (signedOut) router.push("/login");
  }, [signedOut, router]);

  // Published only. A service that exists as a draft was never in force, and
  // the API refuses to quote one.
  useEffect(() => {
    void api
      .GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } })
      .then((catalogue) => {
        if (catalogue.data) setServices(catalogue.data.entries.filter((e) => e.published !== null));
      });
  }, []);

  // The client's structure, for the letter write-up. A refusal here costs the
  // pickers and nothing else: the write-up then skips and reports.
  useEffect(() => {
    if (partyId === null) return;
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId } } })
      .then((structure) => {
        setContacts((structure.data?.people ?? []).map((p) => ({ id: p.id, name: p.displayName })));
        setEntityChoices(
          (structure.data?.entities ?? []).map((e) => ({
            id: e.id,
            name: e.displayName,
            // THE CLIENT ITSELF COMES FIRST: the API orders it so, and on a
            // quote for Cobalt Foods the commonest right answer is Cobalt Foods.
            relation: e.id === partyId ? "the client this quote is for" : "recorded under this client",
          })),
        );
      });
  }, [partyId]);

  /** Anything the document or the Send panel changed: the files panel may
   *  have a new PDF on it. The record itself is already current. */
  const changed = useCallback(() => {
    setFilesKey((k) => k + 1);
  }, []);

  /** Every mutation on this page funnels through here, so one place owns the
   *  busy flag, the error and the re-read. */
  async function act(key: string, call: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    await reload();
    setBusy(null);
  }

  function addLine(form: FormData): void {
    void act("add", () =>
      api.POST("/api/v1/proposals/{proposalId}/lines", {
        params: { path: { proposalId } },
        body: {
          serviceVersionId: String(form.get("serviceVersionId")),
          description: String(form.get("description")),
          quantity: cleanAmount(String(form.get("quantity"))),
          // A decimal STRING all the way from this input to the numeric column.
          unitAmount: cleanAmount(String(form.get("unitAmount"))),
          discountPercent: cleanAmount(String(form.get("discountPercent"))),
        },
      }),
    );
  }

  if (!loaded && record === null) return <Loading />;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger">{readError ?? "No such proposal."}</Notice>
      </Page>
    );
  }

  const { proposal, totals, lines } = record;
  // A draft deleted as a mistake (0086) is still a draft by status, and FINAL:
  // nothing on this page may be offered for it, so it is not a draft here.
  const deleted = proposal.deletedAt !== null;
  const isDraft = proposal.status === "draft" && !deleted;
  const permissions = session?.permissions ?? [];
  // What may be OFFERED. Drafting a letter from this quote is the same
  // permission as drafting one by hand, because that is what it is.
  const canWrite = permissions.includes("party:write");
  const pickedService = (() => {
    const entry = services.find((e) => e.published?.id === picked) ?? services[0];
    return entry === undefined ? null : readServiceBody(entry.published?.body);
  })();
  // How often the picked service is billed, as the catalogue says: the label
  // and the live fee of the quantity box follow it (F03).
  const pickedRecurrence = (() => {
    const entry = services.find((e) => e.published?.id === picked) ?? services[0];
    const raw = entry?.published?.body?.["recurrence"];
    return typeof raw === "string" ? raw : null;
  })();
  // COPY AS NEW DRAFT (0316): offered when the API says it would work, which
  // is a declined or expired proposal. The new draft is where the page goes.
  const canCopy = canWrite && record.copyRefusal === null;

  function copyAsDraft(): void {
    void act("copy", async () => {
      const result = await api.POST("/api/v1/proposals/{proposalId}/copy", {
        params: { path: { proposalId } },
      });
      if (!result.error) {
        const partial = result.data.skipped.length > 0 || result.data.addresseeDropped;
        router.push(`/proposals/${result.data.proposal.id}${partial ? "?copied=partial" : ""}` as Route);
      }
      return result;
    });
  }

  return (
    <Page>
      {/* The tab carries the reference for the same reason the header does: it
          is how a person names this document to anybody else. */}
      <title>{`${proposal.ref} · ${proposal.title}`}</title>
      {/* THE WAVE 4 SHAPE (2026-09-28): the reference is plain text in the
          line under the title (it was a typewriter eyebrow), the status a pill
          in words, and the header's buttons full size. */}
      <PageHeader
        title={<>{proposal.title}</>}
        lede={
          <span className="cluster tight">
            <span>
              {record.party.displayName} · {proposal.ref}
              {/* `valid_until` is a `date` column, so it is SPLIT and never parsed. */}
              {proposal.validUntil !== null && ` · valid until ${longDay(proposal.validUntil)}`}
            </span>
            <Pill dot tone={deleted ? "danger" : statusTone(proposal.status)}>
              {deleted ? "Deleted" : PROPOSAL_STATUS_WORDS[proposal.status]}
            </Pill>
          </span>
        }
        /* There is no history table: the ledger IS this proposal's timeline,
           scoped to this document, which is why it cannot live in the sidebar.
           "Send" jumps to the panel under the document, which on a long
           proposal is a screen or two down. A draft also opens in the builder
           (T6.18), on its services: the catalogue by country, ticked. */
        aside={
          <div className="cluster">
            {permissions.includes("ledger:read") && (
              <LinkButton variant="ghost" href={`/audit?type=proposal&id=${proposalId}`}>
                History
              </LinkButton>
            )}
            {isDraft && canWrite && (
              <LinkButton href={`/proposals/${proposalId}/build?step=services`}>
                Edit in the builder
              </LinkButton>
            )}
            {canCopy && (
              <ConfirmAction
                disabled={busy !== null}
                loading={busy === "copy"}
                title={`Copy ${proposal.ref} as a new draft?`}
                confirmLabel="Copy it"
                consequence={
                  <p>
                    A new draft gets every service, price, discount and note from {proposal.ref}.
                    You change what the client asked for, then send the new one. {proposal.ref}{" "}
                    stays exactly as the client saw it.
                  </p>
                }
                onConfirm={copyAsDraft}
              >
                Copy as new draft
              </ConfirmAction>
            )}
            {!deleted && (
              <Button
                variant={isDraft ? "primary" : "secondary"}
                onClick={() => {
                  const panel = document.getElementById(`send-${proposalId}`);
                  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
                  panel?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
                }}
              >
                {isDraft ? "Send" : "Where it stands"}
              </Button>
            )}
          </div>
        }
      />

      <ErrorNotice error={error} />

      <CopyLineage
        kind="proposal"
        from={
          record.copiedFrom === null
            ? null
            : { ...record.copiedFrom, statusWord: PROPOSAL_STATUS_WORDS[record.copiedFrom.status] }
        }
        copies={record.copies.map((c) => ({ ...c, statusWord: PROPOSAL_STATUS_WORDS[c.status] }))}
        partial={copiedPartially}
      />

      {proposal.deletedAt !== null && (
        <div className="max-w-[900px]">
          <DeletedNotice what="This draft" deletedAt={proposal.deletedAt} deletedBy={record.deletedBy}>
            It never went out. Its number {proposal.ref} is not used again.
          </DeletedNotice>
        </div>
      )}

      {/* The PDF, and on a draft its "Edit" list beside it: wider than the
          cards below, which keep the pages' own 900px column. */}
      <ProposalPdf proposalId={proposalId} editable={canWrite} onChanged={changed} />

      {/* One column, the pages' width, so every card below lines up with the
          document it is about rather than running past it. */}
      <div className="stack loose max-w-[900px]">
      <ProposalSendPanel proposalId={proposalId} onChanged={changed} />

      {record.clientDecision !== null && <ClientAnswer answer={record.clientDecision} />}

      {/* WHAT HAPPENS NEXT: an accepted quote becomes an engagement letter, and
          the agreed price carries across rather than being typed again. */}
      {proposal.status === "accepted" && canWrite && (
        <WriteItUp
          proposalId={proposalId}
          record={record}
          entityChoices={entityChoices}
          contacts={contacts}
          busy={busy}
          onDraft={(body) => {
            void act("letter", async () => {
              const result = await api.POST("/api/v1/proposals/{proposalId}/engagement-letter", {
                params: { path: { proposalId } },
                body,
              });
              // A WRITE TAKES YOU TO THE THING YOU MADE: the letter builder's
              // services step (T6.18 S6), with everything the quote agreed on
              // it and the skipped-line report carried along.
              if (!result.error) {
                const skipped = result.data.skipped.length;
                router.push(
                  `/engagement-letters/${result.data.letter.id}/build?step=services${skipped > 0 ? "&carried=partial" : ""}` as Route,
                );
              }
              return result;
            });
          }}
        />
      )}

      <ServicesAndPrices
        record={record}
        isDraft={isDraft}
        busy={busy}
        services={services}
        picked={picked}
        pickedService={pickedService}
        pickedRecurrence={pickedRecurrence}
        onPick={setPicked}
        onAdd={addLine}
        onRemove={(lineId) => {
          void act(lineId, () =>
            api.DELETE("/api/v1/proposals/{proposalId}/lines/{lineId}", {
              params: { path: { proposalId, lineId } },
            }),
          );
        }}
        totals={totals}
        lines={lines}
      />

      {/* THE PROPOSAL AS A FILE (0084): every PDF made of it, kept like any
          file. Not shown to the client's portal by default. */}
      <Documents
        // Remounted when the PDF of record changes (sending files it) or the
        // document or the Send panel made one: the panel reads its list only
        // on mount. An acceptance recorded with the client's email (0317)
        // filed one too.
        key={`${record.sentPdf?.versionId ?? "no-pdf-of-record"}-${String(filesKey)}-${record.recordedAcceptance?.id ?? "open"}`}
        subjectKind="proposal"
        subjectRef={proposalId}
        // A deleted draft gains nothing (0086): its files stay readable.
        canWrite={canWrite && !deleted}
        title="Proposal PDF"
        renderable="proposal"
        emptyHint="Generate one to read it as the client will."
      />

      <DeleteMistake
        title="Made by mistake?"
        intro={
          <p className="muted">Delete a draft started by mistake. Nobody outside the firm has seen it.</p>
        }
        label="Delete this draft"
        consequence={
          <>
            <p>{proposal.ref} leaves the list, and its number is not used again.</p>
            <p>The audit trail records that you deleted it. This cannot be undone.</p>
          </>
        }
        name={proposal.ref}
        refusal={record.deleteRefusal}
        explained={["PROPOSAL_CITED_BY_LETTER"]}
        canWrite={canWrite}
        onDelete={async () => {
          setError(null);
          const result = await api.DELETE("/api/v1/proposals/{proposalId}", {
            params: { path: { proposalId } },
          });
          if (result.error) {
            setError(apiError(result.error).message);
            return false;
          }
          await reload();
          return true;
        }}
      />
      </div>
    </Page>
  );
}

/**
 * The services on this quote with the catalogue's price beside what the firm
 * charged, and adding or removing one. Behind a disclosure: the document above
 * already reads every service and its fee, and this is the working view for
 * the one question the document does not answer (what was the list price
 * when this was quoted?) and for changing what is quoted.
 *
 * THE LIST PRICE AS IT WAS is what the pin exists to preserve: the archived
 * catalogue version still resolves, so a proposal reopened long after the
 * price list moved on still answers both halves of the question.
 */
function ServicesAndPrices({
  record,
  isDraft,
  busy,
  services,
  picked,
  pickedService,
  pickedRecurrence,
  onPick,
  onAdd,
  onRemove,
  totals,
  lines,
}: {
  record: ProposalRecord;
  isDraft: boolean;
  busy: string | null;
  services: readonly ConfigEntry[];
  picked: string;
  pickedService: ReturnType<typeof readServiceBody> | null;
  /** How often the picked service is billed (the quantity box's label). */
  pickedRecurrence: string | null;
  onPick: (versionId: string) => void;
  onAdd: (form: FormData) => void;
  onRemove: (lineId: string) => void;
  totals: ProposalRecord["totals"];
  lines: ProposalRecord["lines"];
}) {
  const { proposal } = record;
  return (
    <Card>
      <details className="disclosure">
        <summary>
          {isDraft ? "Services and list prices: add or remove" : "Services and list prices"}
        </summary>
        <div className="stack">
          {/* Seven columns of money, wrapped so the page never scrolls sideways. */}
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Line</Th>
                  <Th align="right">How many</Th>
                  <Th align="right">List price</Th>
                  <Th align="right">Quoted</Th>
                  <Th align="right">Discount</Th>
                  <Th align="right">Net</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      {l.description}
                      {/* The firm's own code and the catalogue version the line
                          is pinned to, never the service's system key. */}
                      {l.service !== null && (
                        <Sub>
                          {l.service.ref === null ? "" : `${l.service.ref} · `}catalogue version{" "}
                          {l.service.version}
                        </Sub>
                      )}
                    </Td>
                    <Td align="right">{formatCount(l.quantity)}</Td>
                    {/* When the catalogue prices in another currency the two
                        columns are NOT comparable, and the screen says so. */}
                    <Td align="right" className="nowrap">
                      {l.service?.listPrice ? (
                        <>
                          {formatMoney(l.service.listPrice.amount, l.service.listPrice.currency)}
                          {l.service.listPrice.currency !== l.currency && <Sub>Other currency</Sub>}
                        </>
                      ) : (
                        <NotSet>No list price</NotSet>
                      )}
                    </Td>
                    <Td align="right" className="nowrap">
                      {formatMoney(l.unitAmount, l.currency)}
                    </Td>
                    <Td align="right">
                      {l.discountPercent === null ? <NotSet>None</NotSet> : `${formatCount(l.discountPercent)}%`}
                    </Td>
                    <Td align="right" className="nowrap">
                      {formatMoney(l.net, l.currency)}
                    </Td>
                    <Td align="right">
                      {isDraft && (
                        /* NAMED BY THE LINE: six services draw six "Remove"s. */
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          aria-label={`Remove ${l.description} from this quote`}
                          onClick={() => {
                            onRemove(l.id);
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <Td colSpan={7} className="muted">
                      Nothing quoted yet.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </TableWrap>

          {/* PER FREQUENCY, AND A YEAR OF IT (CA#42). "Gross" added a monthly
              fee to a quarterly and a yearly one: a number nobody is billed.
              The fees per frequency are the database's sums, and the year is
              its annual value (monthly x 12, quarterly x 4, yearly), the
              answer to "what is this client worth a year?". */}
          <div style={{ textAlign: "right" }}>
            <div className="num text-lg strong">
              {(() => {
                const { withheld, sentence } = totalWords(record.totalsByFrequency, totals.currency);
                if (withheld) return <span className="text-muted">Fees not shown to you</span>;
                return sentence ?? <span className="text-muted">No fixed fee yet</span>;
              })()}
            </div>
            {record.annualValue !== null && (
              <div className="muted text-md">
                {formatMoney(record.annualValue, totals.currency)} a year from the fees that repeat
              </div>
            )}
          </div>

          {isDraft && (
            <form
              action={(form) => {
                onAdd(form);
              }}
            >
              <CardTitle className="card-part">Quote a service</CardTitle>
              <FieldStack>
                <FieldRow>
                  {/* PREFILLED AND EDITABLE, not locked: the wording is
                      routinely tailored per client and the price negotiated. */}
                  <Field label="From the catalogue" hint="Fills the wording and list price. You can change both.">
                    <Select
                      name="serviceVersionId"
                      required
                      value={picked}
                      onChange={(e) => {
                        onPick(e.target.value);
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
                  <Field label="As it reads on the document">
                    {/* KEYED ON THE PICK: `defaultValue` is read once at mount. */}
                    <Input key={`d-${picked}`} name="description" defaultValue={pickedService?.name ?? ""} required />
                  </Field>
                </FieldRow>
                <FieldRow>
                  {/* HOW MANY EACH PERIOD (F03): never a term in months. */}
                  <QuantityField frequency={pickedRecurrence} currency={proposal.currency} />
                  <Field label={`Unit price (${proposal.currency})`}>
                    {/* THE LIST PRICE ONLY WHEN IT IS IN THIS DOCUMENT'S OWN
                        CURRENCY: a number beside the wrong currency is worse
                        than an empty box. */}
                    <AmountInput
                      key={`u-${picked}`}
                      name="unitAmount"
                      defaultValue={
                        pickedService?.listPrice !== null &&
                        pickedService?.listPrice !== undefined &&
                        pickedService.listPrice.currency === proposal.currency
                          ? pickedService.listPrice.amount
                          : ""
                      }
                      required
                    />
                  </Field>
                  <Field label="Discount %">
                    <AmountInput decimals={4} name="discountPercent" defaultValue="0" required />
                  </Field>
                </FieldRow>
                <div className="cluster">
                  <Button type="submit" disabled={busy !== null}>
                    Add line
                  </Button>
                </div>
              </FieldStack>
            </form>
          )}
        </div>
      </details>
    </Card>
  );
}

/**
 * Write an accepted quote up as an engagement letter.
 *
 * ## The dead end this replaces
 *
 * Press "Client accepted" and the page had ZERO controls. It explained why
 * nothing on the quote can change any more, which is true and useful, and said
 * nothing about what happens next — so the letter was drafted from scratch and
 * the agreed price was typed a second time. Walked: ₹1,75,000, by hand, with
 * nothing in the system that would have caught a fourth digit.
 *
 * ## It says what will carry BEFORE it carries it
 *
 * The API reports which lines could not be copied and why; this screen says the
 * same thing in advance, because a firm about to create a contract should not
 * discover on the next page that two of its eight terms are missing. Both
 * halves are shown either way — a carry that silently dropped lines is worse
 * than one that never ran, since the letter LOOKS complete.
 *
 * ## The country field appears only when the quote cannot answer it
 *
 * A letter states ONE country and a proposal states one per line. When they
 * agree there is nothing to ask; when they disagree the field appears with the
 * reason, because that value settles governing law and the courts. Asking for
 * it every time would be a form field whose answer is already on the page.
 *
 * ## The cover letter's four facts come across too, and can be changed
 *
 * Title, addressee, Background and the day work begins are what page one of the
 * firm's letter is made of ("Sub: Engagement Letter for …", "Dear …", the
 * Background heading, "period commencing …"). The route has taken all four
 * since 0083 and this form sent none, so every letter drafted from a quote said
 * "Dear Sir or Madam," over no Background — while the quote it came from named
 * the person and held the paragraph. They are FILLED from the quote here, in the
 * boxes, before anybody presses: the letter may say something else, but a
 * reader should see what it will say rather than find out on the next page.
 */
function WriteItUp({
  record,
  entityChoices,
  contacts,
  busy,
  onDraft,
}: {
  proposalId: string;
  record: ProposalRecord;
  /** The client and its group — what a line with no company of its own can be
   *  filed against. Empty means the screen offers nothing and reports the
   *  skips. */
  entityChoices: readonly GroupCompany[];
  /** Who the letter may be addressed to — the client's people, the same list
   *  "Prepared for" offers and the API checks the choice against. */
  contacts: readonly Contact[];
  busy: string | null;
  onDraft: (body: {
    advanceRequired: boolean;
    advanceAmount?: string;
    jurisdiction?: string;
    title?: string;
    defaultEntityPartyId?: string;
    addressedToPartyId?: string;
    background?: string;
    effectiveFrom?: string;
  }) => void;
}) {
  const [advanceRequired, setAdvanceRequired] = useState(false);

  const countries = [
    ...new Set(
      record.lines
        .map((l) => l.jurisdiction)
        .filter((j): j is string => j !== null && j !== ""),
    ),
  ];
  // The API derives it when the lines agree, and refuses otherwise. The field
  // is offered on exactly that second case, starting at the issuer's country.
  const mustState = countries.length !== 1;
  const withoutEntity = record.lines.filter((l) => l.entityPartyId === null);
  const carrying = record.lines.length - withoutEntity.length;
  /**
   * WHICH COMPANY a line with none of its own is for. A client whose structure
   * holds ONE company is that company, so nobody is asked (T6.18 S6): the
   * only company a letter line could name is the client itself, which is not a
   * guess. With several, the picker is offered, unchosen, as before.
   */
  const onlyCompany = entityChoices.length === 1 ? (entityChoices[0]?.id ?? null) : null;
  const offerDefault = withoutEntity.length > 0 && entityChoices.length > 1;
  const defaultRequired = offerDefault && carrying === 0;
  const nothingToCarry = carrying === 0 && withoutEntity.length > 0 && entityChoices.length === 0;

  const lineWord = (n: number): string => `${String(n)} ${n === 1 ? "line" : "lines"}`;

  return (
    <Card>
      <CardTitle level={2}>Write it up as an engagement letter</CardTitle>
      <p className="muted">Services, prices and wording come across. You pick the terms.</p>

      {nothingToCarry ? (
        <Notice tone="warn" eyebrow="Nothing to carry">
          <p>
            No line on this quote says which company the work is for. Record the client&apos;s company on
            its page first.
          </p>
        </Notice>
      ) : (
        <>
          {offerDefault && (
            <Notice tone="warn" eyebrow={defaultRequired ? "Say which company" : "Some lines name no company"}>
              <p>
                {lineWord(withoutEntity.length)} {withoutEntity.length === 1 ? "does" : "do"} not say which
                company the work is for: {withoutEntity.map((l) => l.description).join(", ")}.
              </p>
            </Notice>
          )}

          <form
            action={(form) => {
              const text = (name: string): string => String(form.get(name) ?? "").trim();
              const j = text("jurisdiction");
              const amount = cleanAmount(text("advanceAmount"));
              const entity = onlyCompany ?? text("defaultEntityPartyId");
              const title = text("title");
              const addressee = text("addressedToPartyId");
              const background = text("background");
              const begins = text("effectiveFrom");
              onDraft({
                advanceRequired,
                ...(advanceRequired && amount !== "" ? { advanceAmount: amount } : {}),
                ...(j === "" ? {} : { jurisdiction: j.toUpperCase() }),
                // OMITTED WHEN EMPTY, never sent as "": absent means "file
                // nothing against a company nobody chose".
                ...(entity === "" || withoutEntity.length === 0 ? {} : { defaultEntityPartyId: entity }),
                ...(title === "" ? {} : { title }),
                ...(addressee === "" ? {} : { addressedToPartyId: addressee }),
                ...(background === "" ? {} : { background }),
                ...(begins === "" ? {} : { effectiveFrom: begins }),
              });
            }}
          >
            <FieldStack>
              {mustState && (
                <Field
                  label="Which country is this letter under?"
                  hint="A letter covers one country. It decides the terms."
                >
                  <CountrySelect
                    name="jurisdiction"
                    required
                    blankLabel="Choose the country"
                    defaultValue={record.issuer.jurisdiction ?? ""}
                  />
                </Field>
              )}

              {offerDefault && (
                <Field label={defaultRequired ? "Which company is this work for?" : "Which company are the other lines for?"}>
                  <Select name="defaultEntityPartyId" defaultValue="" required={defaultRequired}>
                    <option value="">
                      {defaultRequired ? "Choose a company" : `Leave them behind (${lineWord(withoutEntity.length)})`}
                    </option>
                    {entityChoices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.relation})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Checkbox
                label="Hold the work until an advance is paid"
                checked={advanceRequired}
                onChange={(e) => {
                  setAdvanceRequired(e.target.checked);
                }}
              />
              {advanceRequired && (
                <Field label="How much">
                  <AmountInput name="advanceAmount" required placeholder="e.g. 25,000" />
                </Field>
              )}

              {/* PAGE ONE OF THE LETTER, filled from the quote. Behind a
                  disclosure: every one of these is also editable in the
                  letter's own preview. */}
              <details>
                <summary className="cursor-pointer text-md">Change the subject, addressee or dates first</summary>
                <div className="mt-3">
                  <FieldStack>
                    <FieldRow>
                      <Field label="Subject">
                        <Input name="title" defaultValue={`Engagement Letter for ${record.party.displayName}`} />
                      </Field>
                      <Field label="Addressed to">
                        <Select
                          name="addressedToPartyId"
                          defaultValue={
                            contacts.some((c) => c.id === record.proposal.addressedToPartyId)
                              ? (record.proposal.addressedToPartyId ?? "")
                              : ""
                          }
                        >
                          <option value="">Nobody named (the company)</option>
                          {contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </FieldRow>
                    <Field label="Background" optional>
                      <Textarea name="background" rows={3} defaultValue={record.proposal.background ?? ""} />
                    </Field>
                    <Field label="Work begins" optional hint="Leave empty for the day it is signed.">
                      <Input name="effectiveFrom" type="date" />
                    </Field>
                  </FieldStack>
                </div>
              </details>

              <div className="cluster">
                <Button type="submit" loading={busy === "letter"}>
                  {busy === "letter" ? "Writing it up…" : "Write it up"}
                </Button>
              </div>
            </FieldStack>
          </form>
        </>
      )}
    </Card>
  );
}

/** Which pill a status wears, as on the proposals list: accepted is done,
 *  declined and expired are the same kind of fact, draft and sent neither. */
function statusTone(status: ProposalRecord["proposal"]["status"]): PillTone {
  if (status === "accepted") return "ok";
  return status === "rejected" || status === "expired" ? "danger" : "neutral";
}
