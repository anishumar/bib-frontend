"use client";

/**
 * The client portal's MONTHLY DIGEST (T6.7) — and it is a SCREEN, not an email.
 *
 * ── THAT DISTINCTION IS THE FIRST THING TO STATE ─────────────────────────
 *
 * The board asks for a "monthly digest". A digest is something that ARRIVES,
 * and there is no message transport in this product — P10 is Phase 7. So this
 * ships as the thing behind the email rather than as the email, and the page
 * says so out loud rather than letting a client wonder why nothing lands in
 * their inbox on the first of the month.
 *
 * That follows the chaser's own arrangement (`ChaserService` has no mailer
 * injected) and for the chaser's own reason: a stub that logged "digest sent"
 * would put a line in an operator's log saying a client was emailed, which is
 * the same class of lie as a `scan()` returning clean.
 *
 * ── AND IT IS NOT A SECOND COPY OF THE STATUS HOME ───────────────────────
 *
 * `/portal` answers *what is outstanding today* over a rolling ninety days.
 * This answers *what did you do for me in March*, is bounded by a calendar
 * month, and reaches back as far as the client cares to look. The two would
 * collapse into one screen if the home had a date picker, and they must not: one
 * is a queue and the other is a record.
 *
 * ── WHAT THE CLIENT THEMSELVES DID IS ON IT ─────────────────────────────
 *
 * A month that listed only the firm's own output would read as an invoice for
 * attention. "You answered three things" belongs beside "we filed four", and it
 * is the section a client checks when they are asked why something was late.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalDigest, PortalDigestRow } from "@/lib/api/client";
import { Empty, Page, PageHeader, Section, Table, TableWrap, Td, Th } from "@/components/tw";
import { ErrorState, Loading } from "@/components/states";
import { usePortalSession } from "../portal-frame";
import { browserDay, longDay } from "@/lib/day";

export default function PortalMonthPage() {
  const session = usePortalSession();
  const [month, setMonth] = useState(currentMonth);
  const [digest, setDigest] = useState<PortalDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoaded(false);
    const result = await api.GET("/api/v1/portal/digest", {
      params: { query: { month } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setDigest(null);
      setLoaded(true);
      return;
    }
    setDigest(result.data);
    setError(null);
    setLoaded(true);
  }, [month]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const firm = session?.tenantName ?? "your accountants";

  return (
    <Page>
      <PageHeader
        eyebrow={firm}
        title="Month by month"
        lede={`What ${firm} did for you, one calendar month at a time.`}
      />

      <Section title="Which month" level={2}>
        <div className="flex flex-wrap items-center gap-2">
            {/* THE MONTHS ARE BUILT BACKWARDS FROM TODAY, and there are
                eighteen of them. A free-text month box would make `2026-13`
                reachable — which the API refuses rather than coerces, correctly,
                but a refusal a client can trigger by typing is a refusal that
                should not have been offered. */}
            <select
              className="select"
              value={month}
              aria-label="Month"
              onChange={(e) => setMonth(e.target.value)}
            >
              {recentMonths(18).map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
        </div>
      </Section>

      {!loaded ? (
        <Loading label="Loading that month" />
      ) : digest === null ? (
        <ErrorState message={error ?? "That month could not be loaded."} />
      ) : (
        <DigestBody digest={digest} firm={firm} />
      )}

      {/* SAID OUT LOUD, because a "digest" is a word that implies an inbox.
          Nothing in a typecheck can see this sentence go stale — so when
          transport lands, this is the line to come back to. */}
      <p className="max-w-[var(--measure)] text-sm text-muted">
        This is a page, not an email. {firm} cannot send email or messages from this system
        yet, so nothing about this month has been sent to you.
        Everything here is also on your other pages as it happens.
      </p>
    </Page>
  );
}

function DigestBody({ digest, firm }: { digest: PortalDigest; firm: string }) {
  const nothing =
    digest.filed.length === 0 &&
    digest.documentsAdded.length === 0 &&
    digest.invoiced.length === 0 &&
    digest.asksAnswered.length === 0;

  if (nothing) {
    // A QUIET MONTH IS A REAL ANSWER, and it reads as one. Not an error, not a
    // blank page: "nothing happened" and "this did not load" are different
    // facts and only one of them means somebody should ask.
    return (
      <Empty title={`Nothing recorded in ${monthName(digest.month)}`} icon="check">
        No filing was made, no document was added and nothing was billed in that month. If
        you expected something, ask {firm}. A quiet month here does not always mean a quiet
        month at their end.
      </Empty>
    );
  }

  return (
    <>
      <DigestSection
        title="Filed for you"
        note="Returns and submissions made in that month. The date is when it was filed, not when it was due."
        rows={digest.filed}
      />
      <DigestSection
        title="Documents added"
        note="What was put in your library. All of it is still there, under Documents."
        rows={digest.documentsAdded}
      />
      <DigestSection title="Billed" note="Invoices issued in that month." rows={digest.invoiced} />
      <DigestSection
        title="What you sent back"
        note="Requests you answered. The date is when you first replied. A second file sent later does not move it."
        rows={digest.asksAnswered}
      />
    </>
  );
}

/** One section, drawn only when it has rows. An empty heading on a month view
 *  is four times the noise of an empty heading anywhere else. */
function DigestSection({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: readonly PortalDigestRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <Section title={title} count={rows.length} lede={note} level={2}>
      <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>What</Th>
            <Th>Company</Th>
            <Th>On</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.label}-${row.on}-${String(i)}`}>
              <Td>{row.label}</Td>
              <Td>{row.companyName ?? <span className="text-muted">Your account</span>}</Td>
              <Td>
                <span className="mono">{longDay(row.on)}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      </TableWrap>
    </Section>
  );
}

/** The reader's own calendar month. */
function currentMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The last `n` months, newest first, counted in the READER's calendar.
 *
 * Built by decrementing an integer month rather than by subtracting from a
 * `Date`: `setMonth(m - 1)` on the 31st lands in the wrong month entirely, which
 * is a bug that only appears for three days a quarter.
 */
function recentMonths(n: number): string[] {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(`${String(year)}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-03" → "March 2026". */
function monthName(month: string): string {
  const [year = "", index = ""] = month.split("-");
  return `${MONTHS[Number(index) - 1] ?? index} ${year}`;
}

