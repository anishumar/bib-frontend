"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";
import { longMoment } from "@/lib/day";
import { Cluster, Page, PageHeader, useSession } from "@/components/layout";
import { Denied, Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  ErrorNotice,
  Field,
  Input,
  Notice,
  Pill,
  Stat,
  Strip,
  Table,
  TableWrap,
  TabPanel,
  Tabs,
  Td,
  Th,
} from "@/components/ui";

/**
 * Bringing a firm's existing book of clients in from a spreadsheet.
 *
 * Every firm arrives as spreadsheets — the first one with about four hundred
 * clients on them — and the ordinary screens are for the clients that arrive
 * AFTER that. Typing four hundred companies through five screens is data entry
 * somebody abandons halfway, and a half-true book is worse than none: the
 * calendar is empty for exactly the clients everybody assumes are "in".
 *
 * Two acts, two requests. UPLOAD parses the sheets and checks every row
 * against what the firm already has, and STAGES the verdict — nothing else is
 * written. CONFIRM loads it, through the same services the screens use, so an
 * imported client is indistinguishable from a typed one. Between them the
 * report is what a person reads, and confirm is refused while a blocking
 * finding remains.
 *
 * A row already on file is SKIPPED and said so, never updated: a sheet gets
 * sent again with corrections, and the second run has to be boring.
 */

type ClientImport =
  paths["/api/v1/client-imports/{importId}"]["get"]["responses"][200]["content"]["application/json"];
type ImportSummary =
  paths["/api/v1/client-imports"]["get"]["responses"][200]["content"]["application/json"]["imports"][number];
type ImportTemplate =
  paths["/api/v1/client-imports/template"]["get"]["responses"][200]["content"]["application/json"];
type Sheet = ImportTemplate["sheets"][number]["key"];
type ServiceAxis =
  paths["/api/v1/tenancy/structure"]["get"]["responses"][200]["content"]["application/json"]["axes"][number];

const SHEET_LABEL: Record<Sheet, string> = {
  clients: "Clients",
  people: "People",
  engagements: "Engagements",
};

