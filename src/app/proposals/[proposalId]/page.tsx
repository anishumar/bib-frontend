"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BLOCK_KIND_LABELS,
  api,
  apiError,
  formatCount,
  formatMoney,
  readServiceBody,
} from "@/lib/api/client";
import type { ConfigEntry, ProposalRecord } from "@/lib/api/client";
import { groupCompanies } from "@/lib/group";
import type { GroupCompany } from "@/lib/group";
import {
  Button,
  Card,
  CardTitle,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  LinkButton,
  Notice,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  useSwapFocus,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { browserDay, longDay, longInstant } from "@/lib/day";
import { Page, PageHeader } from "@/components/layout";

/**
 * One proposal: what was quoted, from which catalogue version, at what price.
 *
 * The screen the pin exists for. Each line shows the LIST PRICE as it was when
 * the line was quoted, beside what the firm actually charged — the archived
 * catalogue version still resolves, so a proposal reopened long after the price
 * list moved on still answers both halves of the question.
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

  const [record, setRecord] = useState<ProposalRecord | null>(null);
  /**
   * The companies a line with no company of its own could be filed against.
   *
   * The client this quote is FOR, and the companies its own page records as its
   * group — nothing else. A picker over the firm's whole book would offer a
   * different client's company as the counterparty on a contract, and a signed
   * letter naming the wrong legal entity is not a typo somebody notices later.
   *
   * Empty is the ordinary case and is handled as one: with nothing to offer,
   * the entity-less lines are skipped and REPORTED, which is what this screen
   * did before the picker existed.
   */
  const [entityChoices, setEntityChoices] = useState<GroupCompany[]>([]);
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * WHICH CATALOGUE VERSION the add-a-line form is pointed at.
   *
   * A `<select>` with a `defaultValue` and no state cannot tell anybody what
   * was chosen, which is why picking a service used to fill in nothing at all —
   * the price the option had just printed was then typed by hand underneath it.
   *
   * Up here with the other hooks and not beside the value it feeds: this
   * component returns early while it is loading, and a hook after an early
   * return runs in a different order on the two paths.
   */
  const [picked, setPicked] = useState("");
  const [loaded, setLoaded] = useState(false);
  // A decline in progress. The status already says a quote was lost; WHY is the
  // half worth anything later, and asking for it after the fact means asking
  // somebody who has moved on. So the button opens the box rather than posting.
  const [declining, setDeclining] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  // "Client declined" replaces itself with the reason form, so focus has to
  // be handed over and handed back. See `useSwapFocus`.
  const { panel: declinePanel, trigger: declineTrigger } = useSwapFocus(declining);

  const load = useCallback(async (): Promise<void> => {
    const [one, catalogue, me] = await Promise.all([
      api.GET("/api/v1/proposals/{proposalId}", { params: { path: { proposalId } } }),
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/auth/me", {}),
    ]);
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
    // The client's own profile, for the companies a line could be filed
    // against. A second round trip on a page that already makes three, and it
    // is worth it: the alternative is a picker over every party at the firm.
    // A refusal here costs the picker and nothing else — the screen falls back
    // to skipping and reporting, so this is never allowed to fail the page.
    const client = await api.GET("/api/v1/parties/{partyId}", {
      params: { path: { partyId: one.data.proposal.partyId } },
    });
    setEntityChoices(
      client.data === undefined
        ? []
        : [
            // THE CLIENT ITSELF FIRST, and it is not in `groupCompanies` —
            // that function returns the OTHER companies, because a party
            // cannot hold a relationship with itself. On a quote for Cobalt
            // Foods the commonest right answer is Cobalt Foods, so it must be
            // on the list and it must not be pre-chosen.
            {
              id: client.data.party.id,
              name: client.data.party.displayName,
              relation: "the client this quote is for",
            },
            ...groupCompanies(client.data, browserDay()),
          ],
    );
    // Published only. A service that exists as a draft was never in force, and
    // the API refuses to quote one — offering it here would be a dropdown entry
    // whose only outcome is an error.
    if (catalogue.data) {
      setServices(catalogue.data.entries.filter((e) => e.published !== null));
    }
    if (me.data) setPermissions(me.data.permissions);
    setError(null);
    setLoaded(true);
  }, [proposalId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Every mutation funnels through here, so one place owns the busy flag, the
   *  error and the reload. */
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

  function addLine(form: FormData): void {
    void act("add", () =>
      api.POST("/api/v1/proposals/{proposalId}/lines", {
        params: { path: { proposalId } },
        body: {
          serviceVersionId: String(form.get("serviceVersionId")),
          description: String(form.get("description")),
          quantity: String(form.get("quantity")),
          // A decimal STRING all the way from this input to the numeric column.
          // Parsing it to a number anywhere in between is the one thing this
          // whole path is arranged to avoid.
          unitAmount: String(form.get("unitAmount")),
          discountPercent: String(form.get("discountPercent")),
        },
      }),
    );
  }

  async function send(): Promise<void> {
    setBusy("send");
    setError(null);
    const result = await api.POST("/api/v1/proposals/{proposalId}/send", {
      params: { path: { proposalId } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(null);
      return;
    }
    // The link comes back ONCE — only its digest is stored, so this response is
    // the only place it can ever be read. Holding it in state rather than
    // re-fetching it is not a shortcut; there is nothing to re-fetch.
    setShareLink(`${window.location.origin}/p/${result.data.shareToken}`);
    await load();
    setBusy(null);
  }

  if (!loaded) return <Loading />;
  if (record === null) {
    return (
      <Page>
        <Notice tone="danger">{error ?? "No such proposal."}</Notice>
      </Page>
    );
  }

  const { proposal, totals, lines } = record;
  const isDraft = proposal.status === "draft";
  // The API decides whether an approval is needed; this only decides whether to
  // OFFER the button, from what /auth/me says the session holds. Somebody
  // without it still gets an accurate refusal — but not offering it is not the
  // same as refusing it afterwards.
  const canApprove = permissions.includes("proposal:approve");
  // What may be OFFERED. Drafting a letter from this quote is the same
  // permission as drafting one by hand, because that is what it is.
  const canWrite = permissions.includes("party:write");
  const pickedService = (() => {
    const entry = services.find((e) => e.published?.id === picked) ?? services[0];
    return entry === undefined ? null : readServiceBody(entry.published?.body);
  })();

  return (
    <Page>

      {/* The tab carries the reference for the same reason the header does: it
          is how a person names this document to anybody else. */}
      <title>{`${proposal.ref} — ${proposal.title}`}</title>
      {/* The firm's own number for this quote goes in the eyebrow. The uuid in
          the address bar is the system's name for it; this is the one a client
          quotes back. */}
      <PageHeader
        eyebrow={<span className="mono">{proposal.ref}</span>}
        title={<>{proposal.title}</>}
        lede={
          <>
            {record.party.displayName} · <Pill>{proposal.status}</Pill>
            {/* `valid_until` is a `date` column, so it is SPLIT and never
                parsed. It read `2026-10-31` here and on the client's own share
                page, which are the last two places on the product that still
                printed a raw one — the demo's proposals carry no expiry, so no
                walk had ever rendered it. */}
            {proposal.validUntil !== null && ` · valid until ${longDay(proposal.validUntil)}`}
          </>
        }
        /* There is no history table: the ledger IS this proposal's timeline —
           drafted, approved, sent, viewed, decided, each naming its actor. The
           sidebar's Audit trail is the WHOLE firm's; this one is scoped to this
           document, which is why it cannot live there. */
        aside={
          permissions.includes("ledger:read") ? (
            <LinkButton size="sm" href={`/audit?type=proposal&id=${proposalId}`}>
              History
            </LinkButton>
          ) : undefined
        }
      />

      <ErrorNotice error={error} />

      {shareLink !== null && (
        <Card>
          <CardTitle level={2}>The link to send</CardTitle>
          <p className="muted text-md">
            Shown once. Only its fingerprint is stored, so this page is the only place it can
            ever be read — send it again to issue a new one.
          </p>
          <p className="mono" style={{ wordBreak: "break-all" }} id="share-link">
            {shareLink}
          </p>
          {/* A COPY BUTTON, because the sentence above is not a figure of
              speech: this is ninety characters that can never be read again,
              and asking for them to be selected by hand is asking for a
              half-selected link to be pasted into an email. Found by sending
              a proposal and then looking for the copy control that was not
              there. `writeText` can be refused — a denied permission, a
              browser without the API — so the failure says so rather than
              looking like nothing happened. */}
          <div className="cluster">
            <Button
              variant="secondary"
              size="sm"
              aria-describedby="share-link"
              onClick={() => {
                void navigator.clipboard
                  .writeText(shareLink)
                  .then(() => { setCopied("done"); })
                  .catch(() => { setCopied("failed"); });
              }}
            >
              {copied === "done" ? "Copied" : "Copy the link"}
            </Button>
            {/* Polite, and it replaces its own text rather than adding a line,
                so the card does not grow the first time it is pressed. */}
            <span role="status" className="muted text-sm">
              {copied === "done"
                ? "On the clipboard."
                : copied === "failed"
                  ? "The browser refused the clipboard — select the link above and copy it by hand."
                  : ""}
            </span>
          </div>
        </Card>
      )}

      {/* Seven columns of money. Without a wrapper this table pushed the page
          440px sideways at 390 and 62px at 768 — detail routes were not in the
          sweep that measured the sidebar's twenty-seven. */}
      <Card>
        <TableWrap>
          <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th align="right">Qty</Th>
              <Th align="right">List then</Th>
              <Th align="right">Quoted</Th>
              <Th align="right">Disc.</Th>
              <Th align="right">Net</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <Td>
                  <div>{l.description}</div>
                  {l.service !== null && (
                    <div className="mono muted">
                      {l.service.key}@{l.service.version}
                    </div>
                  )}
                </Td>
                <Td align="right" className="mono">
                  {formatCount(l.quantity)}
                </Td>
                {/* The catalogue's price AS IT WAS — the thing the pin exists
                    to preserve. Null means the firm never listed one (a service
                    it quotes case by case), which is not the same as free, so it
                    reads as a dash.

                    When the catalogue prices in one currency and the quote is in
                    another, the two columns are NOT comparable and the screen
                    says so rather than letting them sit side by side looking as
                    though they are. Converting here would need a rate between
                    them, and the only rate this proposal carries goes to the
                    firm's reporting currency, not to the catalogue's. */}
                <Td align="right" className="mono muted">
                  {l.service?.listPrice ? (
                    <>
                      {formatMoney(l.service.listPrice.amount, l.service.listPrice.currency)}
                      {l.service.listPrice.currency !== l.currency && (
                        <div className="text-xs">not comparable</div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right" className="mono">
                  {formatMoney(l.unitAmount, l.currency)}
                </Td>
                <Td align="right" className="mono">
                  {l.discountPercent === null ? "—" : `${formatCount(l.discountPercent)}%`}
                </Td>
                <Td align="right" className="mono">
                  {formatMoney(l.net, l.currency)}
                </Td>
                <Td align="right">
                  {isDraft && (
                    /* NAMED BY THE LINE. The demo's one DRAFT proposal has a
                       single line, so this button has never been seen repeat —
                       its six-line sibling is already sent, which is what hides
                       it. A quote with six services draws six "Remove"s. */
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy !== null}
                      aria-label={`Remove ${l.description} from this quote`}
                      onClick={() => {
                        void act(l.id, () =>
                          api.DELETE("/api/v1/proposals/{proposalId}/lines/{lineId}", {
                            params: { path: { proposalId, lineId: l.id } },
                          }),
                        );
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

        <div style={{ textAlign: "right", marginTop: "var(--s-4)" }}>
          <div className="muted text-md">
            Gross {formatMoney(totals.gross, totals.currency)} · discount{" "}
            {formatMoney(totals.discount, totals.currency)}
          </div>
          <div className="mono text-lg">
            {formatMoney(totals.net, totals.currency)}
          </div>
        </div>
      </Card>

      {/* ── The proposal's own prose ────────────────────────────────────
          The exclusions and commercial notes this document carries, COPIED from
          the firm's standard set at drafting. A UAE proposal correctly has no
          Indian tax note: the copy filters by the client's country, so what is
          missing here is a decision rather than an omission. */}
      {record.blocks.length > 0 && (
        <Card>
          <CardTitle level={2}>Exclusions and notes</CardTitle>
          {(["exclusion", "commercial", "team"] as const).map((kind) => {
            const mine = record.blocks.filter((b) => b.kind === kind);
            if (mine.length === 0) return null;
            return (
              <div key={kind} style={{ marginBottom: "var(--s-4)" }}>
                <div className="label">{BLOCK_KIND_LABELS[kind]}</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {mine.map((b) => (
                    <li
                      key={b.id}
                      style={{
                        listStyle: b.isHeading ? "none" : undefined,
                        marginLeft: b.isHeading ? -18 : 0,
                      }}
                    >
                      {b.isHeading ? <strong>{b.body}</strong> : b.body}
                      {b.sourceId === null && (
                        <span className="muted text-xs">
                          {" "}
                          · this proposal&apos;s own
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>
      )}

      {isDraft && (
        <Card>
          <CardTitle level={2}>Quote a service</CardTitle>
          <form
            action={(form) => {
              addLine(form);
            }}
          >
            <FieldStack>
              <FieldRow>
                {/* IT FILLS THE TWO BOXES BESIDE IT NOW. Walked: picking
                    "Statutory audit — ₹1,75,000.00" left both the wording and
                    the price empty, so the figure the catalogue had just
                    printed in the option was typed in by hand underneath it.
                    The price is exactly what a catalogue exists to stop
                    somebody mistyping.

                    PREFILLED AND EDITABLE, not locked: the wording is
                    routinely tailored per client and the price is negotiated,
                    which is why the line stores its own copy of both rather
                    than pointing at the catalogue's. */}
                <Field
                  label="From the catalogue"
                  hint="Fills in the wording and the list price below. Change either — the line keeps its own copy, which is what makes this document readable years after the price list moves on."
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
                            ` — ${formatMoney(body.listPrice.amount, body.listPrice.currency)}`}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                <Field label="As it reads on the document">
                  {/* KEYED ON THE PICK. `defaultValue` is read once at mount,
                      so without the key a second choice would leave the first
                      one's wording in the box. */}
                  <Input
                    key={`d-${picked}`}
                    name="description"
                    defaultValue={pickedService?.name ?? ""}
                    required
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Quantity">
                  <Input name="quantity" defaultValue="1" required />
                </Field>
                <Field label={`Unit price (${proposal.currency})`}>
                  {/* THE LIST PRICE ONLY WHEN IT IS IN THIS DOCUMENT'S OWN
                      CURRENCY. A catalogue priced in USD on a rupee proposal
                      would otherwise put the number in the box with the wrong
                      currency beside it, which is worse than an empty field:
                      one is obviously unanswered, the other is quietly wrong. */}
                  <Input
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
                  <Input name="discountPercent" defaultValue="0" required />
                </Field>
              </FieldRow>
              <div className="cluster">
                <Button type="submit" disabled={busy !== null}>
                  Add line
                </Button>
              </div>
            </FieldStack>
          </form>
        </Card>
      )}

      <Card>
        <CardTitle level={2}>{isDraft ? "Send it" : "Where it stands"}</CardTitle>

        {proposal.discountApprovedAt !== null && (
          <p className="muted text-md">
            Discount signed off by{" "}
            {record.approvedBy?.displayName ?? record.approvedBy?.email ?? "a colleague"} on{" "}
            {longInstant(proposal.discountApprovedAt)}.
          </p>
        )}
        {proposal.firstViewedAt !== null && (
          <p className="muted text-md">
            First opened {longInstant(proposal.firstViewedAt)} · {proposal.viewCount}{" "}
            {proposal.viewCount === 1 ? "view" : "views"}.
          </p>
        )}

        <div className="cluster">
          {isDraft && canApprove && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                void act("approve", () =>
                  api.POST("/api/v1/proposals/{proposalId}/discount-approval", {
                    params: { path: { proposalId } },
                  }),
                );
              }}
            >
              Approve the discount
            </Button>
          )}
          {isDraft && (
            <Button loading={busy === "send"} disabled={busy !== null} onClick={() => void send()}>
              {busy === "send" ? "Sending…" : "Send"}
            </Button>
          )}
          {proposal.status === "sent" && !declining && (
            <>
              <Button
                disabled={busy !== null}
                onClick={() => {
                  void act("accepted", () =>
                    api.POST("/api/v1/proposals/{proposalId}/decision", {
                      params: { path: { proposalId } },
                      body: { decision: "accepted" },
                    }),
                  );
                }}
              >
                Client accepted
              </Button>
              <Button
                ref={declineTrigger}
                variant="destructive-quiet"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setDeclining(true);
                }}
              >
                Client declined
              </Button>
            </>
          )}
          {!isDraft && proposal.status !== "sent" && (
            <p className="muted text-md">
              This proposal is {proposal.status}. A client who comes back is a new quote — which
              is what keeps this one readable as what they were actually shown.
            </p>
          )}
        </div>
      </Card>

      {/* WHAT HAPPENS NEXT, and until now nothing did. Pressing "Client
          accepted" left a page with zero controls on it: it explained, well,
          why nothing can change — and said nothing about what to do now. The
          next thing IS an engagement letter, and the product neither said so
          nor offered it, so the agreed price was typed out again by hand. */}
      {proposal.status === "accepted" && canWrite && (
        <WriteItUp
          proposalId={proposalId}
          record={record}
          entityChoices={entityChoices}
          busy={busy}
          onDraft={(body) => {
            void act("letter", async () => {
              const result = await api.POST(
                "/api/v1/proposals/{proposalId}/engagement-letter",
                { params: { path: { proposalId } }, body },
              );
              // A WRITE TAKES YOU TO THE THING YOU MADE — this app's own rule,
              // and here it also carries the skipped-line report with it, so
              // nobody lands on a letter looking complete without being told
              // what did not come across.
              if (!result.error) {
                const skipped = result.data.skipped.length;
                router.push(
                  `/engagement-letters/${result.data.letter.id}${skipped > 0 ? "?carried=partial" : ""}`,
                );
              }
              return result;
            });
          }}
        />
      )}

      <Card>
        <div className="cluster">
        </div>

        {proposal.status === "sent" && declining && (
          <div ref={declinePanel} tabIndex={-1}>
          <form
            style={{ marginTop: "var(--s-4)" }}
            action={(form) => {
              const declinedReason = String(form.get("declinedReason") ?? "").trim();
              void act("rejected", () =>
                api.POST("/api/v1/proposals/{proposalId}/decision", {
                  params: { path: { proposalId } },
                  body: {
                    decision: "rejected",
                    // Only when there is one. The API records a reason on a
                    // rejection and nowhere else — a sentence about why they
                    // declined has no meaning on a quote they signed, and the
                    // schema refuses it there.
                    ...(declinedReason === "" ? {} : { declinedReason }),
                  },
                }),
              );
            }}
          >
            {/* The sentence under the box was a loose paragraph BELOW the
                buttons, wired to nothing — the same shape /leads had. As `hint`
                it is the box's own `aria-describedby`. */}
            <FieldStack>
              <Field
                label="Why did they say no?"
                hint="In the firm's own words. The status already says the quote was lost; this is the half worth anything next quarter, and it cannot be added later."
              >
                <Textarea
                  name="declinedReason"
                  rows={2}
                  autoFocus
                  placeholder="Went with their existing auditor on price."
                />
              </Field>
              <div className="cluster">
                <Button
                  variant="destructive-quiet"
                  size="sm"
                  type="submit"
                  disabled={busy !== null}
                >
                  Record the decline
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setDeclining(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </FieldStack>
          </form>
          </div>
        )}

        {proposal.status === "rejected" && (
          <>
            <p className="label" style={{ marginBottom: 2 }}>
              Why they said no
            </p>
            <p className="text-md">
              {proposal.declinedReason ?? (
                // Null on a rejection means nobody wrote one down, which is a
                // different silence from a quote that was never decided.
                <span className="muted">Not recorded — nobody was asked.</span>
              )}
            </p>
          </>
        )}
      </Card>
    </Page>
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
 */
function WriteItUp({
  proposalId,
  record,
  entityChoices,
  busy,
  onDraft,
}: {
  proposalId: string;
  record: ProposalRecord;
  /** The client and its group — what a line with no company of its own can be
   *  filed against. Empty means the screen offers nothing and reports the
   *  skips, which is exactly what it did before this existed. */
  entityChoices: readonly GroupCompany[];
  busy: string | null;
  onDraft: (body: {
    advanceRequired: boolean;
    advanceAmount?: string;
    jurisdiction?: string;
    title?: string;
    defaultEntityPartyId?: string;
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
  // is offered on exactly that second case.
  const mustState = countries.length !== 1;
  const withoutEntity = record.lines.filter((l) => l.entityPartyId === null);
  const carrying = record.lines.length - withoutEntity.length;
  /**
   * WHETHER THE PICKER IS OFFERED, AND WHETHER IT IS REQUIRED.
   *
   * Offered whenever a line names no company and there is a company to name.
   * REQUIRED when nothing at all would carry without it: the API refuses to
   * draw a reference number for a letter with no lines, so a button whose only
   * outcome is that refusal is worse than a field.
   *
   * This is the gap T3.5b left open and said so: the route has taken
   * `defaultEntityPartyId` since it shipped and no screen offered it, so a
   * quote whose lines named no company was a dead end on this page — the
   * notice sent people to /engagement-letters to retype the terms by hand,
   * which is the exact thing carrying the price forward was built to stop.
   */
  const offerDefault = withoutEntity.length > 0 && entityChoices.length > 0;
  const defaultRequired = offerDefault && carrying === 0;

  const lineWord = (n: number): string => `${String(n)} ${n === 1 ? "line" : "lines"}`;

  return (
    <Card>
      <CardTitle level={2}>Write it up as an engagement letter</CardTitle>
      <p className="muted">
        The terms come across as they were agreed — every line with its service, its wording,
        its quantity, its price and its discount, in this quote&rsquo;s own currency. Nothing is
        retyped, so nothing can be mistyped. The letter opens as a draft: its clauses are chosen
        from the library afterwards, against the country it is written under.
      </p>

      {carrying === 0 && !offerDefault ? (
        /* The API refuses this before drawing a reference number, so the screen
           says so rather than offering a button whose only outcome is a
           refusal. */
        <Notice tone="warn" eyebrow="Nothing to carry">
          <p>
            No line on this quote names the company the work is for. A letter line has to,
            because signing it creates an engagement — one service for one legal entity. A
            proposal may quote a prospect that holds no entity yet, which is exactly this case.
            Draft the letter from <Link href="/engagement-letters">Engagement letters</Link> and
            add the lines naming each company.
          </p>
        </Notice>
      ) : (
        <>
          {withoutEntity.length > 0 && !offerDefault && (
            <Notice tone="warn" eyebrow="Some lines stay behind">
              <p>
                {lineWord(carrying)} will carry across. {lineWord(withoutEntity.length)}{" "}
                {withoutEntity.length === 1 ? "names" : "name"} no company —{" "}
                {withoutEntity.map((l) => l.description).join(", ")} — and a letter line has
                to name one, because signing it creates an engagement for one legal entity. Add
                {withoutEntity.length === 1 ? " it" : " them"} to the letter by hand afterwards.
              </p>
            </Notice>
          )}
          {offerDefault && (
            <Notice tone="warn" eyebrow={defaultRequired ? "Say which company" : "Some lines name no company"}>
              <p>
                {lineWord(withoutEntity.length)}{" "}
                {withoutEntity.length === 1 ? "does" : "do"} not say which company the work is
                for — {withoutEntity.map((l) => l.description).join(", ")}. A letter line has
                to name one, because signing it creates an engagement, and one engagement is
                one service for one legal entity.{" "}
                {defaultRequired
                  ? "No line on this quote names a company, so the letter cannot be written until you say which one below."
                  : "Choose a company below and they come across too; leave it empty and they stay behind, and the letter says so when it opens."}
              </p>
            </Notice>
          )}

          {/* A FORM and its own FormData, not `document.querySelector`. This
              page already carries an "Amount" input on the add-a-line form, so
              a lookup by name would read whichever the document happened to
              hold first — the duplicate-id bug this repo fixed on the client
              screen, in a new costume. */}
          <form
            action={(form) => {
              const j = String(form.get("jurisdiction") ?? "").trim();
              const amount = String(form.get("advanceAmount") ?? "").trim();
              const entity = String(form.get("defaultEntityPartyId") ?? "").trim();
              onDraft({
                advanceRequired,
                ...(advanceRequired && amount !== "" ? { advanceAmount: amount } : {}),
                ...(j === "" ? {} : { jurisdiction: j.toUpperCase() }),
                // OMITTED WHEN EMPTY, never sent as "". Absent means "file
                // nothing against a company nobody chose", which is the API's
                // own default and the safe one on a document somebody signs.
                ...(entity === "" ? {} : { defaultEntityPartyId: entity }),
              });
            }}
          >
          <FieldStack>
            {mustState && (
              <Field
                label="Which country is this letter under?"
                hint={
                  countries.length === 0
                    ? "No line on this quote says where the work is, and a letter states one for the whole document — it settles governing law, the courts, and which of your own companies contracts."
                    : `This quote covers ${countries.join(" and ")}. A letter states ONE country because that is what decides its governing law, so either say which this one is under, or write one letter per country.`
                }
              >
                <Input name="jurisdiction" maxLength={2} placeholder="IN" />
              </Field>
            )}

            {offerDefault && (
              <Field
                label={
                  defaultRequired
                    ? "Which company is this work for?"
                    : "Which company are the remaining lines for? (optional)"
                }
                hint="The client this quote is for, and the companies its own page records as its group — nothing else is offered, because a letter line names the counterparty on a contract. Every line that already names a company keeps the one it names; this only fills the blanks."
              >
                {/* NO PRE-SELECTED COMPANY, EVEN WHEN THERE IS ONLY ONE. The
                    API's own words: a guessed party on a signed page is
                    indistinguishable from one somebody agreed to. A default
                    here would be the product choosing a counterparty. */}
                <Select name="defaultEntityPartyId" defaultValue="" required={defaultRequired}>
                  <option value="">
                    {defaultRequired
                      ? "Choose a company"
                      : `Leave them behind — ${lineWord(withoutEntity.length)} will not carry`}
                  </option>
                  {entityChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.relation}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {/* THE ADVANCE IS THE FIRM'S DECISION AND NOT THE QUOTE'S — a
                proposal has no advance, so there is nothing here to inherit
                and the field starts empty rather than at zero. */}
            <label className="check">
              <input
                type="checkbox"
                checked={advanceRequired}
                onChange={(e) => {
                  setAdvanceRequired(e.target.checked);
                }}
              />
              <span>Hold the work until an advance is received</span>
            </label>
            {advanceRequired && (
              <Field
                label="How much"
                hint="Every engagement this letter opens stays closed until somebody records the advance as received."
              >
                <Input name="advanceAmount" inputMode="decimal" />
              </Field>
            )}

            <div className="cluster">
              <Button type="submit" loading={busy === "letter"}>
                {busy === "letter" ? "Drafting…" : "Draft the engagement letter"}
              </Button>
              <p className="field-hint">
                {lineWord(carrying)} carried at the price this client agreed. The
                quote stays exactly as it is — it is the record of what they were shown.
              </p>
            </div>
          </FieldStack>
          </form>
        </>
      )}
    </Card>
  );
}
