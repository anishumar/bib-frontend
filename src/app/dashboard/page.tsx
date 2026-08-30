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
import { Tabs, Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

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

  if (!loaded) return <p className="muted">Loading…</p>;

  if (overview === null) {
    return (
      <Page>
        <PageHeader
          eyebrow="Commercial"
          title="The firm&rsquo;s numbers"
        />
        <p className="notice" data-tone="danger" role="alert">{error ?? "These figures could not be loaded."}</p>
      </Page>
    );
  }

  const cur = overview.currency;
  const totalGapEngagements = overview.mrr.gaps.reduce((n, g) => n + g.engagementCount, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title={<>The firm&rsquo;s numbers</>}
        lede={
          <>
            Everything here is worked out from the invoices and engagements themselves, each
            time you open this page. Nothing is stored, so nothing can drift — and every figure
            is in <strong>{cur}</strong>, converted at the rate recorded on the document it
            came from.
          </>
        }
      />

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-title">Monthly recurring revenue</h2>
        <p className="figure">
          {formatMoney(overview.mrr.monthly, cur)}
        </p>
        <p className="muted">
          from {overview.mrr.countedEngagements} engagement
          {overview.mrr.countedEngagements === 1 ? "" : "s"} the firm is billing on a repeating
          cycle
        </p>

        {overview.mrr.gaps.length > 0 && (
          <div style={{ marginTop: "var(--s-5)" }}>
            {/* Deliberately loud, and deliberately not collapsed. See the file
                header: this is the difference between a number a partner can
                act on and one that quietly misleads. */}
            <p className="field-hint">
              <strong>
                {totalGapEngagements} active engagement{totalGapEngagements === 1 ? "" : "s"} are
                not in that figure.
              </strong>{" "}
              They are not missing revenue — they are revenue this number cannot honestly turn
              into a monthly amount. Each reason is different:
            </p>
            <table className="table">
              <thead>
                <tr>
                  <Th>Not counted</Th>
                  <Th style={{ textAlign: "right" }}>Engagements</Th>
                  <Th>Why</Th>
                </tr>
              </thead>
              <tbody>
                {overview.mrr.gaps.map((g) => (
                  <tr key={g.reason}>
                    <Td>{MRR_GAP_LABELS[g.reason] ?? g.reason}</Td>
                    <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {g.engagementCount}
                    </Td>
                    <Td className="muted">{MRR_GAP_HINTS[g.reason] ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <div className="card-head">
          <h2 className="card-title">Where that revenue comes from</h2>
        </div>
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
        {mrrSlices.length === 0 ? (
          <p className="muted">
            Nothing to split — no engagement has a fee this can turn into a monthly figure yet.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <Th>{axis === "client" ? "Client" : "Service"}</Th>
                <Th style={{ textAlign: "right" }}>Per month</Th>
                <Th style={{ textAlign: "right" }}>Engagements</Th>
              </tr>
            </thead>
            <tbody>
              {mrrSlices.map((s) => (
                <tr key={s.key}>
                  <Td>{s.label}</Td>
                  <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(s.amount, cur)}
                  </Td>
                  <Td style={{ textAlign: "right" }} className="muted">
                    {s.count}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-title">Owed to the firm</h2>
        <p className="figure">
          {formatMoney(overview.receivables.outstanding, cur)}
        </p>
        <p className="muted">
          {overview.dsoDays === null ? (
            // NULL is not zero. See the file header.
            <>
              Not enough billing in the last {overview.dsoWindowDays} days to say how long the
              firm waits to be paid.
            </>
          ) : (
            <>
              Paid on average <strong>{overview.dsoDays} days</strong> after invoicing, measured
              over the last {overview.dsoWindowDays} days.
            </>
          )}
        </p>

        <table className="table">
          <thead>
            <tr>
              <Th>How overdue</Th>
              <Th style={{ textAlign: "right" }}>Amount</Th>
              <Th style={{ textAlign: "right" }}>Invoices</Th>
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
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {b.invoiceCount === 0 ? (
                    <span className="unstated">nothing</span>
                  ) : (
                    formatMoney(b.amount, cur)
                  )}
                </Td>
                <Td style={{ textAlign: "right" }} className="muted">
                  {b.invoiceCount}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title">Who owes it</h2>
        {owed.length === 0 ? (
          <p className="muted">
            Nothing outstanding. Every issued invoice has been settled.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <Th>Client</Th>
                <Th style={{ textAlign: "right" }}>Outstanding</Th>
                <Th style={{ textAlign: "right" }}>Invoices</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {owed.map((s) => (
                <tr key={s.key}>
                  <Td>{s.label}</Td>
                  <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(s.amount, cur)}
                  </Td>
                  <Td style={{ textAlign: "right" }} className="muted">
                    {s.count}
                  </Td>
                  <Td style={{ textAlign: "right" }}>
                    {/* Straight to the place somebody can DO something about it
                        — the dunning ladder, not just another number. */}
                    <Link href="/receivables" className="btn" data-variant="secondary" data-size="sm">
                      Chase
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
