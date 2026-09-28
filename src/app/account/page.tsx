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
 */

import { useCallback, useEffect, useState } from "react";
import { api, codeLabel } from "@/lib/api/client";
import type { Principal } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import { ChangePassword } from "@/components/account/change-password";
import { ErrorNotice, Meta, MetaItem, NotSet } from "@/components/ui";

export default function AccountPage() {
  const [me, setMe] = useState<Principal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

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
          </Meta>

          <ChangePassword
            hasPassword={me.hasPassword}
            email={me.email}
            elsewhere="Changing it signs you out of every other browser and device. This tab stays signed in."
            onChanged={() => {
              void load();
            }}
          />
        </Stack>
      )}
    </Page>
  );
}
