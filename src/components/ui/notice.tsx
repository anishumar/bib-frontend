import type { ReactNode } from "react";
import { cx } from "./class-names";

/**
 * Something needs you: a refusal, a warning, a statement the reader must not
 * mistake for a setting.
 *
 * The text is `pre-wrap` because this is where the API's own messages land,
 * and several of them are paragraphs — the config validator names the field,
 * the value it got and the form it wanted. Collapsing that to one line throws
 * away the half that says what to do about it.
 *
 * `role` follows the tone rather than being a prop, because the two cannot be
 * allowed to disagree: a danger notice is an `alert` and interrupts, anything
 * else is a `status` and waits its turn.
 */
/** `accent` is gone on purpose — see `PillTone` in `./pill`. */
export type NoticeTone = "neutral" | "ok" | "warn" | "danger";

export function Notice({
  children,
  tone = "neutral",
  /** A short mono heading above the text — "REFUSED", "NOT IN FORCE". */
  eyebrow,
  className,
}: {
  children: ReactNode;
  tone?: NoticeTone;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx("notice", className)}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div className="notice-body">
        {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </div>
  );
}

/**
 * What the API said, shown or not shown.
 *
 * A component rather than `{error !== null && <Notice…>}` written out on every
 * screen — there were 43 of those, and they disagreed about the wrapper, the
 * spacing and whether the message was announced at all.
 */
export function ErrorNotice({ error }: { error: string | null | undefined }) {
  if (error === null || error === undefined || error === "") return null;
  return <Notice tone="danger">{error}</Notice>;
}