export default function ClientImportPage() {
  const router = useRouter();
  const session = useSession();
  const [template, setTemplate] = useState<ImportTemplate | null>(null);
  const [depts, setDepts] = useState<ServiceAxis[]>([]);
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [current, setCurrent] = useState<ClientImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"upload" | "confirm" | "open" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async (): Promise<void> => {
    const [tpl, list, structure] = await Promise.all([
      api.GET("/api/v1/client-imports/template", {}),
      api.GET("/api/v1/client-imports", {}),
      api.GET("/api/v1/tenancy/structure", {}),
    ]);
    if (tpl.response.status === 401) {
      router.push("/login");
      return;
    }
    if (tpl.error) {
      setError(apiError(tpl.error).message);
      setLoaded(true);
      return;
    }
    setTemplate(tpl.data);
    if (list.data) setImports(list.data.imports);
    if (structure.data) setDepts(structure.data.axes.filter((a) => a.axis === "dept" && a.isActive));
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function upload(form: FormData): Promise<void> {
    const clients = form.get("clients");
    if (!(clients instanceof File) || clients.size === 0) {
      setError("Choose the clients sheet first — it is the one the other two refer to.");
      return;
    }
    setBusy("upload");
    setError(null);
    // Rebuilt rather than posted through: `openapi-fetch` would serialise a
    // declared body as JSON, so the FormData goes on `body` with the content
    // type left for the browser to set — it has to add the multipart boundary.
    const payload = new FormData();
    payload.set("clients", clients);
    for (const name of ["people", "engagements"] as const) {
      const file = form.get(name);
      if (file instanceof File && file.size > 0) payload.set(name, file);
    }
    const result = await api.POST("/api/v1/client-imports", {
      body: payload as unknown as never,
      bodySerializer: (b: unknown) => b as FormData,
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    formRef.current?.reset();
    setCurrent(result.data);
    await load();
  }

  async function confirm(importId: string): Promise<void> {
    setBusy("confirm");
    setError(null);
    const result = await api.POST("/api/v1/client-imports/{importId}/confirm", {
      params: { path: { importId } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setCurrent(result.data);
    await load();
  }

  async function open(importId: string): Promise<void> {
    setBusy("open");
    setError(null);
    const result = await api.GET("/api/v1/client-imports/{importId}", {
      params: { path: { importId } },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    setCurrent(result.data);
  }

  if (session !== null && !session.permissions.includes("tenant:admin")) {
    return (
      <Page>
        <Denied permission="tenant:admin">
          Loading a firm’s book creates clients, letters and assignments in one act — an
          administrator’s.
        </Denied>
      </Page>
    );
  }
  if (!loaded || template === null) return <Loading label="Loading the import" />;

  return (
    <Page>
      <PageHeader
        eyebrow="Clients"
        title="Bring in the book"
        lede="Your existing clients, their people and the work you already deliver, from a spreadsheet. Every row is checked against what is already here before anything is written; a client already on file is skipped, never overwritten."
        aside={<Pill tone="quiet">{imports.length} uploaded</Pill>}
      />

      <ErrorNotice error={error} />

      <Templates template={template} depts={depts} />

      <Card>
        <CardHead title="Upload" level={2}>
          <p className="lede">
            .csv or .xlsx, one file per sheet. The clients sheet is required; the other two
            refer to it by the client’s registered name. Nothing is written until you confirm.
          </p>
        </CardHead>
        <form
          ref={formRef}
          action={(form) => {
            void upload(form);
          }}
        >
          <div className="stack">
            <Field label="Clients" hint="Needs a “Client Name” column.">
              <Input name="clients" type="file" accept=".csv,.xlsx" required />
            </Field>
            <Field label="People" optional hint="Directors, signatories, shareholders. Needs a “Name” column.">
              <Input name="people" type="file" accept=".csv,.xlsx" />
            </Field>
            <Field label="Engagements" optional hint="The work you already deliver. Needs a “Company” column.">
              <Input name="engagements" type="file" accept=".csv,.xlsx" />
            </Field>
            <div>
              <Button type="submit" loading={busy === "upload"}>
                Check the sheets
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {current !== null && (
        <ImportReport record={current} busy={busy} onConfirm={() => void confirm(current.id)} />
      )}

      <Card>
        <CardHead title="Previous uploads" level={2} />
        {imports.length === 0 ? (
          <Empty title="Nothing uploaded yet" icon="upload">
            The first upload appears here with its verdict, whether or not it was confirmed.
          </Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Files</Th>
                  <Th>Verdict</Th>
                  <Th>By</Th>
                  <Th align="right">Open</Th>
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <Td>{longMoment(i.stagedAt)}</Td>
                    <Td>
                      {[i.fileNames.clients, i.fileNames.people, i.fileNames.engagements]
                        .filter((f): f is string => f !== null)
                        .join(", ")}
                    </Td>
                    <Td>
                      <span className="cluster tight">
                        <Pill tone={i.status === "confirmed" ? "ok" : "quiet"}>{i.status}</Pill>
                        {i.blocking > 0 && <Pill tone="danger">{i.blocking} blocking</Pill>}
                        {i.warnings > 0 && <Pill tone="warn">{i.warnings} warnings</Pill>}
                      </span>
                    </Td>
                    <Td>{i.stagedBy.name ?? i.stagedBy.email}</Td>
                    <Td align="right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void open(i.id)}
                        loading={busy === "open"}
                      >
                        Open
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Page>
  );
}

// ── The templates ────────────────────────────────────────────────────────────

function Templates({ template, depts }: { template: ImportTemplate; depts: ServiceAxis[] }) {
  const tabsId = useId();
  const [sheet, setSheet] = useState<Sheet>("clients");

  /**
   * A header-only CSV, with the firm's own Depts expanded into one SPOC column
   * each — the one column the template cannot name in the abstract. No example
   * row: a row of plausible values uploaded unchanged would become a client.
   */
  function download(key: Sheet): void {
    const s = template.sheets.find((x) => x.key === key);
    if (s === undefined) return;
    const headers = s.columns.flatMap((c) =>
      c.header === "SPOC: <Dept>" ? depts.map((d) => `SPOC: ${d.code}`) : [c.header],
    );
    const csv = `${headers.map((h) => (h.includes(",") ? `"${h}"` : h)).join(",")}\r\n`;
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHead title="The sheets" level={2}>
        <p className="lede">
          Headers are matched by name, wherever the header row is — a title row above them is
          fine. Dates as 2026-08-23 or 23-Aug-2026, never 23/08/2026, which reads two ways.
        </p>
      </CardHead>
      <Tabs
        id={tabsId}
        label="Sheets"
        value={sheet}
        onChange={setSheet}
        tabs={template.sheets.map((s) => ({ value: s.key, label: SHEET_LABEL[s.key] }))}
      />
      {(() => {
        const s = template.sheets.find((x) => x.key === sheet);
        if (s === undefined) return null;
        return (
          <TabPanel tabsId={tabsId} value={s.key}>
            <div className="stack" style={{ marginTop: "var(--s-4)" }}>
              <Cluster>
                <Button variant="secondary" size="sm" onClick={() => download(s.key)}>
                  Download {SHEET_LABEL[s.key].toLowerCase()} template
                </Button>
                <span className="muted">
                  Header row must carry <span className="mono">{s.marker}</span>.
                </span>
              </Cluster>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Column</Th>
                      <Th>Required</Th>
                      <Th>What goes in it</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.columns.map((c) => (
                      <tr key={c.header}>
                        <Td>
                          <span className="mono">{c.header}</span>
                          {c.header === "SPOC: <Dept>" && depts.length > 0 && (
                            <>
                              {" "}
                              <span className="muted">
                                — here: {depts.map((d) => `SPOC: ${d.code}`).join(", ")}
                              </span>
                            </>
                          )}
                        </Td>
                        <Td>{c.required ? <Pill tone="warn">required</Pill> : <span className="empty">—</span>}</Td>
                        <Td>{c.about === "" ? <span className="empty">—</span> : c.about}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              {s.key === "people" && (
                <p className="muted">
                  Relationship: {template.relationships.map((r) => r.replace(/_of$/, "").replace(/_/g, " ")).join(", ")}.
                </p>
              )}
              {s.key === "engagements" && (
                <p className="muted">Billed: {template.billingFrequencies.join(", ")}.</p>
              )}
            </div>
          </TabPanel>
        );
      })()}
    </Card>
  );
}

// ── The report, and the outcome once confirmed ───────────────────────────────

function ImportReport({
  record,
  busy,
  onConfirm,
}: {
  record: ClientImport;
  busy: "upload" | "confirm" | "open" | null;
  onConfirm: () => void;
}) {
  const tabsId = useId();
  const [sheet, setSheet] = useState<Sheet>("clients");
  const r = record.report;
  const confirmed = record.status === "confirmed";
  const rowsOf = (key: Sheet) => r.rows.filter((v) => v.sheet === key);

  return (
    <>
      <Card>
        <CardHead
          title={confirmed ? "Loaded" : r.blocking > 0 ? "Fix the sheet" : "Ready to load"}
          level={2}
        >
          <p className="lede">
            {[record.fileNames.clients, record.fileNames.people, record.fileNames.engagements]
              .filter((f): f is string => f !== null)
              .join(", ")}{" "}
            — checked {longMoment(record.stagedAt)} by {record.stagedBy.name ?? record.stagedBy.email}
            {confirmed && record.confirmedAt !== null && (
              <>
                ; loaded {longMoment(record.confirmedAt)} by{" "}
                {record.confirmedBy?.name ?? record.confirmedBy?.email}
              </>
            )}
            .
          </p>
        </CardHead>

        <Strip>
          <Stat label="Blocking" value={r.blocking} tone={r.blocking > 0 ? "danger" : "ok"} />
          <Stat label="Warnings" value={r.warnings} {...(r.warnings > 0 ? { tone: "warn" as const } : {})} />
          <Stat label="Clients" value={r.counts.clientsToCreate} note={`${r.counts.clientsOnFile} on file · ${r.counts.clientsBlocked} blocked`} />
          <Stat label="People" value={r.counts.peopleToCreate} note={`${r.counts.peopleOnFile} on file · ${r.counts.peopleBlocked} blocked`} />
          <Stat label="Engagements" value={r.counts.engagementsToCreate} note={`${r.counts.engagementsOnFile} in force · ${r.counts.engagementsBlocked} blocked`} />
          <Stat label="Letters" value={r.counts.lettersToDraft} note={`${r.counts.assignmentsToRecord} assignments`} />
        </Strip>

        {r.compliance.floor === null && r.compliance.engagementsBeforeReachBack > 0 && (
          <Notice tone="warn" eyebrow="COMPLIANCE CALENDAR">
            {r.compliance.engagementsBeforeReachBack} engagement
            {r.compliance.engagementsBeforeReachBack === 1 ? "" : "s"} started before{" "}
            {r.compliance.reachBackFrom}. The calendar generates ninety days back, so without a
            go-live floor every filing already made in your old records will show as missed. Set
            “ask about deadlines from” on the compliance policy under{" "}
            <Link href="/admin/obligation-rules">Compliance rules</Link> first.
          </Notice>
        )}

        {!confirmed && (
          <Cluster>
            <Button
              variant="primary"
              disabled={r.blocking > 0}
              loading={busy === "confirm"}
              onClick={onConfirm}
            >
              Load {r.counts.clientsToCreate} client{r.counts.clientsToCreate === 1 ? "" : "s"}
            </Button>
            <span className="muted">
              {r.blocking > 0
                ? "Fix the blocking rows in the sheet and upload it again."
                : "Each row goes through the ordinary screens’ own services and is signed as it goes; the outcome says what each became."}
            </span>
          </Cluster>
        )}
      </Card>

      {r.findings.length > 0 && (
        <Card>
          <CardHead title="Findings" level={2}>
            <p className="lede">
              Blocking stops the load until the sheet is fixed. A warning loads and is worth a
              look.
            </p>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Severity</Th>
                  <Th>Sheet</Th>
                  <Th align="right">Row</Th>
                  <Th>Name</Th>
                  <Th>Finding</Th>
                </tr>
              </thead>
              <tbody>
                {r.findings.map((f, i) => (
                  <tr key={`${f.sheet}-${String(f.lineNo)}-${String(i)}`}>
                    <Td>
                      <Pill tone={f.severity === "blocking" ? "danger" : "warn"}>{f.severity}</Pill>
                    </Td>
                    <Td>{f.sheet}</Td>
                    <Td align="right">{f.lineNo === null ? <span className="empty">—</span> : f.lineNo}</Td>
                    <Td>{f.name}</Td>
                    <Td>{f.message}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <Card>
        <CardHead title={confirmed ? "What each row became" : "What each row will become"} level={2} />
        <Tabs
          id={tabsId}
          label="Sheets"
          value={sheet}
          onChange={setSheet}
          tabs={(["clients", "people", "engagements"] as const).map((key) => ({
            value: key,
            label: SHEET_LABEL[key],
            count: rowsOf(key).length,
          }))}
        />
        {(() => {
          const key = sheet;
          const verdicts = rowsOf(key);
          const outcomes = record.outcome?.rows.filter((o) => o.sheet === key) ?? [];
          return (
            <TabPanel tabsId={tabsId} value={key}>
              <div style={{ marginTop: "var(--s-4)" }}>
                {verdicts.length === 0 ? (
                  <Empty title={`No ${SHEET_LABEL[key].toLowerCase()} sheet`} icon="files" />
                ) : (
                  <TableWrap>
                    <Table>
                      <thead>
                        <tr>
                          <Th align="right">Row</Th>
                          <Th>Name</Th>
                          <Th>{confirmed ? "Outcome" : "Action"}</Th>
                          <Th>Detail</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {verdicts.map((v) => {
                          const o = outcomes.find((x) => x.lineNo === v.lineNo);
                          const action = o?.action ?? v.action;
                          const detail = o?.detail ?? v.detail;
                          return (
                            <tr key={v.lineNo}>
                              <Td align="right">{v.lineNo}</Td>
                              <Td>
                                {o?.partyId !== null && o?.partyId !== undefined ? (
                                  <Link href={`/clients/${o.partyId}`}>{v.name}</Link>
                                ) : (
                                  v.name
                                )}
                              </Td>
                              <Td>
                                <Pill tone={actionTone(action)}>{action}</Pill>
                              </Td>
                              <Td>{detail === null ? <span className="empty">—</span> : detail}</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </TableWrap>
                )}
              </div>
            </TabPanel>
          );
        })()}
      </Card>

      {r.letters.length > 0 && (
        <Card>
          <CardHead title={confirmed ? "Letters signed" : "Letters to sign"} level={2}>
            <p className="lede">
              One letter per client and currency, dated from its earliest engagement, signed today
              as an attestation — the paper letter’s whereabouts go on the signature. Signing is
              what creates the engagements, and the engagements are what put work on the board and
              filings on the calendar.
            </p>
          </CardHead>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Country</Th>
                  <Th>Currency</Th>
                  <Th>From</Th>
                  <Th>Lines</Th>
                  <Th>Signed by</Th>
                  {confirmed && <Th>Outcome</Th>}
                </tr>
              </thead>
              <tbody>
                {r.letters.map((l, i) => {
                  const o = record.outcome?.letters.find(
                    (x) => x.clientName === l.clientName && x.currency === l.currency,
                  );
                  return (
                    <tr key={`${l.clientName}-${l.currency}-${String(i)}`}>
                      <Td>
                        {o?.letterId !== null && o?.letterId !== undefined ? (
                          <Link href={`/engagement-letters/${o.letterId}`}>{l.clientName}</Link>
                        ) : (
                          l.clientName
                        )}
                      </Td>
                      <Td>
                        <Pill tone="code">{l.jurisdiction}</Pill>
                      </Td>
                      <Td>
                        <Pill tone="code">{l.currency}</Pill>
                      </Td>
                      <Td>{l.effectiveFrom}</Td>
                      <Td>
                        {l.lines.map((x) => (
                          <div key={x.engagementLineNo}>
                            {x.serviceName} — {x.entityName}
                            {x.unitAmount === null ? "" : `, ${l.currency} ${x.unitAmount} ${x.billingFrequency}`}
                          </div>
                        ))}
                      </Td>
                      <Td>{l.signatory}</Td>
                      {confirmed && (
                        <Td>
                          {o === undefined ? (
                            <span className="empty">—</span>
                          ) : (
                            <span className="cluster tight">
                              <Pill tone={actionTone(o.action)}>{o.action}</Pill>
                              {o.detail !== null && <span className="muted">{o.detail}</span>}
                            </span>
                          )}
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function actionTone(action: string): "ok" | "warn" | "danger" | "quiet" | "neutral" {
  switch (action) {
    case "create":
    case "created":
      return "ok";
    case "skip":
    case "skipped":
      return "quiet";
    case "blocked":
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}
