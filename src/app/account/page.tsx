"use client";

/**
 * Your account — the colleague's half of the password screens (0082).
 *
 * ── WHY THERE WAS NO SUCH SCREEN ──────────────────────────────────────────
 *
 * Because there was no such API. The only route in this product that has ever
 * written a credential is on the platform's `/internal` surface, behind a key
 * no browser holds, and its own description said *"self-service password change
 * arrives with the portal."* The portal arrived; this did not. So a colleague
 * could not set a first password, and anybody the platform had seeded one for
 * could not rotate it without asking the platform.
 *
 * ── AND WHY IT IS ONE CARD AND NOT A SETTINGS AREA ────────────────────────
 *
 * Everything else about a person at a firm — their role, their grade, who they
 * report to, whether they still have access — is the FIRM's to decide and lives
 * on `/admin/people`, behind `tenant:admin`. A password is the one fact about a
 * login that belongs to the person holding it and to nobody else, including
 * their own partners. So this screen is exactly that one fact, and a second
 * card here would need to be something equally theirs.
 *
 * ── TECHNICAL DETAILS: WHICH BUILD IS LIVE (V0.2) ─────────────────────────
 *
 * Closed, and last, for support: the commit and build time the API reports on
 * `/health`. Nobody could tell which build QA ran, or whether a migration had
 * gone out, without asking whoever deployed it. `/health` is public and cheap,
 * and a failure to read it hides the line rather than showing an error on a
 * page about something else.
 */

import { useCallback, useEffect, useState } from "react";
import { api, apiError, codeLabel } from "@/lib/api/client";
import type { Principal } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import { ChangePassword } from "@/components/account/change-password";
import { Button, ErrorNotice, Field, Input, Meta, MetaItem, NotSet } from "@/components/ui";
import { longInstantTime } from "@/lib/day";
import { keepTyped } from "@/lib/ui/keep-typed";
import { NotificationSettings } from "@/components/notify/settings";

type Build = { readonly commit: string | null; readonly builtAt: string | null };

export default function AccountPage() {
  const [me, setMe] = useState<Principal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [build, setBuild] = useState<Build | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);


  // Its own read rather than the shell's `useSession`, because this screen
  // CHANGES what that answer is: a password change replaces the session and
  // flips `hasPassword`, and the card has to be able to ask again afterwards.
  const load = useCallback(async (): Promise<void> => {
    const { data, error: failed } = await api.GET("/api/v1/auth/me", {});
    if (failed) {
      // A 401 here is handled by the shell, which routes to /login. Anything
      // else is shown as the API worded it.
      setError("Your account could not be read. Reload the page.");
      setLoaded(true);
      return;
    }
    setMe(data);
    setLoaded(true);
  }, []);

  /** Your OWN name (V2.5): the account is yours at every firm, so only you change it. */
  async function rename(form: FormData): Promise<void> {
    setRenaming(true);
    setNameError(null);
    const result = await api.PATCH("/api/v1/tenancy/me", {
      body: { displayName: String(form.get("displayName") ?? "").trim() },
    });
    setRenaming(false);
    if (result.error) {
      setNameError(apiError(result.error).message);
      return;
    }
    await load();
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const { data } = await api.GET("/health", {});
      if (data !== undefined) setBuild({ commit: data.commit, builtAt: data.builtAt });
    })();
  }, []);

  if (!loaded) return <Loading label="Reading your account" />;

  return (
    <Page width="narrow">
      {/* No lede (Wave 4). Role, grade and reporting line are the firm's and
          live on /admin/people; this page is your password only. */}
      <PageHeader title="Your account" />

      <ErrorNotice error={error} />

      {me === null ? null : (
        <Stack gap="tight">
          <Meta>
            <MetaItem label="Signed in as">{me.displayName ?? me.email ?? <NotSet />}</MetaItem>
            <MetaItem label="Email">{me.email ?? <NotSet />}</MetaItem>
            {/* The FIRM, by name. An account is global — one login, however many
                firms — so it is worth saying which one this session is acting
                as, even though the password belongs to none of them. */}
            <MetaItem label="Firm">{me.tenantName ?? "No firm selected"}</MetaItem>
            <MetaItem label="Role">{me.role === null ? <NotSet /> : codeLabel(me.role)}</MetaItem>
            {/* Whether this login sees what the firm charges. It used to be a
                third fragment on the top bar of every screen (" · fees
                visible"); it is a fact about THIS person, it does not change,
                and this is the person's own page. The firm sets it, on
                /admin/people. */}
            <MetaItem label="Fees">
              {me.commercialVisibility === true ? "Visible to you" : "Hidden from you"}
            </MetaItem>
          </Meta>

          <details className="disclosure">
            <summary>Change your name</summary>
            <form
              className="stack tight"
              onSubmit={(event) => keepTyped(event, (form) => {
                void rename(form);
              })}
            >
              <Field label="Your name" hint="Shown to everyone at every firm you belong to.">
                <Input name="displayName" required defaultValue={me.displayName ?? ""} placeholder="e.g. Asha Verma" />
              </Field>
              <ErrorNotice error={nameError} />
              <div className="cluster">
                <Button type="submit" variant="secondary" loading={renaming}>
                  Save
                </Button>
              </div>
            </form>
          </details>

          <ChangePassword
            hasPassword={me.hasPassword}
            email={me.email}
            elsewhere="Changing it signs you out of every other browser and device. This tab stays signed in."
            onChanged={() => {
              void load();
            }}
          />

          <details className="disclosure">
            <summary>Notifications</summary>
            <NotificationSettings owner="mine" />
          </details>

          {/* For an ADMINISTRATOR, and only when the build says something
              (CA#57): "Build Not set / Built Not set" meant nothing to anybody
              else, and support asks the administrator anyway. */}
          {build === null ||
          !me.permissions.includes("tenant:admin") ||
          (build.commit === null && build.builtAt === null) ? null : (
            <details className="disclosure">
              <summary>Technical details</summary>
              <Meta>
                <MetaItem label="Build">
                  {build.commit === null ? (
                    <NotSet />
                  ) : (
                    <span className="mono" title={build.commit}>
                      {build.commit.slice(0, 7)}
                    </span>
                  )}
                </MetaItem>
                <MetaItem label="Built">
                  {build.builtAt === null ? <NotSet /> : longInstantTime(build.builtAt)}
                </MetaItem>
              </Meta>
            </details>
          )}
        </Stack>
      )}
    </Page>
  );
}
