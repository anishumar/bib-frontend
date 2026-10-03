"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { ObligationRule } from "@/lib/api/client";
import { Button, Card, ErrorNotice, LinkButton, Notice, scrollBelowBar } from "@/components/ui";
import { Loading } from "@/components/states";
import { Page, PageHeader, useSession } from "@/components/layout";
import { createBodyOf, type RuleDraft } from "../../admin/obligation-rules/rule-editor";
import { NewServiceFilings, willConfirm } from "../compliance-filings";
import { ServiceForm, stillRefused, type Refusals } from "../service-form";
import { bodyOf, draftOf, keyFrom, refusalsOf, type ServiceDraft } from "../service";
import {
  ARRIVAL_KEY,
  FailureNote,
  currencyList,
  currencyOf,
  failureOf,
  loadFormContext,
  suggestedCountries,
  type Arrival,
  type Failure,
  type FormContext,
} from "../shared";

/**
 * ADD A SERVICE (Wave 4 brief §8.4): the Catalogue's one primary button opens
 * this, one clean form in four short sections: Basics, Price, What's included,
 * and the compliance filings (optional).
 *
 * THE KEY IS MADE FROM THE NAME. The registry needs a permanent lower-case
 * handle that every proposal and letter pins through; the form used to ask for
 * it ("Short name, lower case, no spaces"), which is a system slug on screen.
 * `keyFrom` makes it, unique among the firm's services, and nobody sees it but
 * the URL.
 *
 * "Add the service" PUBLISHES it, so it can be quoted at once and shows in the
 * proposal builder under its countries; "Save as draft" leaves it unpublished.
 * A new service has no proposal pinned to it, so there is nothing a publish
 * could move.
 *
 * THREE KINDS OF CALL, IN ORDER, AND NOT ONE TRANSACTION (unchanged from the
 * old form). The service first, because every filing link names its catalogue
 * entry and there is none before it; then each filing from the library, then
 * each one written here (the create links it in the same call); then the
 * publish. A filing refused after the service went in is said filing by
 * filing, with the API's own sentence, on the service's page, where it can be
 * added again. A refused SERVICE sends nothing else and keeps the form and the
 * list, so nothing is chosen twice.
 *
 * The filings section sits OUTSIDE the `<form>`: the filing editor is a column
 * of text boxes, and Enter in a box inside a form would submit a half-written
 * service. The buttons reach the form by its id.
 */
