"use client";

import { Suspense, useCallback, useEffect, useId, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ConfigEntry, ObligationRule, ServiceAxis } from "@/lib/api/client";
import {
  Button,
  Card,
  EmptyRow,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  LinkButton,
  NotSet,
  RowChevron,
  RowLink,
  Select,
  Sub,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  ThChevron,
  Tr,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader, useSession } from "@/components/layout";
import { useSeesFees } from "@/components/fees";
import { countryName } from "@/lib/country";
import { CountryCodes, DeptChip, StatusPill } from "./parts";
import {
  axisName,
  catalogueOrder,
  deptTint,
  nameOf,
  priceWords,
  rowOf,
  type ServiceRow,
} from "./service";

/**
 * What the firm sells: ONE table (Wave 4 brief §8, 2026-09-28).
 *
 * It was a column of fully expanded cards, one per service, each carrying its
 * own hidden "draft a new version" form, its compliance filings and ten
 * mono-caps labels: 17,662px and 298 form inputs for 17 services on the W4B
 * fixture, with Standard terms and the discount limit underneath. Now a row
 * per service (code, name, Dept, countries, price, filings, status) and the
 * row opens the service's own page, where the details, the price, the filings
 * and the versions live in tabs. Standard terms moved to Documents, the
 * discount limit to Your firm.
 *
 * FILTERS ARE LOCAL to the list the API already returned whole: a search box,
 * the country chips the proposal builder uses (a service offered everywhere
 * shows under every country, D3) and a Dept. The country and the Dept ride in
 * the URL, so "← Catalogue" from a service lands on the same view.
 *
 * READING IS BROAD, WRITING IS `tenant:admin`. An associate quotes from the
 * catalogue, so the list is theirs to read; "Add a service" is offered to an
 * admin, and the API refuses anybody else regardless.
 */
export default function CataloguePage() {
  return (
    <Suspense fallback={<Loading label="Loading the catalogue" />}>
      <Catalogue />
    </Suspense>
  );
}

/** The "All" chip's value; a country chip's value is its code. */
const ALL = "all";

