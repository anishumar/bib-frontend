"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CountrySelect } from "@/components/country-select";
import { EntityKindSelect } from "@/components/entity-kind-select";
import { YearEndField } from "@/components/year-end-field";
import { api, apiError } from "@/lib/api/client";
import type { OwnedClient, PartySummary } from "@/lib/api/client";
import { Page, PageHeader, useSession } from "@/components/layout";
import { Empty, Loading } from "@/components/states";
import {
  Button,
  Icon,
  LinkButton,
  Card,
  Dialog,
  ErrorNotice,
  Field,
  FieldRow,
  FieldStack,
  Input,
  Pill,
  RowChevron,
  RowLink,
  TabPanel,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  ThChevron,
  Tr,
} from "@/components/ui";
import { keepTyped } from "@/lib/ui/keep-typed";

/**
 * The firm's book: every counterparty it stores.
 *
 * "Client" is the word a firm uses, but the model underneath is a PARTY — a
 * prospect, a client, a director, a related company are all the same kind of
 * row, and which of them a party IS depends on the relationships and
 * opportunities attached to it, not on a type column. That is why this list
 * shows organizations and people together rather than splitting them.
 *
 * THE WAVE 4 SHAPE (2026-09-28): Add a client is the one brand button and opens
 * the form in a dialog (it sat under the whole list before); the whole row opens
 * the client; the kind is a word ("Company", "Person"), never the model's code.
 */
