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
 * ── AND THE TWO REQUEST LANES ARE NO LONGER ON IT ─────────────────────────
 *
 * They were, until this page was MEASURED: **4,489px, three and a half screens,
 * seven top-level sections.** Two of those seven were conversations — what the
 * firm has asked for, and what the client has asked for — and five were status.
 * "Ask the firm" had three lines and a button, 1,640px down, between a list of
 * sent replies and a list of blocked jobs.
 *
 * The argument for keeping them here was a good one and is preserved rather
 * than overturned: the two lanes are ONE subject read from opposite ends, so
 * they moved TOGETHER, to `/portal/requests`. What is gone is not the pairing —
 * it is the pairing competing with four tables for the top of the only screen a
 * client lands on.
 *
 * This page is now what its heading always claimed: **what is happening**. Not
 * a to-do list, not an inbox, not a form. Anything a reader has to ACT on is
 * one click away and carries a count in the rail, which is more visible from
 * every screen than it ever was by being at the top of this one.
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
 * ── SINCE T6.7 IT SAYS WHEN THEY WERE LAST TOLD ABOUT A FILING ───────────
 *
 * `delivery.obligation_nudge` (0067) records that the firm told this client a
 * statutory date was approaching. It is a DATE and not a count, the same
 * decision the action centre makes about reminders: what a client does with it
 * is work out whether they missed a message, and "we told you three times"
 * about a filing that is not late yet is the firm being defensive before there
 * is anything to be defensive about.
 *
 * NULL is ordinary — a firm that has published no reminder ladder tells nobody
 * — and it draws as nothing at all.
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
import {
  Card,
  CardHead,
  CardTitle,
  LinkButton,
  Notice,
  Pill,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { Empty, ErrorState, Loading } from "@/components/states";
import Link from "next/link";
import { browserDay, usePortalRequestCount, usePortalSession } from "./portal-frame";

export default function PortalHomePage() {
  const session = usePortalSession();
  // The frame has already counted these for the rail's badge, so the pointer
  // below costs no request of its own — and it cannot disagree with the badge,
  // which is the failure a second count here would eventually produce.
  const counts = usePortalRequestCount();
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

      {/* ── 1 · WHAT THE FIRM IS WAITING ON YOU FOR — A POINTER, NOT THE LIST
          The lists themselves are on `/portal/requests`; see the header for
          what was measured and why they moved.

          This is `accent` and never `warn` or `danger`. The firm needing
          something is the ordinary business of an engagement, not a fault of
          the reader's, and a red panel on somebody's own page is an accusation.
          The action centre made the same call about "Held up" below.

          It draws ONLY when something is genuinely unanswered. A permanent
          "go and check your requests" strip is furniture: a reader learns
          inside a week that it means nothing, and then does not see it on the
          day it does. `withTheFirm` deliberately does not raise it either —
          having sent something is not a thing to be nagged about. */}
      {counts.loaded && counts.awaitingYou > 0 && (
        <Notice
          tone="accent"
          eyebrow={counts.awaitingYou === 1 ? "One thing needs you" : `${String(counts.awaitingYou)} things need you`}
        >
          <p>
            {firm} {counts.awaitingYou === 1 ? "has asked you for something" : "has asked you for a few things"} — a
            document, an approval or an answer. Nothing here moves on until{" "}
            {counts.awaitingYou === 1 ? "it is" : "they are"} dealt with.
          </p>
          <p>
            <LinkButton href="/portal/requests" variant="primary">
              Open requests
            </LinkButton>
          </p>
        </Notice>
      )}

      {/* ── 2 · HELD UP ────────────────────────────────────────────────────
          The tone is `warn` and never `danger`: the firm being unable to
          proceed is not the client's failure, and a red panel on a client's own
          page is an accusation. */}
      {home.heldUp.length > 0 && (
        <Section title="Held up" level={2}>
          <Stack gap="tight">
            <p className="muted">
              {firm} cannot move these on until something arrives. Where they have asked you
              for it directly, the request is under <Link href="/portal/requests">Requests</Link>{" "}
              with somewhere to answer it. The rest show the note {firm}&rsquo;s own team
              wrote, unedited — which may be about something outside your control.
            </p>
            {home.heldUp.map((row) => (
              <Card key={row.workItemId}>
                <CardHead>
                  <CardTitle>{row.title}</CardTitle>
                  <Pill tone="warn">{row.stateName}</Pill>
                </CardHead>
                <Stack gap="tight">
                  {/* THE REASON, UNLESS AN ASK ABOVE ALREADY SAYS IT (T6.6).

                      Found by opening the page, and it is T6.5's duplication
                      bug in a new costume: the action centre showed "Please
                      send the Maharashtra purchase register" with a file picker
                      under it, and this card printed the identical sentence out
                      of `blocked_reason` with nothing to do about it. To the
                      firm those are two rows — a note to itself, and a request
                      it addressed to the client; to the client they are one
                      sentence twice, and only one of them has a button.

                      The row STAYS. The task really is held up and belongs
                      here; what goes is the second copy. */}
                  {row.hasOpenAsk ? (
                    <p className="muted">
                      {/* THE PAGE, NOT A HEADING ON IT. `hasOpenAsk` is true
                          for an ANSWERED ask as well as an open one, so a
                          request already sent sits under "Sent — with the firm"
                          rather than "Waiting on you" — naming either would be
                          wrong half the time, and was, twice. Pointing at the
                          screen is right whichever of the two it is on, and it
                          survived the move that broke every other pointer on
                          this page. */}
                      {firm} has asked you for something on this — the request is under{" "}
                      <Link href="/portal/requests">Requests</Link>.
                    </p>
                  ) : (
                    row.heldUpReason !== null && <p>{row.heldUpReason}</p>
                  )}
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

      {/* ── 3 · WHAT THE LAW STILL WANTS ────────────────────────────────────
          "Filings coming up" was the first heading here, and opening the page
          killed it: the top five rows were PAST their statutory date and marked
          Missed, under a heading promising the future. A heading that is wrong
          about the rows directly beneath it is worse than no heading — this one
          would have had a client scrolling past the only lines that matter. */}
      {home.upcomingFilings.length > 0 && (
        <Section title="Filings still owed" level={2}>
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
                <Th>Last told</Th>
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

      {/* ── 4 · UNDER WAY ─────────────────────────────────────────────────── */}
      {home.inProgress.length > 0 && (
        <Section title="Under way" level={2}>
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

      {/* ── 5 · DONE ──────────────────────────────────────────────────────── */}
      {home.recentlyFiled.length > 0 && (
        <Section title="Recently filed" level={2}>
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

      {/* WHERE THE REST OF IT IS — AND THIS PARAGRAPH HAS NOW GONE STALE TWICE.

          Before T6.6 it said "sending files across is not here yet — email
          10x Global as you do now", and the walk found it one paragraph below
          a working file picker. T6.6 rewrote it to say invoices and documents
          were not here yet; T6.7 built both, and it was false again inside one
          task.

          So it is not a list of what is MISSING any more. A sentence that
          enumerates absences goes stale every time somebody removes one, and
          NOTHING in a typecheck, a lint or a test can see that happen. This one
          points at where things are, which stays true as more arrives — and the
          nav above it is the actual fix. */}
      {home.companies.length > 0 && (
        <p className="muted">
          This page is what is happening now. Anything {firm} has asked you for — and anything
          you have asked them — is under <Link href="/portal/requests">Requests</Link>. Your
          documents, your invoices and a month-by-month record of what {firm} has done are on
          the pages beside it.
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
      <Td>
        {/* WHEN, NOT HOW MANY — see the header. An em dash rather than
            "never": a firm that has published no reminder ladder tells nobody,
            which is the shipped state and not something to report as a
            failure to a client. */}
        {row.lastNudgedAt === null ? (
          <span className="muted">—</span>
        ) : (
          <span className="mono">{longInstant(row.lastNudgedAt)}</span>
        )}
      </Td>
    </tr>
  );
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

/**
 * "3 Sep 2026" from an ISO INSTANT.
 *
 * Deliberately a different function from `longDay` above, which splits a
 * YYYY-MM-DD string precisely so no timezone can move a statutory deadline. This
 * one takes a `timestamptz` and must be parsed — and it is the reader's own
 * local day that is wanted here, because "when did you last hear from us" is a
 * fact about their morning, not about the server's.
 */
function longInstant(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
