import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The states every screen has and none of them used to share.
 *
 * There were 33 hand-written "Loading…" strings and about as many empty
 * states, each one a different sentence in a different wrapper — some a muted
 * paragraph, some a table row, some nothing at all. The screens were not
 * disagreeing about anything real; they were each solving the same problem for
 * the first time.
 *
 * The rule these encode: AN EMPTY SCREEN STILL HAS TO SAY SOMETHING. "No
 * clients" and "you cannot see clients" and "the server did not answer" are
 * three different facts, and rendering all of them as a blank panel is the
 * screen declining to say which.
 */

/**
 * The whole screen is still loading.
 *
 * `role="status"` and `aria-live="polite"` so it is announced without
 * interrupting — a screen-reader user otherwise gets silence and no way to
 * tell a slow request from a broken one.
 */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <Spinner />
      <p className="muted">{label}…</p>
    </div>
  );
}

/**
 * The shape of what is coming, while it comes.
 *
 * Better than a spinner wherever the layout is KNOWN — a table, a list of
 * cards — because the page does not jump when the data lands. Not better where
 * it is not: a skeleton that guesses wrong is a worse promise than no promise.
 */
export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card aria-busy="true">
      <div className="stack tight">
        <Skeleton width="30%" height="1.1em" />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? "55%" : "100%"} height="0.9em" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </Card>
  );
}

/** Rows of placeholder, for a table that has not answered yet. */
export function LoadingRows({ rows = 4, cols }: { rows?: number; cols: number }) {
  return (
    <tbody aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <Skeleton width={c === 0 ? "70%" : "45%"} height="0.9em" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * There is nothing here yet — and that is an ordinary state, not a failure.
 *
 * `action` is what makes this worth rendering rather than a blank panel: an
 * empty screen that names the thing that would fill it, and offers the way to
 * make one, is the difference between a product and a dead end.
 */
export function Empty({
  title,
  children,
  icon = "inbox",
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {children !== undefined && <p>{children}</p>}
      {action !== undefined && <div className="cluster">{action}</div>}
    </div>
  );
}

/**
 * A filter matched nothing.
 *
 * DIFFERENT from `Empty`, and the difference matters: "no clients" means the
 * firm has none, "no clients match" means the search is wrong. Showing the
 * first when the second is true tells somebody their book is empty.
 */
export function NoResults({
  children = "Nothing matches the current filters.",
  action,
}: {
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon name="search" size={28} />
      </span>
      <h3>No matches</h3>
      <p>{children}</p>
      {action !== undefined && <div className="cluster">{action}</div>}
    </div>
  );
}

/**
 * The request failed, and this is what the API said.
 *
 * The message is shown VERBATIM. Several of this API's messages are
 * deliberately vague — it must not confirm who holds an account — and a
 * friendlier local rewrite would leak exactly what the backend refused to.
 *
 * `onRetry` only when retrying is genuinely the answer. A 403 does not become
 * a 200 by being asked twice, and a button that implies otherwise wastes
 * somebody's afternoon.
 */
export function ErrorState({
  title = "That did not work",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: ReactNode;
}) {
  return (
    <div className="state" data-tone="danger" role="alert">
      <span className="state-icon">
        <Icon name="alert" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry !== undefined && <div className="cluster">{onRetry}</div>}
    </div>
  );
}

/**
 * The session may not see this.
 *
 * Its own state rather than an error, because it is not one — the permission
 * model working correctly looks exactly like this. It names the permission,
 * which is what turns "ask an admin" into a request an admin can act on.
 */
export function Denied({
  permission,
  children,
}: {
  permission?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state-icon">
        <Icon name="lock" size={28} />
      </span>
      <h3>Not available to this account</h3>
      <p>
        {children ?? "Your role does not reach this part of the workspace."}
        {permission !== undefined && (
          <>
            {" "}
            It needs <span className="mono">{permission}</span>.
          </>
        )}
      </p>
    </div>
  );
}