export default function NewServicePage() {
  const router = useRouter();
  const session = useSession();
  const formId = useId();
  const [ctx, setCtx] = useState<FormContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [refused, setRefused] = useState<Refusals>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  // The compliance filings the new service will carry, sent once it exists.
  const [chosen, setChosen] = useState<readonly ObligationRule[]>([]);
  const [drafts, setDrafts] = useState<readonly RuleDraft[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const context = await loadFormContext();
    if ("status" in context) {
      if (context.status === 401) {
        router.push("/login");
        return;
      }
      setError(context.message);
      return;
    }
    setCtx(context);
    setDraft((d) => d ?? draftOf(null, context.reportingCurrency));
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (draft !== null) document.getElementById(`${formId}-name`)?.focus();
    // Once, when the form first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft === null, formId]);

  if (error !== null) {
    return (
      <Page>
        <PageHeader eyebrow={<Link href="/catalogue">Catalogue</Link>} title="Add a service" />
        <ErrorNotice error={error} />
      </Page>
    );
  }
  if (ctx === null || draft === null) return <Loading label="Loading the form" />;
  if (session !== null && (!session.permissions.includes("tenant:admin") || session.commercialVisibility !== true)) {
    return (
      <Page>
        <PageHeader eyebrow={<Link href="/catalogue">Catalogue</Link>} title="Add a service" />
        <Notice>
          {session.permissions.includes("tenant:admin")
            ? "A service carries its price, so it is added by somebody who can see fees."
            : "Only an administrator can add a service."}
        </Notice>
      </Page>
    );
  }

  async function add(mode: "publish" | "draft"): Promise<void> {
    if (ctx === null || draft === null) return;
    const local = refusalsOf(draft);
    setRefused(local);
    const first = (["name", "slaDays", "amount"] as const).find((f) => local[f] !== undefined);
    if (first !== undefined) {
      const id = `${formId}-${first}`;
      scrollBelowBar(id);
      document.getElementById(id)?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    setFailure(null);
    const name = draft.name.trim();
    const key = keyFrom(name, new Set(ctx.services.map((s) => s.entry.key)));
    const made = await api.POST("/api/v1/config/{kind}", {
      params: { path: { kind: "service" } },
      body: { key, body: bodyOf(draft, null) },
    });
    if (!made.data) {
      setFailure(failureOf("add", made.error));
      setBusy(false);
      return;
    }
    const serviceEntryId = made.data.entry.id;
    const added: string[] = [];
    const confirmed: string[] = [];
    const failed: { name: string; message: string }[] = [];
    for (const rule of chosen) {
      const linked = await api.POST("/api/v1/services/{serviceEntryId}/filings", {
        params: { path: { serviceEntryId } },
        body: { ruleId: rule.id },
      });
      if (!linked.data) {
        failed.push({ name: rule.name, message: apiError(linked.error).message });
        continue;
      }
      added.push(rule.name);
      if (linked.data.effect.confirmed) confirmed.push(rule.name);
    }
    for (const d of drafts) {
      const written = await api.POST("/api/v1/obligation-rules", {
        body: { ...createBodyOf(d), serviceEntryIds: [serviceEntryId] } as never,
      });
      if (written.error) {
        failed.push({ name: d.name.trim(), message: apiError(written.error).message });
        continue;
      }
      added.push(d.name.trim());
    }
    let unpublished: string | null = null;
    if (mode === "publish") {
      const put = await api.POST("/api/v1/config/{kind}/{key}/versions/{version}/publish", {
        params: { path: { kind: "service", key, version: made.data.draft?.version ?? 1 } },
      });
      if (put.error) unpublished = apiError(put.error).message;
    }
    const arrival: Arrival = {
      sentence: addedSentence(name, mode === "publish" && unpublished === null, added, confirmed),
      failed,
      unpublished,
    };
    try {
      window.sessionStorage.setItem(`${ARRIVAL_KEY}.${key}`, JSON.stringify(arrival));
    } catch {
      /* The service is added either way; its page says it is a draft or live. */
    }
    router.push(`/catalogue/${key}` as Route);
  }

  const confirming = chosen.filter(willConfirm);

  return (
    <Page>
      <PageHeader eyebrow={<Link href="/catalogue">Catalogue</Link>} title="Add a service" />
      <ServiceForm
        formId={formId}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setRefused((shown) => stillRefused(shown, refusalsOf(next)));
        }}
        axes={ctx.axes}
        workflows={ctx.workflows}
        suggestedCountries={suggestedCountries(ctx)}
        currencies={currencyList(ctx, draft.currency)}
        currencyFor={currencyOf(ctx)}
        refused={refused}
        onSubmit={(mode) => void add(mode)}
      />
      <Card>
        <NewServiceFilings
          filings={ctx.filings}
          unread={ctx.filingsUnread}
          busy={busy}
          chosen={chosen}
          drafts={drafts}
          onChosen={setChosen}
          onDrafts={setDrafts}
        />
      </Card>
      <div className="stack snug">
        {failure !== null && <FailureNote failure={failure} />}
        {confirming.length > 0 && (
          // SAID BESIDE THE PRESS THAT DOES IT: adding the service confirms
          // these dates, and each is written out in words above.
          <p className="text-md">
            Adding the service also confirms the dates of {confirming.map((r) => r.name).join(", ")}.
          </p>
        )}
        <div className="cluster">
          <Button type="submit" form={formId} value="publish" loading={busy} disabled={busy}>
            Add the service
          </Button>
          <Button type="submit" form={formId} value="draft" variant="secondary" disabled={busy}>
            Save as draft
          </Button>
          <LinkButton variant="ghost" href="/catalogue">
            Cancel
          </LinkButton>
        </div>
      </div>
    </Page>
  );
}

/** "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
}

/**
 * After adding. A NEW service has no client yet, so nothing reaches the
 * calendar, and the sentence says so: "3 filings added" over an unchanged
 * calendar reads as a press that half worked.
 */
function addedSentence(
  name: string,
  live: boolean,
  added: readonly string[],
  confirmed: readonly string[],
): string {
  const state = live ? "is added and live. It can be quoted now." : "is added as a draft. Publish it to quote it.";
  if (added.length === 0) return `${name} ${state}`;
  const filings = `${String(added.length)} compliance ${added.length === 1 ? "filing" : "filings"}`;
  const sure = confirmed.length === 0 ? "" : ` The dates of ${listed(confirmed)} are confirmed now.`;
  return (
    `${name} ${state} It carries ${filings}: ${listed(added)}.${sure}` +
    " No client is on it yet, so nothing goes on the calendar until one signs for it."
  );
}
