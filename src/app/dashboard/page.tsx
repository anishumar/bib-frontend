"use client";

/**
 * The firm's own numbers (T3.7) — MRR, what it is owed, and how long it waits.
 *
 * THE GAPS ARE NOT A FOOTNOTE, and that is the whole design of this screen.
 *
 * MRR is a headline number, and a headline number that silently drops what it
 * cannot understand is worse than no number at all — a partner reads it, acts on
 * it, and never learns that most of the firm's engagements contributed nothing.
 * The API returns what it could NOT count and why, and this screen shows that
 * immediately beside the figure rather than behind a disclosure. The first run
 * of this against real data found 1,490 engagements with no billing frequency
 * stated against 34 that counted, which is exactly the situation a tidier screen
 * would have hidden.
 *
 * EVERY FIGURE IS ALREADY IN ONE CURRENCY, converted at the rate stored on the
 * document it came from — never a rate looked up today, because that would
 * change last quarter's MRR every morning. So the currency is stated once, at
 * the top, and never repeated per row.
 *
 * DSO CAN BE NULL AND NULL IS NOT ZERO. "0 days" reads as excellent collections;
 * the truth when the firm has billed nothing in the window is that there is not
 * enough billing to say. Those render differently.
 *
 * ── Migrated to Tailwind, and what that did and did not change ──────────────
 *
 * Structure and words are untouched. What went is the hand-written markup this
 * screen had drifted into — `className="card"` with an inline
 * `marginBottom: var(--s-5)` on each one, `style={{ textAlign: "right" }}`
 * repeated on eleven cells, and a `<Link className="btn">`. Those are now
 * `<Card>`, `<Section>` and `align="right"` on the table primitives in
 * `@/components/tw`, so the next screen cannot spell any of them differently.
 *
 * The card headings stay `h2` — they are the four subjects of the page, not
 * items inside a section, which is what `level={2}` on `CardTitle` says.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AGEING_LABELS,
  MRR_GAP_HINTS,
  MRR_GAP_LABELS,
  api,
  apiError,
  formatMoney,
} from "@/lib/api/client";
import type { DashboardOverview, DashboardSlice } from "@/lib/api/client";
import { Tabs } from "@/components/ui";
import {
  Card,
  CardTitle,
  Notice,
  Page,
  PageHeader,
  Stat,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";

type Axis = "client" | "service";

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [axis, setAxis] = useState<Axis>("client");
  const axisTabs = useId();
  const [mrrSlices, setMrrSlices] = useState<readonly DashboardSlice[]>([]);
  const [owed, setOwed] = useState<readonly DashboardSlice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [head, byClient] = await Promise.all([
      api.GET("/api/v1/dashboard/overview", {}),
      api.GET("/api/v1/dashboard/receivables/by-client", {}),
    ]);
    if (head.response.status === 401) {
      router.push("/login");
      return;
    }
    if (head.error) {
      // Shown verbatim. The 403 here is the fee axis, and the API's message
      // explains that commercial visibility is a setting on the membership
      // separate from the role — which is not something this screen should
      // paraphrase, because it is the actual fix.
      setError(apiError(head.error).message);
      setLoaded(true);
      return;
    }
    setOverview(head.data);
    setOwed(byClient.data?.slices ?? []);
    setError(null);
    setLoaded(true);
  }, [router]);

  const loadAxis = useCallback(async (which: Axis): Promise<void> => {
    const result = await api.GET("/api/v1/dashboard/mrr/{axis}", {
      params: { path: { axis: which } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setMrrSlices(result.data.slices);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    void (async () => {
      await loadAxis(axis);
    })();
  }, [axis, loadAxis]);

  if (!loaded) {
    return (
      <Page>
        <p className="text-sm text-muted">Loading…</p>
      </Page>
    );
  }

  if (overview === null) {
    return (
      <Page>
        <PageHeader eyebrow="Commercial" title="The firm’s numbers" />
        <Notice tone="danger" role="alert">
          {error ?? "These figures could not be loaded."}
        </Notice>
      </Page>
    );
  }

  const cur = overview.currency;
  const totalGapEngagements = overview.mrr.gaps.reduce((n, g) => n + g.engagementCount, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="The firm’s numbers"
        lede={
          <>
            Everything here is worked out from the invoices and engagements themselves, each
            time you open this page. Nothing is stored, so nothing can drift — and every figure
            is in <strong className="text-ink">{cur}</strong>, converted at the rate recorded on
            the document it came from.
          </>
        }
      />

      {error !== null && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {/* ── What the firm earns, and what this number could not count ─────── */}
      <Card>
        <CardTitle level={2}>Monthly recurring revenue</CardTitle>
        <div className="mt-3">
          <Stat
            value={formatMoney(overview.mrr.monthly, cur)}
            note={
              <>
                from {overview.mrr.countedEngagements} engagement
                {overview.mrr.countedEngagements === 1 ? "" : "s"} the firm is billing on a
                repeating cycle
              </>
            }
          />
        </div>

        {overview.mrr.gaps.length > 0 && (
          <div className="mt-6">
            {/* Deliberately loud, and deliberately not collapsed. See the file
                header: this is the difference between a number a partner can
                act on and one that quietly misleads. */}
            <p className="mb-3 text-sm text-muted">
              <strong className="text-ink">
                {totalGapEngagements} active engagement{totalGapEngagements === 1 ? "" : "s"}{" "}
                {totalGapEngagements === 1 ? "is" : "are"} not in that figure.
              </strong>{" "}
              They are not missing revenue — they are revenue this number cannot honestly turn
              into a monthly amount. Each reason is different:
            </p>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Not counted</Th>
                    <Th align="right">Engagements</Th>
                    <Th>Why</Th>
                  </tr>
                </thead>
                <tbody>
                  {overview.mrr.gaps.map((g) => (
                    <tr key={g.reason}>
                      <Td>{MRR_GAP_LABELS[g.reason] ?? g.reason}</Td>
                      <Td align="right" className="mono">
                        {g.engagementCount}
                      </Td>
                      <Td className="text-muted">{MRR_GAP_HINTS[g.reason] ?? ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </Card>

      {/* ── The same money, split two ways ─────────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Where that revenue comes from</CardTitle>
        <div className="mt-3">
          <Tabs
            id={axisTabs}
            label="Split revenue by"
            value={axis}
            onChange={setAxis}
            tabs={[
              { value: "client", label: "By client" },
              { value: "service", label: "By service" },
            ]}
          />
        </div>
        {mrrSlices.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nothing to split — no engagement has a fee this can turn into a monthly figure yet.
          </p>
        ) : (
          <div className="mt-4">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{axis === "client" ? "Client" : "Service"}</Th>
                    <Th align="right">Per month</Th>
                    <Th align="right">Engagements</Th>
                  </tr>
                </thead>
                <tbody>
                  {mrrSlices.map((s) => (
                    <tr key={s.key}>
                      <Td>{s.label}</Td>
                      <Td align="right" className="mono">
                        {formatMoney(s.amount, cur)}
                      </Td>
                      <Td align="right" className="mono text-muted">
                        {s.count}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </Card>

      {/* ── What is owed, and how long it has been owed ────────────────────── */}
      <Card>
        <CardTitle level={2}>Owed to the firm</CardTitle>
        <div className="mt-3">
          <Stat
            value={formatMoney(overview.receivables.outstanding, cur)}
            note={
              overview.dsoDays === null ? (
                // NULL is not zero. See the file header.
                <>
                  Not enough billing in the last {overview.dsoWindowDays} days to say how long
                  the firm waits to be paid.
                </>
              ) : (
                <>
                  Paid on average{" "}
                  <strong className="text-ink">{overview.dsoDays} days</strong> after invoicing,
                  measured over the last {overview.dsoWindowDays} days.
                </>
              )
            }
          />
        </div>

        <div className="mt-6">
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>How overdue</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Invoices</Th>
                </tr>
              </thead>
              <tbody>
                {/* Every band, including the empty ones. "Nothing is more than 90
                    days overdue" is the most reassuring row on this table and it
                    has to be visible, not absent — and a table that changed shape
                    as debt moved would be unreadable week to week. */}
                {overview.receivables.bands.map((b) => (
                  <tr key={b.bucket}>
                    <Td>{AGEING_LABELS[b.bucket] ?? b.bucket}</Td>
                    <Td align="right" className="mono">
                      {b.invoiceCount === 0 ? (
                        <span className="text-faint">nothing</span>
                      ) : (
                        formatMoney(b.amount, cur)
                      )}
                    </Td>
                    <Td align="right" className="mono text-muted">
                      {b.invoiceCount}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      </Card>

      {/* ── And whose desk to go to about it ───────────────────────────────── */}
      <Card>
        <CardTitle level={2}>Who owes it</CardTitle>
        {owed.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing outstanding. Every issued invoice has been settled.
          </p>
        ) : (
          <div className="mt-3">
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th align="right">Outstanding</Th>
                    <Th align="right">Invoices</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {owed.map((s) => (
                    <tr key={s.key}>
                      <Td>{s.label}</Td>
                      <Td align="right" className="mono">
                        {formatMoney(s.amount, cur)}
                      </Td>
                      <Td align="right" className="mono text-muted">
                        {s.count}
                      </Td>
                      <Td align="right">
                        {/* Straight to the place somebody can DO something about it
                            — the dunning ladder, not just another number. A LINK,
                            and it stays an `<a>`: it goes somewhere, it does not
                            do something. */}
                        <Link
                          href="/receivables"
                          className="btn"
                          data-variant="secondary"
                          data-size="sm"
                        >
                          Chase
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </Card>
    </Page>
  );
}
