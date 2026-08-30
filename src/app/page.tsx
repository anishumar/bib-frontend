"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { Membership, Principal } from "@/lib/api/client";
import { Page, PageHeader, Stack } from "@/components/layout";
import { Loading, Empty } from "@/components/states";
import {
  Card,
  CardHead,
  ErrorNotice,
  Meta,
  MetaItem,
  NotStated,
  Pill,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";

/**
 * The workspace home: who you are, and which firms you belong to.
 *
 * It used to be a directory of links to every other screen, because there was
 * nowhere else to put them — no shell, no sidebar, so the home page WAS the
 * navigation. Now that the shell carries it, this page can be what it should
 * have been: the answer to "what is this session, and what does it reach?"
 *
 * It reads /auth/me and /tenancy/me/memberships. Both go out with the session
 * cookie; a 401 means the session is gone or was revoked (the API re-checks
 * the membership on EVERY request, so being removed from a firm ends access
 * here on the next call, not at expiry).
 */
export default function HomePage() {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const me = await api.GET("/api/v1/auth/me", {});
      if (!live) return;
      if (me.error) {
        // Not signed in is an ordinary state, not a failure to report.
        router.push("/login");
        return;
      }
      setPrincipal(me.data);

      const mine = await api.GET("/api/v1/tenancy/me/memberships", {});
      if (!live) return;
      if (mine.error) {
        setError(apiError(mine.error).message);
        return;
      }
      setMemberships(mine.data.memberships);
    })();

    return () => {
      live = false;
    };
  }, [router]);

  if (!principal) return <Loading />;

  return (
    <Page>
      <PageHeader
        eyebrow="10X Workspace"
        title="Home"
        lede="What this session is, and which firms it belongs to. Everything the workspace holds is in the sidebar — offered only where your role reaches it."
      />

      <ErrorNotice error={error} />

      <Card>
        <CardHead title="This session" />
        <Meta>
          <MetaItem label="User">
            <span className="mono">{principal.userId}</span>
          </MetaItem>
          <MetaItem label="Acting for">
            {principal.tenantId === null ? (
              <>
                <NotStated>no firm selected</NotStated>
                {/* WHY, not just that. A null tenant is not an error and not a
                    missing setting — it is what a session looks like when the
                    account belongs to more than one firm and has not picked
                    one. Saying only "not selected" leaves somebody hunting for
                    a switch that is doing exactly what it should. */}
                <span className="sub">this session belongs to more than one firm</span>
              </>
            ) : (
              <span className="mono">{principal.tenantId}</span>
            )}
          </MetaItem>
          <MetaItem label="Role">
            {principal.role === null ? <NotStated /> : <Pill tone="accent">{principal.role}</Pill>}
          </MetaItem>
          <MetaItem label="Fees">
            {/* The FEE AXIS, not the role. Commercial visibility is a flag on
                the membership and is orthogonal to what somebody may reach — a
                manager who may read every client is not automatically somebody
                who may see what the firm earns. */}
            {principal.commercialVisibility === true ? (
              <Pill tone="accent">visible</Pill>
            ) : (
              <Pill tone="quiet">hidden</Pill>
            )}
          </MetaItem>
        </Meta>

        {principal.permissions.length > 0 && (
          <div className="card-foot">
            <p className="eyebrow">May</p>
            <div className="cluster tight">
              {principal.permissions.map((p) => (
                <Pill key={p} tone="code">
                  {p}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Stack gap="tight">
        <CardHead
          title="Memberships"
          aside={<Pill tone="quiet">{memberships.length}</Pill>}
        />
        {memberships.length === 0 && error === null ? (
          <Card>
            <Empty title="No active memberships" icon="people">
              This account belongs to no firm. Until it does, the workspace has nothing to
              show — an administrator adds it on the People screen.
            </Empty>
          </Card>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Role</Th>
                  <Th>Surface</Th>
                  <Th>Firm</Th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <Td>{m.role}</Td>
                    <Td>
                      <Pill tone={m.audience === "STAFF" ? "neutral" : "quiet"}>
                        {m.audience}
                      </Pill>
                    </Td>
                    <Td>
                      <span className="mono">{m.tenantId}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Stack>
    </Page>
  );
}
