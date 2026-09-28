"use client";

import { useEffect, useId, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { LetterRecord, ServiceAxis } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { Card, CardTitle } from "@/components/tw";
import { Button, Field, LinkButton, Select, TabPanel, Tabs } from "@/components/ui";
import { countryName } from "@/lib/country";
import { StickyFooter } from "@/components/proposal-builder/frame";
import { catalogueCountries, groupByDept, offeredIn } from "@/components/proposal-builder/data";
import type { CatalogueService } from "@/components/proposal-builder/data";
import { ServiceRow } from "@/components/proposal-builder/service-row";
import type { LineTerms } from "@/components/proposal-builder/service-row";
import { FeeGroups, LineFee } from "./fee-groups";
import { rowLineOf } from "./data";
import { putLetter } from "./store";
import { LetterTotals } from "./totals";

type LineChange = components["schemas"]["UpdateEngagementLetterLineRequest"];

/**
 * STEP 2 of the letter builder: which services, for which company, at what fee.
 *
 * The proposal builder's own picker: the catalogue a country at a time (the
 * issuer's first), grouped by Dept then delivery team, ticking adds a line at
 * its list price when that price is in the letter's currency and otherwise asks
 * for the fee. Services ONLY — the wording is edited in the preview.
 *
 * A letter line names the COMPANY the work is for (an engagement is one service
 * for one legal entity). When the client's structure holds one company that is
 * the client itself and nobody is asked; when it holds several, the step asks
 * once, above the list, and a tick is for that company. Switching the company
 * shows its own ticks, so a group's four companies are four passes.
 *
 * "One fee for several services" is the letter page's sections-and-fees card,
 * mounted here as it is.
 */
export function LetterServicesStep({
  record,
  catalogue,
  axes,
  canWrite,
  onChanged,
}: {
  record: LetterRecord;
  catalogue: readonly CatalogueService[];
  axes: readonly ServiceAxis[];
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tabsId = useId();
  const [companies, setCompanies] = useState<readonly { id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const { letter, lines, feeGroups } = record;
  const letterId = letter.id;
  const editable = letter.status === "draft" && letter.deletedAt === null && canWrite;

  useEffect(() => {
    void api
      .GET("/api/v1/parties/{partyId}/structure", { params: { path: { partyId: record.party.id } } })
      .then((r) => {
        setCompanies((r.data?.entities ?? []).map((e) => ({ id: e.id, name: e.displayName })));
      });
  }, [record.party.id]);

  // ── The company a tick is for ─────────────────────────────────────────────
  // One company: the client, silently. Several: asked, and remembered in the
  // URL so a reload keeps it.
  const only = companies !== null && companies.length === 1 ? (companies[0]?.id ?? null) : null;
  const asked = search.get("company");
  const company =
    only ?? (asked !== null && companies?.some((c) => c.id === asked) === true ? asked : "");
  const choosing = companies !== null && companies.length > 1;

  // ── The country chip ──────────────────────────────────────────────────────
  const issuerCountry = record.issuer.jurisdiction;
  const offered = catalogueCountries(catalogue);
  const countries = [
    ...(issuerCountry === null ? [] : [issuerCountry]),
    ...offered.filter((c) => c !== issuerCountry),
  ];
  const askedCountry = search.get("country");
  const country =
    askedCountry !== null && countries.includes(askedCountry)
      ? askedCountry
      : (countries[0] ?? issuerCountry ?? "");

  function setParam(key: string, value: string): void {
    const params = new URLSearchParams(search.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  const linesOf = (s: CatalogueService) =>
    lines.filter((l) => l.service?.key === s.key && l.entityPartyId === company);

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

  async function add(s: CatalogueService, t: LineTerms): Promise<boolean> {
    return act(s.key, async () => {
      const result = await api.POST("/api/v1/engagement-letters/{letterId}/lines", {
        params: { path: { letterId } },
        body: {
          entityPartyId: company,
          serviceVersionId: s.versionId,
          description: s.name,
          quantity: t.quantity,
          discountPercent: t.unitAmount === null ? "0" : t.discountPercent,
          ...(t.unitAmount === null ? {} : { unitAmount: t.unitAmount }),
          ...(t.pricingNote === null ? {} : { pricingNote: t.pricingNote }),
          ...(t.billingFrequency === null ? {} : { billingFrequency: t.billingFrequency }),
          ...(country === "" ? {} : { jurisdiction: country }),
          ...(t.overrides.scope === null ? {} : { scopeOverride: t.overrides.scope }),
          ...(t.overrides.clientObligations === null
            ? {}
            : { clientObligationsOverride: t.overrides.clientObligations }),
          ...(t.overrides.volumeLimits === null ? {} : { volumeLimitsOverride: t.overrides.volumeLimits }),
          ...(t.overrides.exclusions === null ? {} : { exclusionsOverride: t.overrides.exclusions }),
        },
      });
      return result.error ? apiError(result.error).message : null;
    });
  }

  async function remove(s: CatalogueService): Promise<boolean> {
    return act(s.key, async () => {
      for (const l of linesOf(s)) {
        const result = await api.DELETE("/api/v1/engagement-letters/{letterId}/lines/{lineId}", {
          params: { path: { letterId, lineId: l.id } },
        });
        if (result.error) return apiError(result.error).message;
      }
      return null;
    });
  }

  async function save(s: CatalogueService, lineId: string, grouped: boolean, t: LineTerms): Promise<boolean> {
    setBusy(s.key);
    setErrors((e) => ({ ...e, [s.key]: "" }));
    const body: LineChange = {
      quantity: t.quantity,
      billingFrequency: t.billingFrequency,
      scopeOverride: t.overrides.scope,
      clientObligationsOverride: t.overrides.clientObligations,
      volumeLimitsOverride: t.overrides.volumeLimits,
      exclusionsOverride: t.overrides.exclusions,
      // A line a section pays for keeps no price of its own.
      ...(grouped
        ? {}
        : {
            unitAmount: t.unitAmount,
            discountPercent: t.unitAmount === null ? "0" : t.discountPercent,
            pricingNote: t.pricingNote,
          }),
    };
    const result = await api.PATCH("/api/v1/engagement-letters/{letterId}/lines/{lineId}", {
      params: { path: { letterId, lineId } },
      body,
    });
    setBusy(null);
    if (result.error) {
      setErrors((e) => ({ ...e, [s.key]: apiError(result.error).message }));
      return false;
    }
    putLetter(letterId, result.data);
    return true;
  }

  /** The fee groups card's own `act`: reload after, report whether it took. */
  async function groupAct(key: string, call: () => Promise<{ error?: unknown }>): Promise<boolean> {
    setBusy(key);
    const result = await call();
    if (result.error) {
      setErrors((e) => ({ ...e, [key]: apiError(result.error).message }));
      setBusy(null);
      return false;
    }
    await onChanged();
    setBusy(null);
    return true;
  }

  const shown = offeredIn(catalogue, country);
  const groups = groupByDept(shown, axes);
  const blocked = company === "" && choosing ? "Choose the company this work is for, above." : null;
  const groupErrors = Object.entries(errors).filter(([k, v]) => v !== "" && (k.startsWith("group") || k.startsWith("fee:") || k.startsWith("rm-group")));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardTitle level={2}>Services</CardTitle>
        {choosing && (
          <div className="mt-3 max-w-md">
            <Field
              label="For which company"
              hint={company === "" ? "Choose it, then tick the services for it." : undefined}
            >
              <Select
                value={company}
                required
                onChange={(e) => {
                  setParam("company", e.target.value);
                }}
              >
                <option value="">Choose the company</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {countries.length === 0 ? (
          <p className="mt-4 text-muted">No published services yet. Add them on the Catalogue screen.</p>
        ) : (
          <div className="mt-4">
            <Tabs
              id={tabsId}
              label="Countries"
              value={country}
              onChange={(c) => {
                setParam("country", c);
              }}
              tabs={countries.map((c) => {
                const n = lines.filter((l) => l.jurisdiction === c && (company === "" || l.entityPartyId === company)).length;
                return { value: c, label: countryName(c), ...(n > 0 ? { count: n } : {}) };
              })}
            />
            <TabPanel tabsId={tabsId} value={country}>
              {groups.length === 0 ? (
                <p className="mt-4 text-muted">Nothing in the catalogue is offered in {countryName(country)}.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-6">
                  {groups.map((g) => (
                    <section key={g.code ?? "none"} aria-label={g.name}>
                      <h3 className="border-b border-line pb-2 pt-3 text-md font-semibold text-ink">
                        {g.code !== null && g.code !== g.name && (
                          <span className="mono mr-2 text-sm text-muted">{g.code}</span>
                        )}
                        {g.name}
                      </h3>
                      {g.teams.map((t) => (
                        <div key={t.code ?? "none"}>
                          {t.name !== null && (
                            <h4 className="pt-3 text-xs uppercase tracking-wide text-faint">{t.name}</h4>
                          )}
                          <ul>
                            {t.services.map((s) => {
                              const mine = linesOf(s).map((l) => rowLineOf(l, feeGroups));
                              const first = mine[0];
                              return (
                                <ServiceRow
                                  key={s.key}
                                  service={s}
                                  lines={mine}
                                  currency={letter.currency}
                                  editable={editable && companies !== null}
                                  busy={busy === s.key}
                                  error={errors[s.key] === "" ? null : (errors[s.key] ?? null)}
                                  noun="letter"
                                  blocked={blocked}
                                  onAdd={(terms) => add(s, terms)}
                                  onRemove={() => remove(s)}
                                  onSave={(line, terms) =>
                                    save(s, line.id, line.source.feeGroupId !== null, terms)
                                  }
                                  extra={
                                    first !== undefined && feeGroups.length > 0 && editable ? (
                                      <LineFee
                                        letterId={letterId}
                                        line={first.source}
                                        groups={feeGroups}
                                        currency={letter.currency}
                                        busy={busy}
                                        act={groupAct}
                                      />
                                    ) : undefined
                                  }
                                />
                              );
                            })}
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

      {/* ONE FEE FOR SEVERAL SERVICES, the letter page's card as it is. */}
      <details className="rounded-md border border-line bg-surface px-4 py-3" open={feeGroups.length > 0}>
        <summary className="cursor-pointer text-md font-semibold">One fee for several services</summary>
        <div className="mt-3">
          {groupErrors.map(([k, v]) => (
            <p key={k} role="alert" className="mb-2 text-sm text-danger">
              {v}
            </p>
          ))}
          <FeeGroups
            letterId={letterId}
            groups={feeGroups}
            lines={lines}
            editable={editable}
            busy={busy}
            act={groupAct}
          />
        </div>
      </details>

      <StickyFooter summary={<LetterTotals record={record} />}>
        <LinkButton variant="ghost" href={`/engagement-letters/${letterId}/build?step=client` as Route}>
          Back
        </LinkButton>
        <Button
          type="button"
          disabled={lines.length === 0}
          onClick={() => {
            router.push(`/engagement-letters/${letterId}/build?step=preview` as Route);
          }}
        >
          Next: Preview
        </Button>
      </StickyFooter>
    </div>
  );
}
