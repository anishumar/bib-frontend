"use client";

import { formatMoney } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { NotSet } from "@/components/ui";
import { Card, Section, Table, TableWrap, Td, Th } from "@/components/tw";
import { currencyLabel } from "@/lib/currency";
import { longDay } from "@/lib/day";

type MrrByCurrency = components["schemas"]["MrrByCurrency"];

/**
 * RECURRING FEES BY CURRENCY (0345, Q009). MRR above stays at the rates the
 * letters were signed at, as agreed; this shows each currency in itself, at
 * those signed rates, and at today's rate from the exchange-rate feed, with
 * the rate's date and source. Shown only when some fee is in another
 * currency: for a firm in one currency it would repeat MRR.
 */
export function FeesByCurrency({ data }: { data: MrrByCurrency }) {
  const own = data.reportingCurrency;
  if (!data.currencies.some((c) => c.currency !== own)) return null;
  const foreignClients = data.clients.filter((c) => c.currency !== own);
  const money = (amount: string | null) => (amount === null ? <NotSet>No rate yet</NotSet> : formatMoney(amount, own));

  return (
    <Section
      title="Recurring fees by currency"
      lede={`A month of recurring fees in each currency, in ${own} at the rates the letters were signed at (what MRR counts) and at today's rate.`}
    >
      <Card className="flex flex-col gap-3">
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Currency</Th>
                <Th align="right">A month, in the currency</Th>
                <Th align="right">{`In ${own}, signed rates`}</Th>
                <Th align="right">{`In ${own}, today's rate`}</Th>
                <Th>Today&apos;s rate</Th>
              </tr>
            </thead>
            <tbody>
              {data.currencies.map((c) => (
                <tr key={c.currency}>
                  <Td>{currencyLabel(c.currency)}</Td>
                  <Td align="right" className="tabular-nums">
                    {formatMoney(c.monthly, c.currency)}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {formatMoney(c.atSignedRates, own)}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {money(c.atTodaysRate)}
                  </Td>
                  <Td className="text-sm text-muted">
                    {c.currency === own
                      ? "Your own currency"
                      : c.todaysRate === null
                        ? "No rate held yet"
                        : `1 ${c.currency} = ${c.todaysRate.fxRate} ${own}, ${c.todaysRate.source}, ${longDay(c.todaysRate.fxRateDate)}`}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="strong">Total</Td>
                <Td align="right" />
                <Td align="right" className="tabular-nums strong">
                  {formatMoney(data.totalAtSignedRates, own)}
                </Td>
                <Td align="right" className="tabular-nums strong">
                  {money(data.totalAtTodaysRate)}
                </Td>
                <Td />
              </tr>
            </tbody>
          </Table>
        </TableWrap>

        {foreignClients.length > 0 && (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th align="right">A month, in the currency</Th>
                  <Th align="right">{`In ${own}, signed rates`}</Th>
                  <Th align="right">{`In ${own}, today's rate`}</Th>
                </tr>
              </thead>
              <tbody>
                {foreignClients.map((c) => (
                  <tr key={`${c.partyId}:${c.currency}`}>
                    <Td>{c.name}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatMoney(c.monthly, c.currency)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatMoney(c.atSignedRates, own)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {money(c.atTodaysRate)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </Section>
  );
}
