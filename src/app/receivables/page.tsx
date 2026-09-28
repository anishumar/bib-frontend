"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError, codeLabel, formatMoney } from "@/lib/api/client";
import type { PendingDunning, Receivable } from "@/lib/api/client";
import { Page, PageHeader, Section } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Card,
  ErrorNotice,
  Icon,
  Input,
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
} from "@/components/ui";
import { browserDay, longDay } from "@/lib/day";
import { OwedPicture } from "./owed-picture";

/**
 * Who owes the firm money, and what is being done about it.
 *
 * Two lists that answer two different questions. The first is arithmetic —
 * every issued invoice with something still on it, computed by the database
 * over invoices, payments and credit notes. The second is POLICY: the rungs the
 * worker climbed to and stopped at, because credit hold and legal action are
 * the two things on the ladder a firm cannot take back with an apology.
 *
 * THE DECISION QUEUE IS THE POINT OF THIS SCREEN. A machine may chase; only a
 * person may put a client on credit hold. The worker leaves the rung
 * `pending_approval` and nothing further happens until somebody here decides —
 * and a rejection is recorded as loudly as an approval, because "we considered
 * legal action and decided against it" is a fact somebody wants three months
 * later.
 */
export default function ReceivablesPage() {
  const router = useRouter();
  const [owing, setOwing] = useState<Receivable[]>([]);
  const [pending, setPending] = useState<PendingDunning[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, queue, me] = await Promise.all([
      api.GET("/api/v1/receivables", {}),
      api.GET("/api/v1/dunning/pending", {}),
      api.GET("/api/v1/auth/me", {}),
    ]);
    if (list.response.status === 401) {
      router.push("/login");
      return;
    }
    if (list.error) {
      setError(apiError(list.error).message);
      setLoaded(true);
      return;
    }
    setOwing(list.data.receivables);
    if (queue.data) setPending(queue.data.actions);
    if (me.data) setPermissions(me.data.permissions);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function decide(actionId: string, approve: boolean, note: string): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.POST("/api/v1/dunning/{actionId}/decide", {
      params: { path: { actionId } },
      body: { approve, ...(note === "" ? {} : { note }) },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!loaded) return <Loading label="Loading receivables" />;

  const mayDecide = permissions.includes("tenant:admin");
  // THE READER'S OWN CALENDAR DAY. `toISOString()` here is the UTC day, which
  // is yesterday in India until 05:30 every morning — so something due
  // yesterday would not read as overdue for those five and a half hours.
  const today = browserDay();

  return (
    <Page>
      {/* THE WAVE 4 SHAPE (2026-09-28): no eyebrow or lede; the decision queue
          stays first (it is the point of the screen) but an empty one is one
          line, not a card; the outstanding rows open their invoice; figures in
          the sans face. */}
      <PageHeader
        title="Receivables"
        aside={
          <LinkButton variant="ghost" href="/invoices" iconAfter={<Icon name="arrowRight" size={16} />}>
            Invoices
          </LinkButton>
        }
      />

      <ErrorNotice error={error} />

      {/* ── The picture (Wave 5): two figures and two charts, from the same
          rows as the Outstanding table, only when something is owed. */}
      <OwedPicture owing={owing} today={today} />

      {/* ── Waiting for a person ───────────────────────────────────────── */}
      <Section title="Waiting for a decision" level={2}>
        {pending.length === 0 ? (
          <p className="muted">Nothing needs a decision.</p>
        ) : (
          <>
            {/* These rungs are never applied automatically. */}
            <p className="muted">Credit hold and legal action need a partner&apos;s approval.</p>
            <TableWrap>
              <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Invoice</Th>
                  <Th>Step</Th>
                  <Th align="right">Outstanding</Th>
                  {mayDecide && <Th>Decide</Th>}
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.action.id}>
                    {/* WHOSE. The decision is "put this client on credit hold",
                        and a queue that showed a uuid would be asking somebody
                        to approve something they cannot see. */}
                    <Td>{p.party.displayName}</Td>
                    <Td>
                      <Link href={`/invoices/${p.action.invoiceId}`}>{p.invoiceNumber}</Link>
                      <Sub>Due {p.dueOn === null ? "date not set" : longDay(p.dueOn)}</Sub>
                    </Td>
                    <Td>
                      <Pill tone="danger">{codeLabel(p.action.action)}</Pill>
                      <Sub>
                        Step {p.action.step}, {p.action.afterDays} days after due
                      </Sub>
                    </Td>
                    {/* Read NOW, not when the rung fired. A debt settled since
                        is exactly the case a partner rejects, and a stale
                        figure would hide it. */}
                    <Td align="right" className="nowrap">
                      {formatMoney(p.outstanding, p.currency)}
                    </Td>
                    {mayDecide && (
                      <Td>
                        <form
                          action={(form) => {
                            void decide(
                              p.action.id,
                              String(form.get("verdict")) === "approve",
                              String(form.get("why") ?? ""),
                            );
                          }}
                        >
                          <div className="cluster">
                            <Input
                              size="sm"
                              name="why"
                              aria-label="Why"
                              placeholder="e.g. Paid in full on Friday"
                            />
                            <Button
                              size="sm"
                              variant="destructive-quiet"
                              type="submit"
                              name="verdict"
                              value="approve"
                              disabled={busy}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              type="submit"
                              name="verdict"
                              value="reject"
                              disabled={busy}
                            >
                              Reject
                            </Button>
                          </div>
                        </form>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
              </Table>
            </TableWrap>
            <p className="field-hint">
              {mayDecide
                ? "A decision is final. Rejecting is recorded too."
                : "Only a firm administrator can decide these."}
            </p>
          </>
        )}
      </Section>

      {/* ── What is owed ───────────────────────────────────────────────── */}
      <Section title="Outstanding" level={2}>
        {owing.length === 0 ? (
          <Card>
            <Empty title="Nothing outstanding" icon="check">
              Drafts and cancelled invoices are not owed.
            </Empty>
          </Card>
        ) : (
          <TableWrap>
            <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Invoice</Th>
                <Th>Due</Th>
                <Th align="right">Invoiced</Th>
                <Th align="right">Paid</Th>
                <Th align="right">Credited</Th>
                <Th align="right">Outstanding</Th>
                <ThChevron />
              </tr>
            </thead>
            <tbody>
              {owing.map((r) => (
                <Tr key={r.balance.invoiceId} linked>
                  <Td>{r.party.displayName}</Td>
                  <Td className="nowrap">
                    <RowLink href={`/invoices/${r.balance.invoiceId}`}>{r.number}</RowLink>
                  </Td>
                  <Td className="nowrap">
                    {r.balance.dueOn === null ? <NotSet>No date</NotSet> : longDay(r.balance.dueOn)}
                    {/* A receivable with no due date is never chased — the firm
                        never said when to pay, and the ladder counts days from
                        a date that does not exist. Worth seeing on this screen
                        rather than wondering why nothing happened. */}
                    {r.balance.dueOn !== null && r.balance.dueOn < today && (
                      <span className="sub tone-danger">Overdue</span>
                    )}
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(r.balance.invoiced, r.balance.currency)}
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(r.balance.paid, r.balance.currency)}
                  </Td>
                  <Td align="right" className="nowrap">
                    {formatMoney(r.balance.credited, r.balance.currency)}
                  </Td>
                  <Td align="right" className="nowrap">
                    <strong>{formatMoney(r.balance.outstanding, r.balance.currency)}</strong>
                  </Td>
                  <RowChevron />
                </Tr>
              ))}
            </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>
    </Page>
  );
}
