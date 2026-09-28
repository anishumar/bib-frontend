"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import { longDay } from "@/lib/day";
import type { LetterSummary } from "@/lib/api/client";
import {
  Card,
  ErrorNotice,
  LinkButton,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader } from "@/components/layout";

/**
 * Engagement letters — what the firm has AGREED, as opposed to what it offered.
 *
 * EVERY ROW LEADS WITH ITS REFERENCE. `EL-2026-0001` is the string the client
 * quotes back down the phone, the one an invoice narrates and a court filing
 * cites; the uuid is the system's name for the letter and this is the firm's.
 * A list that showed only the title made the one question a caller actually
 * asks — "which letter?" — unanswerable from this screen.
 *
 * A new letter is written in the builder (`/engagement-letters/new`, T6.18
 * S6): the client, the country, the issuing company and the money on step 1,
 * the services on step 2, the letter itself on step 3. The draft form that
 * used to sit at the bottom of this list took 40-odd clicks to a sendable
 * letter; the builder takes 9 from a client page.
 */
export default function LettersPage() {
  const router = useRouter();
  const [letters, setLetters] = useState<LetterSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const list = await api.GET("/api/v1/engagement-letters", {});
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setLetters(list.data.letters);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading />;

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="Engagement letters"
        lede="What each client has signed, and what is still a draft."
        aside={
          <div className="cluster">
            <Pill tone="quiet">{letters.length}</Pill>
            <LinkButton href="/engagement-letters/new">New engagement letter</LinkButton>
          </div>
        }
      />
      <ErrorNotice error={error} />

      <Card>
        {letters.length === 0 ? (
          <p className="muted">
            No engagement letters yet.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Ref</Th>
                  <Th>Letter</Th>
                  <Th>Client</Th>
                  <Th>Issued by</Th>
                  <Th>Status</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.letter.id}>
                    {/* The number, first, because it is what somebody arrives
                        holding. */}
                    <Td className="mono">
                      <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.ref}</Link>
                    </Td>
                    <Td>
                      <Link href={`/engagement-letters/${l.letter.id}`}>{l.letter.title}</Link>
                      <div className="muted text-sm">
                        {l.lineCount} {l.lineCount === 1 ? "service" : "services"}
                        {l.letter.advanceRequired && " · advance required"}
                        {l.letter.effectiveFrom !== null && ` · from ${longDay(l.letter.effectiveFrom)}`}
                      </div>
                    </Td>
                    <Td>{l.party.displayName}</Td>
                    {/* WHO is bound, and WHERE the law is — the two questions the
                        jurisdiction alone could never answer, side by side. */}
                    <Td>
                      {l.issuingEntity.displayName}
                      <div className="mono muted text-sm">
                        {l.letter.jurisdiction}
                      </div>
                    </Td>
                    <Td>
                      <Pill tone={l.letter.status === "withdrawn" ? "danger" : "neutral"}>
                        {l.letter.status}
                      </Pill>
                    </Td>
                    <Td align="right" className="mono">
                      {formatMoney(l.totals.net, l.totals.currency)}
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
