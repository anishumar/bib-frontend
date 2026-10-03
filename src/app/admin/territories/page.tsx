"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
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
  NotSet,
  Pill,
  Select,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import type { Member, TerritoryRule } from "@/lib/api/client";
import { CountrySelect } from "@/components/country-select";
import { countryName } from "@/lib/country";
import { keepTyped } from "@/lib/ui/keep-typed";

/**
 * Whose desk covers leads from a country.
 *
 * A territory rule OVERRIDES the assignment rotation: a lead captured from a
 * country named here goes to that desk however loaded it is, and everything
 * else falls through to the rotation, which gives it to whoever is holding the
 * fewest open leads.
 *
 * THERE IS NO WILDCARD ROW, and the screen says so rather than leaving a reader
 * hunting for one. Assignment already has a better fallback than a catch-all:
 * the rotation. A country nobody has claimed is not a gap in the rules.
 *
 * The desk picker is the firm's OWN roster, active staff only — the API refuses
 * anybody else, and offering what will fail is just a slower error. It also
 * checks again at assignment time, because a membership is revoked long after a
 * rule is written; a rule naming somebody who has left quietly stops applying
 * and its leads go to the rotation instead of parking on a dead desk.
 */
export default function TerritoriesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<TerritoryRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const [list, roster] = await Promise.all([
      api.GET("/api/v1/territory-rules", {}),
      api.GET("/api/v1/tenancy/members", {}),
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
    setRules(list.data.rules);
    if (roster.data) setMembers(roster.data.members);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** True when it saved: the form stays on screen and clears for the next country (F05). */
  async function set(form: FormData): Promise<boolean> {
    setBusy(true);
    setError(null);
    const note = String(form.get("note") ?? "");
    const result = await api.POST("/api/v1/territory-rules", {
      body: {
        jurisdiction: String(form.get("jurisdiction")).toUpperCase(),
        ownerUserId: String(form.get("ownerUserId")),
        ...(note === "" ? {} : { note }),
      },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return false;
    }
    await load();
    setBusy(false);
    return true;
  }

  if (!loaded) return <Loading label="Loading territories" />;

  // Only somebody who can actually take a lead. The API applies the same test,
  // twice — here and again when the rule fires.
  const desks = members.filter((m) => m.membership.isActive && m.membership.audience === "STAFF");
  const nameOf = (userId: string): string => {
    const member = members.find((m) => m.membership.userId === userId);
    return member?.displayName ?? member?.email ?? userId;
  };

  return (
    <Page>
      {/* No lede (Wave 4): a country given to a person sends its new leads
          to them; the rest go round the rotation (the line under the table). */}
      <PageHeader title="Territories" />

      <ErrorNotice error={error} />

      {rules.length === 0 ? (
        <Card>
          <Empty title="No territories" icon="territories">
            Every lead goes round the rotation, to whoever holds the fewest open leads.
          </Empty>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Country</Th>
                <Th>Goes to</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {countryName(r.jurisdiction)} <Pill tone="code">{r.jurisdiction}</Pill>
                  </Td>
                  {/* The roster is already loaded for the picker, so naming the
                      desk costs nothing extra here. If this list ever outgrows
                      the roster read, the join belongs in the API. */}
                  <Td>{nameOf(r.ownerUserId)}</Td>
                  <Td>{r.note === null ? <NotSet /> : r.note}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      {rules.length > 0 && (
        <p className="field-hint">
          Every other country goes round the rotation, to whoever has the fewest open leads.
        </p>
      )}

      <Card>
        {/* Setting a country that has someone moves it; leads already
            assigned under the old rule stay where they are. */}
        <CardHead title="Set a territory" level={2}>
          <p className="lede">One person per country. Setting it again moves new leads only.</p>
        </CardHead>
        <form
          onSubmit={(event) => keepTyped(event, (form) => set(form))}
        >
          <div className="stack">
            <FieldRow>
              {/* A picker, not a two-letter box: the value is still the
                  country code the API takes. */}
              <Field label="Country">
                <CountrySelect name="jurisdiction" blankLabel="Choose a country" required />
              </Field>
              <Field label="Goes to">
                <Select name="ownerUserId" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {desks.map((m) => (
                    <option key={m.membership.userId} value={m.membership.userId}>
                      {m.displayName ?? m.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Why" optional>
                <Input name="note" placeholder="e.g. Looks after our UK clients" />
              </Field>
            </FieldRow>
            <div>
              <Button type="submit" loading={busy}>
                Set territory
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </Page>
  );
}
