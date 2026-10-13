"use client";

import { useEffect, useId, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ProposalLine, ProposalRecord, ServiceAxis } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/tw";
import { Button, Pill, LinkButton, TabPanel, Tabs } from "@/components/ui";
import { deptTint } from "@/app/catalogue/service";
import { countryName } from "@/lib/country";
import { StickyFooter } from "./frame";
import { catalogueCountries, groupByDept, offeredIn } from "./data";
import type { CatalogueService } from "./data";
import { ServiceRow } from "./service-row";
import { FrequencyTotals } from "./totals";
import { fxSuggestion } from "@/lib/fx";
import { browserDay } from "@/lib/day";
import type { LineTerms } from "./service-row";

/**
 * STEP 2: which services, at what fee, with what scope. Services ONLY: the
 * exclusions, commercials and team are edited in the preview (step 3), where
 * each line has its pencil and "Add a line to …" — the same rows, read where
 * the client reads them (T6.18, 2026-09-28).
 *
 * A checkbox list rather than a form per line: the firm's own catalogue, one
 * country at a time (the issuer's first, D3), grouped by Dept and then by
 * delivery team, each row carrying its code, its name and its price in this
 * proposal's currency. Ticking adds the line at once; unticking removes it.
 * The step is the proposal itself, so a reload or a colleague's link shows
 * exactly what is on it.
 */
