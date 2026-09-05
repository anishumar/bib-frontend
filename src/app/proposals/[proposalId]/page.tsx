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
} from "@/components/ui";
import { Loading } from "@/components/states";
import { longDay, longInstant } from "@/lib/day";
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
  const [services, setServices] = useState<ConfigEntry[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // A decline in progress. The status already says a quote was lost; WHY is the
  // half worth anything later, and asking for it after the fact means asking
  // somebody who has moved on. So the button opens the box rather than posting.
  const [declining, setDeclining] = useState(false);

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
          <p className="mono" style={{ wordBreak: "break-all" }}>{shareLink}</p>
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
                <Field label="From the catalogue">
                  <Select name="serviceVersionId" required>
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
                  <Input name="description" required />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Quantity">
                  <Input name="quantity" defaultValue="1" required />
                </Field>
                <Field label={`Unit price (${proposal.currency})`}>
                  <Input name="unitAmount" required />
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

        {proposal.status === "sent" && declining && (
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
