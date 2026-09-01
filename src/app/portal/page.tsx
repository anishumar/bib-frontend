"use client";

/**
 * The client portal's status home (T6.5) — the first screen in this product
 * written for somebody outside the firm.
 *
 * ── WHAT IT ANSWERS, AND WHY IN THIS ORDER ────────────────────────────────
 *
 * A client opening a portal is asking three questions and they are not equally
 * urgent. What is stuck and needs something is first, because it is the only
 * section they can DO anything about. What the law still wants from their
 * companies is second, because missing it costs them money. What is under way
 * and what has been done come after, because those are reassurance rather than
 * action.
 *
 * ── FOUR THINGS THIS SCREEN DELIBERATELY DOES NOT SHOW ────────────────────
 *
 * · NO DUE DATE THE FIRM DID NOT PROMISE. The API carries `statutoryDueOn` only
 *   where a statute set it; everything else shows how long it has been open.
 *   The firm has never given its turnaround times, and a date invented here
 *   would be quoted back at it.
 * · NO INTERNAL TARGET. The firm works to T–X on a filing; showing a client the
 *   margin turns it into the deadline and destroys what it was for. It is not
 *   on the response at all.
 * · NOBODY'S NAME. Whose desk a task sits on is the firm's business, and a name
 *   here invites a client to chase a junior directly.
 * · NOTHING THE FIRM MARKED INTERNAL. `is_client_visible` decides that, and it
 *   is enforced in the DATABASE (migration 0062), not by this screen choosing
 *   what to draw.
 *
 * ── AND THE TWO EMPTY STATES ARE DIFFERENT SENTENCES ──────────────────────
 *
 * `companies: []` means invited and granted nothing — "ask the firm", with the
 * firm named. Companies granted and every list empty means there is genuinely
 * nothing outstanding, which is good news and has to read as good news. Drawing
 * both as a blank page is the screen declining to say which is true, and it is
 * the exact failure the portal existed to fix: a login that opens onto nothing
 * is indistinguishable from broken software.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalFilingRow, PortalStatusHome, PortalWorkRow } from "@/lib/api/client";
import { Card, CardHead, CardTitle, Notice, Pill, Table, Td, Th } from "@/components/ui";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { Empty, ErrorState, Loading } from "@/components/states";
import { usePortalSession } from "./portal-frame";

export default function PortalHomePage() {
  const session = usePortalSession();
  const [home, setHome] = useState<PortalStatusHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // THE BROWSER'S OWN CALENDAR DAY. A UTC server is a day behind a firm in
    // India every morning until half past five, and this value decides both
    // which grants are in force and which filings count as upcoming — so a
    // client signing in at 07:00 in Delhi would otherwise be told the firm has
    // given them nothing.
    const result = await api.GET("/api/v1/portal/home", {
      params: { query: { asOf: browserDay() } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setHome(result.data);
    setError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Wrapped rather than `void load()`: the lint rule that forbids a
    // synchronous setState in an effect body is what the rest of this app does
    // too, and the wrapper is how every other screen here satisfies it.
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading your portal" />;

  if (home === null) {
    return (
      <Page>
        <PageHeader title="Your portal" />
        <ErrorState message={error ?? "This page could not be loaded."} />
      </Page>
    );
  }

  const firm = session?.tenantName ?? "your accountants";
  const nothingOutstanding =
    home.heldUp.length === 0 &&
    home.upcomingFilings.length === 0 &&
    home.inProgress.length === 0;

  return (
    <Page>
      <PageHeader
        eyebrow={firm}
        title={greeting(session?.displayName ?? null)}
        lede={
          home.companies.length === 0
            ? undefined
            : `What ${firm} is doing for ${listNames(home.companies.map((c) => c.clientName))}.`
        }
      />

      {/* GRANTED NOTHING. Not an error, not an empty board — a state somebody
          at the firm has to act on, said in the words that let the reader act:
          who to ask, and what to ask for. */}
      {home.companies.length === 0 && (
        <Notice tone="warn" eyebrow="Nothing shared with you yet">
          <p>
            Your login works, but {firm} has not yet given it access to a company. Until they
            do there is nothing here to show — this is not an error and nothing has gone
            missing.
          </p>
          <p>Ask your contact at {firm} to share your company with this email address.</p>
        </Notice>
      )}

      {home.companies.length > 0 && nothingOutstanding && home.recentlyFiled.length === 0 && (
        <Empty title="Nothing outstanding" icon="check">
          There is no work open and no filing due in the next three months for{" "}
          {listNames(home.companies.map((c) => c.clientName))}. Anything new will appear here.
        </Empty>
      )}

      {/* ── 1 · HELD UP ────────────────────────────────────────────────────
          First because it is the only section the reader can act on. The tone
          is `warn` and never `danger`: the firm being unable to proceed is not
          the client's failure, and a red panel on a client's own page is an
          accusation. */}
      {home.heldUp.length > 0 && (
        <Section title="Held up">
          <Stack gap="tight">
            <p className="muted">
              {firm} cannot move these on until something arrives. What each is waiting for is
              below, in {firm}&rsquo;s own words — these are the notes their team wrote, shown
              to you unedited.
            </p>
            {home.heldUp.map((row) => (
              <Card key={row.workItemId}>
                <CardHead>
                  <CardTitle>{row.title}</CardTitle>
                  <Pill tone="warn">{row.stateName}</Pill>
                </CardHead>
                <Stack gap="tight">
                  {row.heldUpReason !== null && <p>{row.heldUpReason}</p>}
                  <p className="muted">
                    {row.companyName ?? "About your account"}
                    {row.heldUpSince !== null && <> · waiting since {longDay(row.heldUpSince)}</>}
                  </p>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Section>
      )}

      {/* ── 2 · WHAT THE LAW STILL WANTS ────────────────────────────────────
          "Filings coming up" was the first heading here, and opening the page
          killed it: the top five rows were PAST their statutory date and marked
          Missed, under a heading promising the future. A heading that is wrong
          about the rows directly beneath it is worse than no heading — this one
          would have had a client scrolling past the only lines that matter. */}
      {home.upcomingFilings.length > 0 && (
        <Section title="Filings still owed">
          <Stack gap="tight">
            <p className="muted">
              The date each is due by LAW. Anything already past its date is at the top.
            </p>
          </Stack>
          <Table>
            <thead>
              <tr>
                <Th>Filing</Th>
                <Th>Company</Th>
                <Th>Period</Th>
                <Th>Due by law</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {home.upcomingFilings.map((row) => (
                <FilingLine key={row.obligationId} row={row} today={home.asOf} />
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {/* ── 3 · UNDER WAY ─────────────────────────────────────────────────── */}
      {home.inProgress.length > 0 && (
        <Section title="Under way">
          <Table>
            <thead>
              <tr>
                <Th>Work</Th>
                <Th>Company</Th>
                <Th>Status</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {home.inProgress.map((row) => (
                <WorkLine key={row.workItemId} row={row} />
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {/* ── 4 · DONE ──────────────────────────────────────────────────────── */}
      {home.recentlyFiled.length > 0 && (
        <Section title="Recently filed">
          <Table>
            <thead>
              <tr>
                <Th>Filing</Th>
                <Th>Company</Th>
                <Th>Period</Th>
                <Th>Filed on</Th>
              </tr>
            </thead>
            <tbody>
              {home.recentlyFiled.map((row) => (
                <tr key={row.obligationId}>
                  <Td>{row.name}</Td>
                  <Td>{row.companyName}</Td>
                  <Td>{row.periodLabel}</Td>
                  <Td>
                    {row.filedOn === null ? "—" : longDay(row.filedOn)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {/* WHAT IS NOT HERE, SAID OUT LOUD. A client who cannot find their
          invoices should be told the portal does not carry them yet, rather
          than concluding the firm has not billed them. */}
      {home.companies.length > 0 && (
        <p className="muted">
          This page shows work and statutory filings. Documents, invoices and sending files
          across are not here yet — email {firm} as you do now.
        </p>
      )}
    </Page>
  );
}

function WorkLine({ row }: { row: PortalWorkRow }) {
  return (
    <tr>
      <Td>{row.title}</Td>
      <Td>{row.companyName ?? <span className="muted">Your account</span>}</Td>
      <Td>
        {/* `quiet`, the same as the filings table's. The firm's own word for
            where something has got to is INFORMATION, and the one urgent mark
            on this page is "Past the date" — two chip styles for the same kind
            of fact is how a reader stops trusting either. */}
        <Pill tone="quiet">{row.stateName}</Pill>
      </Td>
      <Td>
        {/* ELAPSED, NEVER A DEADLINE. The one date this row is entitled to
            state is when the work opened — unless a statute set one, which the
            filings table above says better. */}
        <span className="mono">{longDay(row.openedOn)}</span>
      </Td>
    </tr>
  );
}

function FilingLine({ row, today }: { row: PortalFilingRow; today: string }) {
  // String comparison on YYYY-MM-DD, which is what these are: no Date is
  // constructed, so no timezone can move a deadline by a day.
  const overdue = row.statutoryDueOn < today;
  return (
    <tr>
      <Td>{row.name}</Td>
      <Td>{row.companyName}</Td>
      <Td>{row.periodLabel}</Td>
      <Td>
        <span className="mono">{longDay(row.statutoryDueOn)}</span>
        {overdue && (
          <>
            {" "}
            <Pill tone="danger">Past the date</Pill>
          </>
        )}
      </Td>
      <Td>
        <Pill tone="quiet">{row.stateName}</Pill>
      </Td>
    </tr>
  );
}

/** The reader's own calendar day, from their own machine. */
function browserDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/**
 * A YYYY-MM-DD calendar day, printed.
 *
 * Split rather than parsed. `new Date("2026-09-20")` is UTC midnight and prints
 * as the 19th anywhere west of Greenwich — which on this screen would move a
 * statutory deadline by a day, in the direction that matters.
 */
function longDay(iso: string): string {
  const [year = "", month = "", day = ""] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const name = months[Number(month) - 1] ?? month;
  return `${day} ${name} ${year}`;
}

/** "Cobalt Foods", "Cobalt Foods and Cobalt Logistics", "A, B and C". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "your companies";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/** The person, by the name the firm holds — or by nothing at all. `displayName`
 *  is nullable and genuinely empty at real firms, and "Welcome back, null" is
 *  worse than a greeting with no name in it. */
function greeting(displayName: string | null): string {
  return displayName === null || displayName.trim() === ""
    ? "Your portal"
    : `Hello, ${displayName.split(" ")[0] ?? displayName}`;
}
