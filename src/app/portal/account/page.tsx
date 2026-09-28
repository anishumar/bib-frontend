"use client";

/**
 * Your account, on the client's side (0082).
 *
 * ── THIS IS THE AUDIENCE THE FEATURE IS ACTUALLY FOR ──────────────────────
 *
 * A portal login is the only kind in this product that reliably HAS a password:
 * a client contact chooses one on their invitation link, which is what creates
 * the login. Colleagues mostly never have one at all. So the screen that
 * changes a password matters more here than in the workspace — and before this
 * existed, the audience that owns a password was the one audience that could
 * not change it.
 *
 * ── AND IT IS WHERE A FORGOTTEN ONE USED TO BE FINAL ──────────────────────
 *
 * Their invitation is spent, and the firm cannot re-issue it: a firm that could
 * would be a firm resetting its own client's password, which the invite flow
 * exists to prevent. The way back is the emailed reset link on the sign-in
 * page, which this card also offers to anybody who somehow has no password.
 *
 * The form is the same component the workspace uses, because a password belongs
 * to the ACCOUNT rather than to either app. What differs is the frame and one
 * sentence — see `ChangePassword`.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Principal } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading } from "@/components/states";
import { ChangePassword } from "@/components/account/change-password";
import { ErrorNotice, Meta, MetaItem, NotSet } from "@/components/ui";

export default function PortalAccountPage() {
  const [me, setMe] = useState<Principal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const { data, error: failed } = await api.GET("/api/v1/auth/me", {});
    if (failed) {
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
      <PageHeader title="Your account" />

      <ErrorNotice error={error} />

      {me === null ? null : (
        <Stack gap="tight">
          <Meta>
            <MetaItem label="Signed in as">{me.displayName ?? me.email ?? <NotSet />}</MetaItem>
            <MetaItem label="Email">{me.email ?? <NotSet />}</MetaItem>
            {/* WHOSE PORTAL, by name — the firm, not the companies. The rail
                already carries the companies, and the fact worth stating on an
                account page is which firm's portal this login belongs to. */}
            <MetaItem label="Your accountants">{me.tenantName ?? <NotSet />}</MetaItem>
          </Meta>

          <ChangePassword
            hasPassword={me.hasPassword}
            email={me.email}
            elsewhere="Changing it signs out every other browser and device using this login. This tab stays signed in."
            onChanged={() => {
              void load();
            }}
          />
        </Stack>
      )}
    </Page>
  );
}