export default function ClientsPage() {
  const router = useRouter();
  const session = useSession();
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"organization" | "person">("organization");
  /** The country picked on the add form, which decides the year-end field (Q076). */
  const [newCountry, setNewCountry] = useState("");
  const kindTabs = useId();
  const addForm = useId();
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
    // THE FIRM'S OWN COMPANIES ARE NOT CLIENTS: they live on Your firm, and a
    // proposal, a letter, a lead or an invoice to one is refused. The API
    // still lists them (a task may be about the firm), so this book hides
    // them, from both tabs and their counts.
    const own = new Set(list.data.parties.filter((p) => p.isOwnCompany).map((p) => p.id));
    setParties(list.data.parties.filter((p) => !own.has(p.id)));
    setMine((book.data?.clients ?? []).filter((c) => !own.has(c.clientPartyId)));
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
              // Q076: required, and abroad the year end too. India's is
              // fixed at 31 March and not sent.
              jurisdiction: String(form.get("jurisdiction") ?? ""),
              entityType: String(form.get("entityType") ?? ""),
              ...(String(form.get("jurisdiction") ?? "") === "IN" ? {} : optional("financialYearEnd")),
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

  if (!loaded) return <Loading label="Loading clients" />;

  return (
    <Page>
      <PageHeader
        title="Clients"
        aside={
          <>
            {/* Loading the firm's existing book from a spreadsheet is an
                administrator's act — the API gates it on tenant:admin — so the
                door is offered only to somebody it will open for. */}
            {session?.permissions.includes("tenant:admin") === true && (
              <LinkButton
                href="/clients/import"
                variant="secondary"
                icon={<Icon name="upload" size={16} />}
              >
                Import from Excel
              </LinkButton>
            )}
            <Button
              onClick={() => {
                setError(null);
                setAdding(true);
              }}
            >
              Add a client
            </Button>
          </>
        }
      />

      {/* A refusal of the add form is shown inside the dialog, where it was
          pressed; this one is the list's own. */}
      <ErrorNotice error={adding ? null : error} />

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
                You are not the Key Manager or SPOC for any client yet.
              </Empty>
            </Card>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Your role</Th>
                    <ThChevron />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((c) => (
                    <Tr key={c.clientPartyId} linked>
                      <Td>
                        <span className="cluster tight">
                          <RowLink href={`/clients/${c.clientPartyId}`}>{c.displayName}</RowLink>
                          {/* Archived clients are shown and marked, not dropped:
                              somebody still holds them, and hiding that makes
                              the book look smaller than the record says. */}
                          {c.archivedAt !== null && (
                            <Pill dot tone="danger">
                              Archived
                            </Pill>
                          )}
                        </span>
                      </Td>
                      {/* One row per client with every role collected — a
                          partner is commonly the Key Manager AND a Dept's SPOC
                          on the same client. */}
                      <Td>
                        {c.roles.map((r) => (r === "key_manager" ? "Key Manager" : "SPOC")).join(", ")}
                      </Td>
                      <RowChevron />
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )
        ) : parties.length === 0 ? (
          <Card>
            <Empty title="No clients yet" icon="clients">
              Add the first one with Add a client.
            </Empty>
          </Card>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Kind</Th>
                  <ThChevron />
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => (
                  <Tr key={p.id} linked>
                    <Td>
                      <span className="cluster tight">
                        <RowLink href={`/clients/${p.id}`}>{p.displayName}</RowLink>
                        {p.archivedAt !== null && (
                          <Pill dot tone="danger">
                            Archived
                          </Pill>
                        )}
                      </span>
                    </Td>
                    <Td>{p.kind === "organization" ? "Company" : "Person"}</Td>
                    <RowChevron />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <p className="muted mt-2">
          Your own companies are on{" "}
          {session?.permissions.includes("tenant:admin") === true ? (
            <Link href={"/admin/firm#companies" as Route}>Your firm</Link>
          ) : (
            "Your firm"
          )}
          .
        </p>
      </TabPanel>

      <Dialog
        open={adding}
        size="lg"
        onClose={() => {
          setAdding(false);
        }}
        title="Add a client"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" form={addForm} loading={busy}>
              Add
            </Button>
          </>
        }
      >
        <FieldStack>
          <ErrorNotice error={error} />
          {/* Organization and person are different rows with different fields,
              so this is a real choice rather than a toggle over one form. */}
          <Tabs
            id={kindTabs}
            label="What kind of record"
            value={kind}
            onChange={setKind}
            tabs={[
              { value: "organization", label: "Company" },
              { value: "person", label: "Person" },
            ]}
          />
          <form
            id={addForm}
            onSubmit={(event) => keepTyped(event, (form) => {
              void create(form);
            })}
          >
            <TabPanel tabsId={kindTabs} value={kind}>
              {kind === "organization" ? (
                <FieldStack>
                  <FieldRow>
                    <Field label="Legal name">
                      <Input
                        name="legalName"
                        required
                        autoFocus
                        placeholder="e.g. Kaveri Foods Pvt Ltd"
                      />
                    </Field>
                    <Field label="Trade name" optional>
                      <Input name="tradeName" placeholder="e.g. Kaveri Foods" />
                    </Field>
                    <Field label="Industry" optional>
                      <Input name="industry" placeholder="e.g. Food processing" />
                    </Field>
                    <Field label="Website" optional>
                      <Input name="website" placeholder="e.g. kaverifoods.in" />
                    </Field>
                  </FieldRow>
                  {/* Q076: country and kind are required on every new client
                      company; the year end too outside India. */}
                  <FieldRow>
                    <Field label="Country">
                      <CountrySelect
                        name="jurisdiction"
                        blankLabel="Choose a country"
                        required
                        value={newCountry}
                        onChange={(e) => {
                          setNewCountry(e.target.value);
                        }}
                      />
                    </Field>
                    <Field label="Kind of company">
                      <EntityKindSelect name="entityType" required />
                    </Field>
                    <YearEndField country={newCountry} />
                  </FieldRow>
                </FieldStack>
              ) : (
                <FieldRow>
                  <Field label="Full name">
                    <Input name="fullName" required autoFocus placeholder="e.g. Asha Verma" />
                  </Field>
                  <Field label="Nationality" optional>
                    <CountrySelect name="nationality" />
                  </Field>
                  <Field label="Date of birth" optional>
                    <Input name="dateOfBirth" type="date" />
                  </Field>
                </FieldRow>
              )}
            </TabPanel>
          </form>
        </FieldStack>
      </Dialog>
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
