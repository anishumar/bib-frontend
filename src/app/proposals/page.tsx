"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, formatMoney } from "@/lib/api/client";
import type { PartySummary, ProposalSummary } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  CardHead,
  ErrorNotice,
  Field,
  FieldRow,
  Input,
  Pill,
  Select,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
  type PillTone,
} from "@/components/ui";
import { browserDay } from "@/lib/day";

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
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, book] = await Promise.all([
      api.GET("/api/v1/proposals", {}),
      api.GET("/api/v1/parties", {}),
    ]);
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
    if (book.data) setParties(book.data.parties);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function draft(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const validUntil = String(form.get("validUntil") ?? "");
    const result = await api.POST("/api/v1/proposals", {
      body: {
        partyId: String(form.get("partyId")),
        title: String(form.get("title")),
        currency: String(form.get("currency")).toUpperCase(),
        // The rate back to the firm's own reporting currency. "1" when quoting
        // in it — sent rather than omitted, so "did we convert this?" is never
        // a question about a missing value.
        fxRate: String(form.get("fxRate")),
        fxRateDate: String(form.get("fxRateDate")),
        ...(validUntil === "" ? {} : { validUntil }),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/proposals/${result.data.id}`);
  }

  if (!loaded) return <Loading label="Loading proposals" />;

  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="Proposals"
        lede="What the firm has quoted, and whether the client has looked at it."
        aside={<Pill tone="quiet">{proposals.length}</Pill>}
      />

      <ErrorNotice error={error} />

      {proposals.length === 0 ? (
        <Card>
          <Empty title="Nothing quoted yet" icon="proposals">
            A proposal is the priced document a prospect receives. Draft the first one below.
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

      <Card>
        <CardHead title="New proposal" level={2} />
        <form
          action={(form) => {
            void draft(form);
          }}
        >
          <div className="stack">
            <FieldRow>
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Client">
                <Select name="partyId" required>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>

            <FieldRow>
              <Field label="Quoted in">
                <Input name="currency" defaultValue="INR" maxLength={3} required />
              </Field>
              <Field label="Rate to the firm&apos;s currency">
                <Input name="fxRate" defaultValue="1" required />
              </Field>
              <Field label="Rate dated">
                <Input name="fxRateDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="Valid until" optional>
                <Input name="validUntil" type="date" />
              </Field>
            </FieldRow>

            <div>
              <Button type="submit" loading={busy}>
                Draft proposal
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </Page>
  );
}

/** Which pill a status wears. `rejected` and `expired` are the same kind of
 *  fact — this one is not going anywhere — and the rest are neutral. */
function toneOf(status: ProposalSummary["proposal"]["status"]): PillTone {
  return status === "rejected" || status === "expired" ? "danger" : "neutral";
}
