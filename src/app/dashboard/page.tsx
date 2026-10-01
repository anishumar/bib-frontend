"use client";

/**
 * The firm's own numbers (T3.7) — MRR, what it is owed, and how many days of
 * billing that is (DSO: a ratio, not an observed payment time).
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
 * the truth when the firm has billed nothing in the window is that there is
 * nothing to compare what is owed with. Those render differently.
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
  codeLabel,
  formatMoney,
} from "@/lib/api/client";
import type {
  DashboardOverview,
  DashboardSlice,
  RevenueByCompany,
  RevenueByManager,
} from "@/lib/api/client";
import { NotSet, TabPanel, Tabs } from "@/components/ui";
import {
  Card,
  CardTitle,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Stat,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { BillingByCompany } from "./billing-by-company";
import { RevenueByManagerSection } from "./revenue-by-manager";

type Axis = "client" | "service";

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [axis, setAxis] = useState<Axis>("client");
  const axisTabs = useId();
  const [mrrSlices, setMrrSlices] = useState<readonly DashboardSlice[]>([]);
  const [owed, setOwed] = useState<readonly DashboardSlice[]>([]);
  const [billing, setBilling] = useState<RevenueByCompany | null>(null);
  const [byManager, setByManager] = useState<RevenueByManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [head, byClient, byCompany, managers] = await Promise.all([
      api.GET("/api/v1/dashboard/overview", {}),
      api.GET("/api/v1/dashboard/receivables/by-client", {}),
      api.GET("/api/v1/dashboard/revenue/by-company", { params: { query: { months: 12 } } }),
      api.GET("/api/v1/dashboard/revenue/by-manager", { params: { query: { months: 12 } } }),
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
    setBilling(byCompany.data ?? null);
    setByManager(managers.data ?? null);
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
      {/* Wave 4: no eyebrow, and the lede is the one fact the page must say
          once: the currency (every figure is converted at the rate stored on
          its own document, worked out fresh on every visit). */}
      <PageHeader
        title="The firm’s numbers"
        lede={
          <>
            All figures in <strong className="text-ink">{cur}</strong>, at each document&apos;s own
            rate.
          </>
        }
      />

      <ErrorNotice error={error} />

      {/* ── What the firm earns, and what this number could not count ─────── */}
      <Card>
        <CardTitle level={2}>Monthly recurring revenue</CardTitle>
        <div className="mt-3">
          <Stat
            value={formatMoney(overview.mrr.monthly, cur)}
            figure={{ amount: overview.mrr.monthly, currency: cur }}
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
              Their fees cannot be made monthly:
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
                      <Td>{codeLabel(MRR_GAP_LABELS[g.reason] ?? g.reason)}</Td>
                      <Td align="right">{g.engagementCount}</Td>
                      <Td>{MRR_GAP_HINTS[g.reason] ?? ""}</Td>
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
        {/* THE PANEL IS WHAT THE TAB CONTROLS, and it has to be a real element
            with the id `<Tabs>` promises — the split table was a loose sibling
            of the tablist, so "By client" and "By service" both pointed
            `aria-controls` at nothing. */}
        <TabPanel tabsId={axisTabs} value={axis}>
        {mrrSlices.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing to split yet.</p>
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
                      <Td align="right" className="nowrap">
                        {formatMoney(s.amount, cur)}
                      </Td>
                      <Td align="right">{s.count}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
        </TabPanel>
      </Card>

      {/* ── What is owed, and how long it has been owed ────────────────────── */}
      <Card>
        <CardTitle level={2}>Owed to the firm</CardTitle>
        <div className="mt-3">
          <Stat
            value={formatMoney(overview.receivables.outstanding, cur)}
            figure={{ amount: overview.receivables.outstanding, currency: cur }}
            note={
              overview.dsoDays === null ? (
                // NULL is not zero. See the file header.
                <>Nothing billed in the last {overview.dsoWindowDays} days to compare it with.</>
              ) : (
                // WHAT THE FIGURE IS, not what it sounds like. DSO is what is
                // owed divided by what was billed (less credit notes) in the
                // window, times its days. It read "Paid on average 45.6 days
                // after invoicing" on a firm whose every invoice was raised
                // that day and nothing was paid late: nothing was observed.
                <>
                  What is owed equals about{" "}
                  <strong className="text-ink">{overview.dsoDays} days</strong> of billing (last{" "}
                  {overview.dsoWindowDays} days).
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
                    <Td align="right" className="nowrap">
                      {b.invoiceCount === 0 ? <NotSet>Nothing</NotSet> : formatMoney(b.amount, cur)}
                    </Td>
                    <Td align="right">{b.invoiceCount}</Td>
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
          <p className="mt-3 text-sm text-muted">Nothing outstanding.</p>
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
                      <Td align="right" className="nowrap">
                        {formatMoney(s.amount, cur)}
                      </Td>
                      <Td align="right">{s.count}</Td>
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

      {/* ── What each company billed, month by month (Wave 5) ──────────────── */}
      {billing !== null && billing.companies.length > 0 && <BillingByCompany data={billing} />}

      {/* ── Whose invoices those were (auto-invoice T4) ──────────────────── */}
      {byManager !== null && <RevenueByManagerSection data={byManager} />}
    </Page>
  );
}
