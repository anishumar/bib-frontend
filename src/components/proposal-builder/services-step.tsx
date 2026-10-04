"use client";

import { useId, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ProposalLine, ProposalRecord, ServiceAxis } from "@/lib/api/client";
import { Card, CardTitle } from "@/components/tw";
import { Button, LinkButton, TabPanel, Tabs } from "@/components/ui";
import { countryName } from "@/lib/country";
import { StickyFooter } from "./frame";
import { catalogueCountries, groupByDept, offeredIn } from "./data";
import type { CatalogueService } from "./data";
import { ServiceRow } from "./service-row";
import { FrequencyTotals } from "./totals";
import { CurrencyRates } from "@/components/currency-rates";
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

  async function add(s: CatalogueService, t: LineTerms): Promise<boolean> {
    return act(s.key, async () => {
      const result = await api.POST("/api/v1/proposals/{proposalId}/lines", {
        params: { path: { proposalId } },
        body: bodyOf(s, t, country),
      });
      return result.error ? apiError(result.error).message : null;
    });
  }

  async function remove(s: CatalogueService): Promise<boolean> {
    return act(s.key, async () => {
      for (const l of linesOf(s)) {
        const result = await api.DELETE("/api/v1/proposals/{proposalId}/lines/{lineId}", {
          params: { path: { proposalId, lineId: l.id } },
        });
        if (result.error) return apiError(result.error).message;
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
      return result.error ? apiError(result.error).message : null;
    });
  }

  const shown = offeredIn(catalogue, country);
  const groups = groupByDept(shown, axes);
  const count = lines.length;

  return (
    <div className="flex flex-col gap-6">
      <CurrencyRates
        kind="proposal"
        documentId={proposalId}
        main={proposal.currency}
        rates={proposal.rates}
        inUse={(c) => lines.filter((l) => l.currency === c).length}
        editable={editable}
        onChanged={onChanged}
      />
      <Card>
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
                <div className="mt-2 flex flex-col gap-6">
                  {groups.map((g) => (
                    <section key={g.code ?? "none"} aria-label={g.name}>
                      <h3 className="border-b border-line pb-2 pt-3 text-md font-semibold text-ink">
                        {g.code !== null && g.code !== g.name && (
                          <span className="mr-2 text-sm text-ink-2">{g.code}</span>
                        )}
                        {g.name}
                      </h3>
                      {g.teams.map((t) => (
                        <div key={t.code ?? "none"}>
                          {t.name !== null && (
                            <h4 className="pt-3 text-sm font-semibold text-ink-2">
                              {t.name}
                            </h4>
                          )}
                          <ul>
                            {t.services.map((s) => (
                              <ServiceRow
                                key={s.key}
                                service={s}
                                lines={linesOf(s)}
                                currency={proposal.currency}
                                currencies={currencies}
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