function Catalogue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const session = useSession();
  // B09/F09: list prices are null for a login that cannot see fees, and it
  // may not write a service (the API refuses: it would wipe a price it never
  // saw). The Price column says Hidden; Add a service is not offered.
  const seesFees = useSeesFees();
  const tabsId = useId();
  const [entries, setEntries] = useState<ConfigEntry[]>([]);
  const [axes, setAxes] = useState<ServiceAxis[]>([]);
  // The firm's compliance library, for the Filings count. Null when this
  // session may not read it (`party:read`): the column is then left out
  // rather than showing a count of nothing.
  const [filings, setFilings] = useState<ObligationRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (): Promise<void> => {
    const [catalogue, structure, compliance] = await Promise.all([
      api.GET("/api/v1/config/{kind}", { params: { path: { kind: "service" } } }),
      api.GET("/api/v1/tenancy/axes", {}),
      api.GET("/api/v1/obligation-filings", {}),
    ]);
    if (catalogue.response.status === 401) {
      router.push("/login");
      return;
    }
    if (catalogue.error) {
      setError(apiError(catalogue.error).message);
      setLoaded(true);
      return;
    }
    setEntries(catalogue.data.entries);
    setAxes(structure.data?.axes ?? []);
    setFilings(compliance.data?.filings ?? null);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // A link from before W4B named a service as an in-page anchor,
  // `/catalogue#service-<key>`, when every service was a card on this page.
  // It still lands: on that service's own page, where its filings are.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash.startsWith("service-") && hash.length > "service-".length) {
      router.replace(`/catalogue/${hash.slice("service-".length)}?tab=filings` as Route);
    }
  }, [router]);

  if (!loaded) return <Loading label="Loading the catalogue" />;

  const canWrite = (session?.permissions.includes("tenant:admin") ?? false) && seesFees === true;
  const rows = entries.map(rowOf).sort(catalogueOrder(axes));

  // Every country the catalogue names, by name. A service offered everywhere
  // adds none: it shows under each of them.
  const countries = [...new Set(rows.flatMap((r) => r.body.jurisdictions))].sort((a, b) =>
    countryName(a).localeCompare(countryName(b)),
  );
  const depts = [...new Set(rows.map((r) => r.body.module).filter((m): m is string => m !== null))];
  depts.sort((a, b) => (deptTint(axes, a) ?? 9) - (deptTint(axes, b) ?? 9) || a.localeCompare(b));

  const askedCountry = params.get("country");
  const country = askedCountry !== null && countries.includes(askedCountry) ? askedCountry : ALL;
  const askedDept = params.get("dept");
  const dept = askedDept !== null && depts.includes(askedDept) ? askedDept : "";

  function setParam(name: "country" | "dept", value: string): void {
    const next = new URLSearchParams(params.toString());
    if (value === "" || value === ALL) next.delete(name);
    else next.set(name, value);
    const query = next.toString();
    router.replace((query === "" ? pathname : `${pathname}?${query}`) as Route, { scroll: false });
  }

  const needle = search.trim().toLowerCase();
  const matchesText = (r: ServiceRow): boolean =>
    needle === "" ||
    [
      nameOf(r),
      r.body.ref,
      r.body.module,
      axisName(axes, "dept", r.body.module),
      axisName(axes, "team", r.body.group),
    ].some((v) => v !== null && v.toLowerCase().includes(needle));
  const inCountry = (r: ServiceRow, c: string): boolean =>
    c === ALL || r.body.jurisdictions.length === 0 || r.body.jurisdictions.includes(c);
  // The chips count what the OTHER filters leave, so a search shows at a
  // glance which countries it found something in.
  const narrowed = rows.filter((r) => matchesText(r) && (dept === "" || r.body.module === dept));
  const shown = narrowed.filter((r) => inCountry(r, country));
  const filtering = needle !== "" || dept !== "" || country !== ALL;

  const filingsOf = (r: ServiceRow): number =>
    filings === null ? 0 : filings.filter((f) => f.usedIn.some((u) => u.serviceEntryId === r.id)).length;
  const columns = filings === null ? 7 : 8;

  return (
    <Page>
      <PageHeader
        title="Catalogue"
        aside={
          canWrite ? (
            <LinkButton variant="primary" href="/catalogue/new">
              Add a service
            </LinkButton>
          ) : undefined
        }
      />
      <ErrorNotice error={error} />

      {rows.length > 0 && (
        <FieldRow>
          <Field label="Search services">
            <Input
              type="search"
              value={search}
              placeholder="e.g. bookkeeping or R12"
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </Field>
          <Field label="Dept">
            <Select
              value={dept}
              onChange={(e) => {
                setParam("dept", e.target.value);
              }}
            >
              <option value="">All Depts</option>
              {depts.map((d) => {
                const name = axisName(axes, "dept", d);
                return (
                  <option key={d} value={d}>
                    {name === null || name === d ? d : `${d}: ${name}`}
                  </option>
                );
              })}
            </Select>
          </Field>
        </FieldRow>
      )}

      {/* Always drawn, "All" alone on an empty catalogue: the panel below
          is labelled by it. */}
      {(
        <Tabs
          id={tabsId}
          label="Countries"
          value={country}
          onChange={(c) => {
            setParam("country", c);
          }}
          tabs={[
            { value: ALL, label: "All", count: narrowed.length },
            ...countries.map((c) => ({
              value: c,
              label: countryName(c),
              count: narrowed.filter((r) => inCountry(r, c)).length,
            })),
          ]}
        />
      )}

      <TabPanel tabsId={tabsId} value={country}>
        <div className="stack tight">
          {/* A live region that says something only while a filter is on:
              the count is what a filter ANSWERED. */}
          <div className="cluster">
            <p className="text-sm" role="status" aria-live="polite">
              {filtering ? `Showing ${String(shown.length)} of ${String(rows.length)} services.` : ""}
            </p>
            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  router.replace(pathname as Route, { scroll: false });
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          <Card>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Service</Th>
                    <Th>Dept</Th>
                    <Th>Countries</Th>
                    <Th align="right">Price</Th>
                    {filings !== null && <Th align="right">Filings</Th>}
                    <Th>Status</Th>
                    <ThChevron />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <EmptyRow colSpan={columns}>
                      Nothing in the catalogue yet.{canWrite ? " Add your first service." : ""}
                    </EmptyRow>
                  )}
                  {rows.length > 0 && shown.length === 0 && (
                    <EmptyRow colSpan={columns}>No service matches these filters. Change them, or press Clear filters.</EmptyRow>
                  )}
                  {shown.map((r) => {
                    const tint = deptTint(axes, r.body.module);
                    const team = axisName(axes, "team", r.body.group);
                    const price = priceWords(r.body);
                    return (
                      <Tr key={r.key} linked {...(tint === null ? {} : { cat: tint })}>
                        <Td className="nowrap">{r.body.ref ?? <NotSet />}</Td>
                        <Td>
                          {/* Capped so a long name wraps rather than pushing
                              Status off a 1280 screen (the table is
                              max-content wide; see `.cell-text`). */}
                          <span className="block max-w-64 whitespace-normal">
                            <RowLink href={`/catalogue/${r.key}` as Route}>{nameOf(r)}</RowLink>
                          </span>
                          {team !== null && <Sub>{team}</Sub>}
                        </Td>
                        <Td>
                          <DeptChip axes={axes} code={r.body.module} />
                        </Td>
                        <Td>
                          <CountryCodes codes={r.body.jurisdictions} />
                        </Td>
                        <Td align="right">
                          {seesFees === false ? (
                            <NotSet>Hidden</NotSet>
                          ) : price !== null ? (
                            <span className="nowrap">{price}</span>
                          ) : r.body.pricingNote !== null ? (
                            // The note itself can run to a sentence and filled
                            // this cell over four lines; the list says what it
                            // means, the service page's Price tab says it all.
                            <span className="nowrap" title={r.body.pricingNote}>
                              As mutually agreed
                            </span>
                          ) : (
                            <NotSet />
                          )}
                        </Td>
                        {/* None, in words, rather than a bare 0 (F34): the
                            service adds no filings to the calendar. */}
                        {filings !== null && (
                          <Td align="right">{filingsOf(r) === 0 ? <NotSet>None</NotSet> : filingsOf(r)}</Td>
                        )}
                        <Td className="nowrap">
                          <StatusPill status={r.status} />
                        </Td>
                        <RowChevron />
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      </TabPanel>
    </Page>
  );
}