export function ServicesStep({
  record,
  catalogue,
  axes,
  canWrite,
  onChanged,
}: {
  record: ProposalRecord;
  catalogue: readonly CatalogueService[];
  axes: readonly ServiceAxis[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabsId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [reportingCurrency, setReportingCurrency] = useState<string | null>(null);
  useEffect(() => {
    void api.GET("/api/v1/firm-entities", {}).then((r) => {
      setReportingCurrency(r.data?.reportingCurrency ?? null);
    });
  }, []);

  /* NO RATES CARD (2026-10-10): a rate is added when a fee in another
     currency is, shown and changed inside that service's Edit, and taken off
     with its last fee. These two are what the rows need for it. */
  function rateOf(c: string): { rate: string; on: string; books: string } | null {
    if (reportingCurrency === null) return null;
    if (c === proposal.currency) {
      return proposal.fxRate === null ? null : { rate: proposal.fxRate, on: proposal.fxRateDate, books: reportingCurrency };
    }
    const r = proposal.rates.find((x) => x.currency === c);
    return r === undefined || r.fxRate === null ? null : { rate: r.fxRate, on: r.fxRateDate, books: reportingCurrency };
  }
  async function setRate(c: string, rate: string): Promise<string | null> {
    const put = await api.PUT("/api/v1/proposals/{proposalId}/rates/{currency}", {
      params: { path: { proposalId, currency: c } },
      body: { fxRate: rate, fxRateDate: browserDay() },
    });
    if (put.error) return apiError(put.error).message;
    await onChanged();
    return null;
  }

  const { proposal, lines } = record;
  const proposalId = proposal.id;
  const editable = proposal.status === "draft" && proposal.deletedAt === null && canWrite;
  // What a service may be priced in (0344): the main currency and each one
  // this proposal holds a rate for.
  const currencies = [proposal.currency, ...proposal.rates.map((r) => r.currency)];

  // The issuer's country first, then every other country the catalogue offers.
  const issuerCountry = record.issuer.jurisdiction;
  const offered = catalogueCountries(catalogue);
  const countries = [
    ...(issuerCountry === null ? [] : [issuerCountry]),
    ...offered.filter((c) => c !== issuerCountry),
  ];
  // The chip lives in the URL too, so a reload keeps the country in view.
  const asked = search.get("country");
  const country =
    asked !== null && countries.includes(asked) ? asked : (countries[0] ?? issuerCountry ?? "");

  function showCountry(next: string): void {
    const params = new URLSearchParams(search.toString());
    params.set("country", next);
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  const linesOf = (s: CatalogueService): ProposalLine[] =>
    lines.filter((l) => l.service?.key === s.key);

  /** One place owns the busy flag, the row's error and the reload. */
  async function act(key: string, call: () => Promise<string | null>): Promise<boolean> {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    const refused = await call();
    if (refused !== null) {
      setErrors((e) => ({ ...e, [key]: refused }));
      setBusy(null);
      return false;
    }
    await onChanged();
    setBusy(null);
    return true;
  }

  function bodyOf(s: CatalogueService, t: LineTerms, jurisdiction: string | null) {
    return {
      serviceVersionId: s.versionId,
      description: s.name,
      quantity: t.quantity,
      // B09: a login that cannot see fees lets the API pick the list price's
      // currency along with the price.
      ...(t.feesUnchanged === true ? {} : { currency: t.currency }),
      discountPercent: t.unitAmount === null ? "0" : t.discountPercent,
      // B09: a login that cannot see fees sends neither, and the API quotes
      // the catalogue's list price.
      ...(t.unitAmount === null || t.feesUnchanged === true ? {} : { unitAmount: t.unitAmount }),
      ...(t.pricingNote === null || t.feesUnchanged === true ? {} : { pricingNote: t.pricingNote }),
      ...(t.billingFrequency === null ? {} : { billingFrequency: t.billingFrequency }),
      // Where the work is: the country being quoted from, for a service
      // offered everywhere as much as for one offered in one place.
      ...(jurisdiction === null || jurisdiction === "" ? {} : { jurisdiction }),
      ...(t.overrides.scope === null ? {} : { scopeOverride: t.overrides.scope }),
      ...(t.overrides.clientObligations === null
        ? {}
        : { clientObligationsOverride: t.overrides.clientObligations }),
      ...(t.overrides.volumeLimits === null ? {} : { volumeLimitsOverride: t.overrides.volumeLimits }),
      ...(t.overrides.exclusions === null ? {} : { exclusionsOverride: t.overrides.exclusions }),
    };
  }

  /**
   * A service priced in a currency this proposal holds no rate for: the rate
   * is added first, from the same feed "Add a currency" uses, so ticking a
   * UAE service on an INR proposal adds it at its AED list price with no
   * detour (2026-10-10). The firm's own currency is 1. Null when it worked;
   * the sentence to show when no rate could be found.
   */
  async function ensureRate(currency: string): Promise<string | null> {
    if (currencies.includes(currency)) return null;
    let reporting = reportingCurrency;
    if (reporting === null) {
      const firm = await api.GET("/api/v1/firm-entities", {});
      reporting = firm.data?.reportingCurrency ?? null;
      setReportingCurrency(reporting);
    }
    const today = browserDay();
    const feed = currency === reporting ? null : await fxSuggestion(currency, today);
    if (currency !== reporting && feed === null) {
      return `No exchange rate for ${currency} today. Add it under Exchange rates below, then tick again.`;
    }
    const put = await api.PUT("/api/v1/proposals/{proposalId}/rates/{currency}", {
      params: { path: { proposalId, currency } },
      body:
        feed === null
          ? { fxRate: "1", fxRateDate: today }
          : { fxRate: feed.rate, fxRateDate: feed.on, source: feed.source },
    });
    return put.error ? apiError(put.error).message : null;
  }

  async function add(s: CatalogueService, t: LineTerms): Promise<boolean> {
    return act(s.key, async () => {
      if (t.feesUnchanged !== true) {
        const missing = await ensureRate(t.currency);
        if (missing !== null) return missing;
      }
      const result = await api.POST("/api/v1/proposals/{proposalId}/lines", {
        params: { path: { proposalId } },
        body: bodyOf(s, t, country),
      });
      return result.error ? apiError(result.error).message : null;
    });
  }

  async function remove(s: CatalogueService): Promise<boolean> {
    return act(s.key, async () => {
      const going = linesOf(s);
      for (const l of going) {
        const result = await api.DELETE("/api/v1/proposals/{proposalId}/lines/{lineId}", {
          params: { path: { proposalId, lineId: l.id } },
        });
        if (result.error) return apiError(result.error).message;
      }
      /* A rate added for this service goes with its last fee (2026-10-10),
         so "Exchange rates" never lists a currency nothing is priced in.
         Best effort: a rate that stays can still be removed by hand. */
      const left = lines.filter((l) => !going.includes(l));
      for (const c of new Set(going.map((l) => l.currency))) {
        if (c === proposal.currency || left.some((l) => l.currency === c)) continue;
        await api.DELETE("/api/v1/proposals/{proposalId}/rates/{currency}", {
          params: { path: { proposalId, currency: c } },
        });
      }
      return null;
    });
  }

  /**
   * Change a line already on the proposal, in place. Every field is sent, so
   * what the form shows is what the line says afterwards: a null fee is "no
   * fixed fee", a null frequency goes back to the service's own, and a null
   * scope block prints the catalogue's words again.
   */
  async function save(s: CatalogueService, line: ProposalLine, t: LineTerms): Promise<boolean> {
    return act(s.key, async () => {
      if (t.feesUnchanged !== true) {
        const missing = await ensureRate(t.currency);
        if (missing !== null) return missing;
      }
      const result = await api.PATCH("/api/v1/proposals/{proposalId}/lines/{lineId}", {
        params: { path: { proposalId, lineId: line.id } },
        body: {
          quantity: t.quantity,
          // B09: what a login that cannot see fees never saw, it does not send;
          // left out, the line keeps its fee, discount and note.
          ...(t.feesUnchanged === true
            ? {}
            : {
                unitAmount: t.unitAmount,
                currency: t.currency,
                discountPercent: t.unitAmount === null ? "0" : t.discountPercent,
                pricingNote: t.pricingNote,
              }),
          billingFrequency: t.billingFrequency,
          scopeOverride: t.overrides.scope,
          clientObligationsOverride: t.overrides.clientObligations,
          volumeLimitsOverride: t.overrides.volumeLimits,
          exclusionsOverride: t.overrides.exclusions,
        },
      });
      if (result.error) return apiError(result.error).message;
      // The currency it left, if nothing else is priced in it now.
      const was = line.currency;
      if (was !== t.currency && was !== proposal.currency && !lines.some((l) => l.id !== line.id && l.currency === was)) {
        await api.DELETE("/api/v1/proposals/{proposalId}/rates/{currency}", {
          params: { path: { proposalId, currency: was } },
        });
      }
      return null;
    });
  }

  const shown = offeredIn(catalogue, country);
  const groups = groupByDept(shown, axes);
  const count = lines.length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="form-card">
        <CardTitle level={2}>Services</CardTitle>
        {/* One line (Wave 4). A service priced in another currency, or with
            no list price, asks for the fee first; Details changes the fee,
            frequency and wording for this proposal only. */}
        <p className="mt-1 text-sm text-muted">Tick a service to add it at its list price.</p>

        {countries.length === 0 ? (
          <p className="mt-4 text-muted">
            The catalogue has no published services yet. Add them on the Catalogue screen.
          </p>
        ) : (
          <div className="mt-4">
            <Tabs
              id={tabsId}
              label="Countries"
              value={country}
              onChange={showCountry}
              tabs={countries.map((c) => {
                const n = lines.filter((l) => l.jurisdiction === c).length;
                return {
                  value: c,
                  label: countryName(c),
                  ...(n > 0 ? { count: n } : {}),
                };
              })}
            />
            <TabPanel tabsId={tabsId} value={country}>
              {groups.length === 0 ? (
                <p className="mt-4 text-muted">
                  Nothing in the catalogue is offered in {countryName(country)}.
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-5">
                  {groups.map((g) => (
                    <section key={g.code ?? "none"} aria-label={g.name} data-cat={deptTint(axes, g.code) ?? undefined}>
                      <h3 className="flex items-center gap-2 text-md font-semibold text-ink">
                        {g.code !== null && g.code !== g.name && (
                          <Pill cat={deptTint(axes, g.code) ?? 4}>{g.code}</Pill>
                        )}
                        {g.name}
                      </h3>
                      {g.teams.map((t) => (
                        <div key={t.code ?? "none"}>
                          {t.name !== null && (
                            <h4 className="pb-1 pt-2 text-sm font-semibold text-ink-2">
                              {t.name}
                            </h4>
                          )}
                          <ul className="service-list">
                            {t.services.map((s) => (
                              <ServiceRow
                                key={s.key}
                                service={s}
                                lines={linesOf(s)}
                                currency={proposal.currency}
                                currencies={currencies}
                                autoRate
                                rateOf={rateOf}
                                onRate={setRate}
                                editable={editable}
                                busy={busy === s.key}
                                error={errors[s.key] === "" ? null : (errors[s.key] ?? null)}
                                onAdd={(terms) => add(s, terms)}
                                onRemove={() => remove(s)}
                                onSave={(line, terms) => save(s, line, terms)}
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </TabPanel>
          </div>
        )}
      </Card>


      <StickyFooter
        summary={<FrequencyTotals record={record} />}
      >
        <LinkButton
          variant="ghost"
          href={`/proposals/${proposalId}/build?step=client` as Route}
        >
          Back
        </LinkButton>
        <Button
          type="button"
          disabled={count === 0}
          onClick={() => {
            router.push(`/proposals/${proposalId}/build?step=preview` as Route);
          }}
        >
          Next: Preview
        </Button>
      </StickyFooter>
    </div>
  );
}
