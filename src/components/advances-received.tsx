"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { api, apiError, formatCount, formatMoney, invoiceNumberWords } from "@/lib/api/client";
import type { LetterAdvancesReceived } from "@/lib/api/client";
import { cleanAmount } from "@/lib/money";
import { longDay } from "@/lib/day";
import {
  AmountInput,
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorNotice,
  Notice,
  NotSet,
  Sub,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";

/**
 * ADVANCE RECEIVED (0363, Q048 scenario 1): money the client paid before this
 * letter, named on it. The PDF prints "Advance received: INV/..., to be
 * adjusted against the fees above", and when the letter is signed each one is
 * mapped to it (the smaller of the amount named and what is still unmapped
 * then), so it comes off the letter's earliest bills, before tax.
 *
 * A letter that names one still raises its own "Advance required" invoice: that
 * is further money (the user, 2026-10-05), so the card says so when both are set.
 * On a draft the person ticks the client's advances and the amount; once the
 * letter is sent it is what the letter says. Renders nothing for a client with
 * no advance to name.
 */
export function AdvancesReceived({
  letterId,
  editable,
  advanceRequired,
  seesFees,
}: {
  letterId: string;
  editable: boolean;
  advanceRequired: boolean;
  seesFees: boolean;
}) {
  const [data, setData] = useState<LetterAdvancesReceived | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/engagement-letters/{letterId}/advances-received", {
      params: { path: { letterId } },
    });
    if (result.data === undefined) return;
    setData(result.data);
    setPicked(Object.fromEntries(result.data.named.map((n) => [n.advance.id, formatCount(n.amount ?? "")])));
  }, [letterId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (data === null) return null;
  if (data.named.length === 0 && (!editable || data.candidates.length === 0)) return null;

  const rows = [...data.named.map((n) => n.advance), ...(editable ? data.candidates : [])];

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.PUT("/api/v1/engagement-letters/{letterId}/advances-received", {
      params: { path: { letterId } },
      body: {
        advances: Object.entries(picked)
          .map(([adhocAdvanceId, typed]) => ({ adhocAdvanceId, amount: cleanAmount(typed) }))
          .filter((a) => a.amount !== ""),
      },
    });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

  const changed =
    JSON.stringify(Object.entries(picked).filter(([, v]) => cleanAmount(v) !== "").sort()) !==
    JSON.stringify(data.named.map((n) => [n.advance.id, formatCount(n.amount ?? "")]).sort());

  return (
    <Card>
      <CardTitle level={2}>Advance received</CardTitle>
      <ErrorNotice error={error} />
      {advanceRequired && Object.keys(picked).length > 0 && (
        <Notice tone="warn">This letter also asks for a further advance, invoiced when it is signed.</Notice>
      )}
      <TableWrap>
        <Table>
          <thead>
            <tr>
              {editable && <Th />}
              <Th>Invoice</Th>
              <Th align="right">Left to map</Th>
              <Th align="right">Named on this letter</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const on = picked[a.id] !== undefined;
              return (
                <tr key={a.id} data-received={a.id}>
                  {editable && (
                    <Td>
                      <Checkbox
                        label=""
                        aria-label={`Name ${a.invoice.number ?? "this advance"} on the letter`}
                        checked={on}
                        disabled={!seesFees}
                        onChange={(e) => {
                          const next = { ...picked };
                          if (e.target.checked) next[a.id] = formatCount(a.unmapped ?? "");
                          else delete next[a.id];
                          setPicked(next);
                        }}
                      />
                    </Td>
                  )}
                  <Td className="nowrap">
                    <Link href={`/invoices/${a.invoice.id}` as Route}>{invoiceNumberWords(a.invoice.number, a.invoice.status)}</Link>
                    {a.invoice.issuedOn !== null && <Sub>Issued {longDay(a.invoice.issuedOn)}</Sub>}
                  </Td>
                  <Td align="right" className="nowrap">
                    {a.unmapped === null ? <NotSet>Hidden</NotSet> : formatMoney(a.unmapped, a.currency)}
                  </Td>
                  <Td align="right">
                    {editable && on ? (
                      <AmountInput
                        aria-label={`Amount of ${a.invoice.number ?? "the advance"} named`}
                        value={picked[a.id] ?? ""}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setPicked((p) => ({ ...p, [a.id]: value }));
                        }}
                      />
                    ) : (
                      (() => {
                        const named = data.named.find((n) => n.advance.id === a.id);
                        if (named === undefined) return <NotSet>Not named</NotSet>;
                        return named.amount === null ? <NotSet>Hidden</NotSet> : formatMoney(named.amount, a.currency);
                      })()
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      {editable && seesFees && (
        <div className="cluster">
          <Button
            variant="secondary"
            loading={busy}
            disabled={!changed}
            onClick={() => {
              void save();
            }}
          >
            Save what the letter names
          </Button>
        </div>
      )}
      {data.letterStatus === "signed" && <Sub>Mapped to this letter when it was signed.</Sub>}
    </Card>
  );
}
