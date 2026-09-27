"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { ProposalSummary } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Card,
  ErrorNotice,
  LinkButton,
  Pill,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  type PillTone,
} from "@/components/ui";

/**
 * What the firm has quoted, and to whom.
 *
 * The list is a summary read — totals and a line COUNT, not the lines. That is
 * the API's shape rather than this screen's choice, and it is why thirty
 * proposals cost one request instead of thirty-one.
 *
 * Money renders as an em dash for somebody without commercial visibility. The
 * API sends null rather than refusing the row, because "you may not see the
 * fee" and "there is no proposal" are different answers a person acts on
 * differently — so the client and the status are here either way.
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
        eyebrow="Commercial"
        title="Proposals"
        lede="Every quote the firm is drafting or has sent, and whether the client has opened it."
        aside={
          <>
            <Pill tone="quiet">{proposals.length}</Pill>
            <LinkButton href="/proposals/new">New proposal</LinkButton>
          </>
        }
      />

      <ErrorNotice error={error} />

      {proposals.length === 0 ? (
        <Card>
          <Empty title="Nothing quoted yet" icon="proposals">
            A proposal is the priced document a prospect receives. Start the first one with New
            proposal.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Ref</Th>
                <Th>Proposal</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th>Opened</Th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.proposal.id}>
                  {/* The firm's own number for the document, first: it is what
                      a client quotes back and what an audit cites. */}
                  <Td>
                    <Link href={`/proposals/${p.proposal.id}`} className="mono">
                      {p.proposal.ref}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/proposals/${p.proposal.id}`}>{p.proposal.title}</Link>
                    <Sub>
                      {p.lineCount} {p.lineCount === 1 ? "line" : "lines"}
                    </Sub>
                  </Td>
                  {/* The client by NAME. The API returns a joined read model, so
                      a list of quotes is not a column of uuids. */}
                  <Td>{p.party.displayName}</Td>
                  <Td>
                    <Pill tone={toneOf(p.proposal.status)}>{p.proposal.status}</Pill>
                  </Td>
                  <Td align="right">
                    <span className="mono">{formatMoney(p.totals.net, p.totals.currency)}</span>
                  </Td>
                  {/* The TRACK half of send/track: has the client looked at it. */}
                  <Td>
                    {p.proposal.viewCount === 0 ? (
                      <span className="empty">not yet</span>
                    ) : (
                      <span className="mono">{p.proposal.viewCount}×</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

    </Page>
  );
}

/** Which pill a status wears. `rejected` and `expired` are the same kind of
 *  fact — this one is not going anywhere — and the rest are neutral. */
function toneOf(status: ProposalSummary["proposal"]["status"]): PillTone {
  return status === "rejected" || status === "expired" ? "danger" : "neutral";
}
