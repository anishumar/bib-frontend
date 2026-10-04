"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError, formatTotals, PROPOSAL_STATUS_WORDS } from "@/lib/api/client";
import type { ProposalSummary } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Card,
  ErrorNotice,
  LinkButton,
  NotSet,
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
import { longInstant } from "@/lib/day";

/**
 * What the firm has quoted, and to whom.
 *
 * The list is a summary read — totals and a line COUNT, not the lines. That is
 * the API's shape rather than this screen's choice, and it is why thirty
 * proposals cost one request instead of thirty-one.
 *
 * Money reads "Hidden" for somebody without commercial visibility. The API
 * sends null rather than refusing the row, because "you may not see the fee"
 * and "there is no proposal" are different answers a person acts on
 * differently — so the client and the status are here either way.
 *
 * THE WAVE 4 SHAPE (2026-09-28): New proposal is the one brand button, the
 * whole row opens the proposal, the status is a pill with a dot in words
 * ("Declined", never `rejected`), and the reference is plain text rather than
 * a typewriter code.
 */
export default function ProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const list = await api.GET("/api/v1/proposals", {});
    // A 401 mid-session is ordinary: expired, signed out elsewhere, or the
    // membership was revoked — the API re-checks it on every request.
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setProposals(list.data.proposals);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (!loaded) return <Loading label="Loading proposals" />;

  return (
    <Page>
      <PageHeader
        title="Proposals"
        aside={
          <LinkButton href="/proposals/new" variant="primary">
            New proposal
          </LinkButton>
        }
      />

      <ErrorNotice error={error} />

      {proposals.length === 0 ? (
        <Card>
          <Empty title="Nothing quoted yet" icon="proposals">
            Start the first one with New proposal.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Proposal</Th>
                <Th>Ref</Th>
                <Th>Issued by</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th>Sent on</Th>
                <Th>Opened</Th>
                <ThChevron />
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <Tr key={p.proposal.id} linked>
                  {/* What it is, over who it is for: the client by NAME, from
                      the API's joined read model, never a column of uuids. */}
                  <Td>
                    {/* Capped so a long client name wraps: "Proposal for
                        <a company> Private Limited" put Opened off a 1280
                        screen (76px hidden, the W4D walk). */}
                    <span className="block max-w-72 whitespace-normal">
                      <RowLink href={`/proposals/${p.proposal.id}`}>{p.proposal.title}</RowLink>
                      <Sub>{p.party.displayName}</Sub>
                    </span>
                  </Td>
                  {/* The firm's own number for the document: what a client
                      quotes back and what an audit cites. */}
                  <Td className="nowrap">{p.proposal.ref}</Td>
                  <Td>{p.issuingEntity?.displayName ?? <NotSet />}</Td>
                  <Td>
                    <Pill dot tone={toneOf(p.proposal.status)}>
                      {PROPOSAL_STATUS_WORDS[p.proposal.status]}
                    </Pill>
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatTotals(p.totals) ?? <NotSet>Hidden</NotSet>}
                    {(() => {
                      // A count of services, not money: summed across currencies.
                      const unpriced = p.totals.reduce((n, t) => n + t.unpricedLineCount, 0);
                      return unpriced > 0 && <Sub>{`+ ${String(unpriced)} to be agreed`}</Sub>;
                    })()}
                  </Td>
                  <Td className="nowrap">
                    {p.proposal.sentAt === null ? (
                      <NotSet>Not sent</NotSet>
                    ) : (
                      longInstant(p.proposal.sentAt)
                    )}
                  </Td>
                  {/* The TRACK half of send/track: has the client looked at it. */}
                  <Td className="nowrap">
                    {p.proposal.viewCount === 0 ? (
                      <NotSet>Not yet</NotSet>
                    ) : p.proposal.viewCount === 1 ? (
                      "Once"
                    ) : (
                      `${String(p.proposal.viewCount)} times`
                    )}
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

/** Which pill a status wears. Accepted is done; declined and expired are the
 *  same kind of fact (this one is not going anywhere); draft and sent are
 *  neither good nor bad. */
function toneOf(status: ProposalSummary["proposal"]["status"]): PillTone {
  if (status === "accepted") return "ok";
  return status === "rejected" || status === "expired" ? "danger" : "neutral";
}
