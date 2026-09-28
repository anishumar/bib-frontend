"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, codeLabel, formatMoney } from "@/lib/api/client";
import { countryName } from "@/lib/country";
import { longDay } from "@/lib/day";
import type { LetterSummary } from "@/lib/api/client";
import {
  Card,
  ErrorNotice,
  LinkButton,
  Pill,
  RowChevron,
  RowLink,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  ThChevron,
  Tr,
  type PillTone,
} from "@/components/ui";
import { Empty, Loading } from "@/components/states";
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
      {/* THE WAVE 4 SHAPE (2026-09-28), the proposals list's: New engagement
          letter is the one brand button, the whole row opens the letter, the
          client sits under the title, the status is a pill in words. */}
      <PageHeader
        title="Engagement letters"
        aside={
          <LinkButton href="/engagement-letters/new" variant="primary">
            New engagement letter
          </LinkButton>
        }
      />
      <ErrorNotice error={error} />

      {letters.length === 0 ? (
        <Card>
          <Empty title="No engagement letters yet" icon="proposals">
            Start one with New engagement letter.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Letter</Th>
                <Th>Ref</Th>
                <Th>Issued by</Th>
                <Th>Status</Th>
                <Th align="right">Value</Th>
                <ThChevron />
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <Tr key={l.letter.id} linked>
                  <Td>
                    <RowLink href={`/engagement-letters/${l.letter.id}`}>{l.letter.title}</RowLink>
                    <Sub>
                      {l.party.displayName} · {l.lineCount}{" "}
                      {l.lineCount === 1 ? "service" : "services"}
                      {l.letter.advanceRequired && " · advance required"}
                      {l.letter.effectiveFrom !== null && ` · from ${longDay(l.letter.effectiveFrom)}`}
                    </Sub>
                  </Td>
                  {/* The number is what somebody arrives holding: the string a
                      client quotes back and an invoice narrates. */}
                  <Td className="nowrap">{l.letter.ref}</Td>
                  {/* WHO is bound, and WHERE the law is — the two questions the
                      jurisdiction alone could never answer, side by side. */}
                  <Td>
                    {l.issuingEntity.displayName}
                    <Sub>{countryName(l.letter.jurisdiction)}</Sub>
                  </Td>
                  <Td>
                    <Pill dot tone={letterTone(l.letter.status)}>
                      {codeLabel(l.letter.status)}
                    </Pill>
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(l.totals.net, l.totals.currency)}
                  </Td>
                  <RowChevron />
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Page>
  );
}

/** Signed is done, withdrawn is over; a draft and a sent letter are neither. */
function letterTone(status: LetterSummary["letter"]["status"]): PillTone {
  if (status === "signed") return "ok";
  return status === "withdrawn" ? "danger" : "neutral";
}
