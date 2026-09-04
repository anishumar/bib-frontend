"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, apiError } from "@/lib/api/client";
import type { OwnedClient, PartySummary } from "@/lib/api/client";
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
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
} from "@/components/ui";

/**
 * The firm's book: every counterparty it stores.
 *
 * "Client" is the word a firm uses, but the model underneath is a PARTY — a
 * prospect, a client, a director, a related company are all the same kind of
 * row, and which of them a party IS depends on the relationships and
 * opportunities attached to it, not on a type column. That is why this list
 * shows organizations and people together rather than splitting them.
 */
export default function ClientsPage() {
  const router = useRouter();
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"organization" | "person">("organization");
  const kindTabs = useId();
  // Whose book to show. `mine` reads the assignments (G3.2) rather than
  // filtering the party list, because "my clients" is a fact about who was put
  // in charge — not a property of the party row.
  const [scope, setScope] = useState<"all" | "mine">("all");
  const scopeTabs = useId();
  const [mine, setMine] = useState<OwnedClient[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const [list, book] = await Promise.all([
      api.GET("/api/v1/parties", {}),
      // The date is sent, not left to the server. The API runs in UTC and the
      // firm does not: a client assigned this morning in Delhi starts
      // "tomorrow" as far as the server is concerned, and was missing from its
      // holder's own book until the afternoon. Found by opening this page.
      api.GET("/api/v1/my-clients", { params: { query: { asOf: today() } } }),
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
    setParties(list.data.parties);
    setMine(book.data?.clients ?? []);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function create(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    const optional = (name: string): Record<string, string> => {
      const value = String(form.get(name) ?? "").trim();
      return value === "" ? {} : { [name]: value };
    };
    const result =
      kind === "organization"
        ? await api.POST("/api/v1/parties/organizations", {
            body: {
              legalName: String(form.get("legalName")).trim(),
              ...optional("tradeName"),
              ...optional("industry"),
              ...optional("website"),
            },
          })
        : await api.POST("/api/v1/parties/persons", {
            body: {
              fullName: String(form.get("fullName")).trim(),
              ...optional("nationality"),
              ...optional("dateOfBirth"),
            },
          });
    setBusy(false);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    router.push(`/clients/${result.data.partyId}`);
  }

  if (!loaded) return <Loading label="Loading the book" />;

  return (
    <Page>
      <PageHeader
        eyebrow="Commercial"
        title="Clients"
        lede="Everyone the firm holds a record for, and the ones you were put in charge of."
      />

      <ErrorNotice error={error} />

      {/* Two questions, not one filter over one list: "everyone the firm
          stores" and "the clients I was put in charge of". The second is only
          answerable since G3.2 — before it, nothing recorded who owns a
          client. */}
      <Tabs
        id={scopeTabs}
        label="Client views"
        value={scope}
        onChange={setScope}
        tabs={[
          { value: "all", label: "Everyone", count: parties.length },
          { value: "mine", label: "My clients", count: mine.length },
        ]}
      />

      <TabPanel tabsId={scopeTabs} value={scope}>
        {scope === "mine" ? (
          mine.length === 0 ? (
            <Card>
              <Empty title="No clients on your book" icon="clients">
                Somebody is made a Key Manager or a SPOC on the client’s own page.
              </Empty>
            </Card>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Why it is yours</Th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((c) => (
                    <tr key={c.clientPartyId}>
                      <Td>
                        <span className="cluster tight">
                          <Link href={`/clients/${c.clientPartyId}`}>{c.displayName}</Link>
                          {/* Archived clients are shown and marked, not dropped:
                              somebody still holds them, and hiding that makes
                              the book look smaller than the record says. */}
                          {c.archivedAt !== null && <Pill tone="danger">archived</Pill>}
                        </span>
                      </Td>
                      <Td>
                        {/* One row per client with every role collected — a
                            partner is commonly the Key Manager AND a Dept's
                            SPOC on the same client. */}
                        <span className="muted">
                          {c.roles
                            .map((r) => (r === "key_manager" ? "Key Manager" : "SPOC"))
                            .join(" · ")}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        ) : parties.length === 0 ? (
          <Card>
            <Empty title="Nobody in the book yet" icon="clients">
              A client is an organization or a person the firm holds a record for. Add the first
              one below.
            </Empty>
          </Card>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Kind</Th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/clients/${p.id}`}>{p.displayName}</Link>
                    </Td>
                    <Td>
                      <Pill tone="quiet">{p.kind}</Pill>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </TabPanel>

      <Card>
        <CardHead title="Add to the book" level={2} />
        {/* Organization and person are different rows with different fields, so
            this is a real choice rather than a toggle over one form. */}
        <Tabs
          id={kindTabs}
          label="What kind of record"
          value={kind}
          onChange={setKind}
          tabs={[
            { value: "organization", label: "Organization" },
            { value: "person", label: "Person" },
          ]}
        />

        <form
          action={(form) => {
            void create(form);
          }}
        >
          <TabPanel tabsId={kindTabs} value={kind}>
            <div className="stack" style={{ marginTop: "var(--s-4)" }}>
              {kind === "organization" ? (
                <FieldRow>
                  <Field label="Legal name">
                    <Input name="legalName" required />
                  </Field>
                  <Field label="Trade name" optional>
                    <Input name="tradeName" />
                  </Field>
                  <Field label="Industry" optional>
                    <Input name="industry" />
                  </Field>
                  <Field label="Website" optional>
                    <Input name="website" />
                  </Field>
                </FieldRow>
              ) : (
                <FieldRow>
                  <Field label="Full name">
                    <Input name="fullName" required />
                  </Field>
                  <Field label="Nationality" optional>
                    <Input name="nationality" />
                  </Field>
                  <Field label="Date of birth" optional>
                    <Input name="dateOfBirth" type="date" />
                  </Field>
                </FieldRow>
              )}
              <div>
                <Button type="submit" loading={busy}>
                  Add
                </Button>
              </div>
            </div>
          </TabPanel>
        </form>
      </Card>
    </Page>
  );
}

/**
 * Today, in the CALENDAR the person is looking at — not in UTC.
 *
 * `toISOString().slice(0, 10)` is the obvious one-liner and it is a day out for
 * anybody east of Greenwich in the morning. A client's ownership is a calendar
 * fact in the firm's own office.
 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
