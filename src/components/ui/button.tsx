import Link from "next/link";
import type { Route } from "next";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode, Ref } from "react";
import { cx } from "./class-names";
import { Spinner } from "./spinner";

/**
 * What a button LOOKS like. A closed set, and adding to it is a design
 * decision made once, here, rather than by whoever needs a button next.
 *
 * - `primary`   the one action a screen is for. Ink, not accent — colour is
 *               reserved for status, and a page with four accent buttons has
 *               spent its one signal on furniture.
 * - `secondary` everything else with a border. (`outline` is the same thing
 *               under the name other systems use for it, so nobody has to
 *               guess which one this project chose.)
 * - `ghost`     an action that should not compete: a row action, a dismiss.
 * - `destructive` / `destructive-quiet`
 *               red, because destruction is a status. The quiet one is for a
 *               table row, where a column of solid red would drown the data.
 * - `link`      an action that reads as text. Still a `<button>`, because it
 *               DOES something rather than going somewhere — that distinction
 *               is what decides whether Enter or Space fires it, and whether
 *               "open in new tab" is offered for something that cannot be.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "destructive-quiet"
  | "link";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Working. Shows a spinner, keeps the label, and blocks the click.
   *
   * The label STAYS — swapping it for "Saving…" changes the button's width
   * mid-click and moves everything beside it. Loading also implies disabled,
   * so no caller has to remember to pass both and none can pass one without
   * the other.
   */
  loading?: boolean;
  /** An icon before the label. Sized by the icon component, spaced by the CSS. */
  icon?: ReactNode;
  /** An icon after the label — a chevron, an external-link mark. */
  iconAfter?: ReactNode;
  /** Fills its container. For a form's submit on a narrow screen. */
  block?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * THE button. There is no other.
 *
 * `type="button"` is the default rather than the browser's `"submit"`. The
 * browser's default is a trap: a button dropped inside a form to open a
 * dialog or toggle a row submits it instead, and the bug shows up as "the
 * page reloads sometimes". A form's submit says `type="submit"` and means it.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconAfter,
  block = false,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  // A button with no children is an icon button: square, and it needs the
  // caller to have given it an `aria-label` — there is no text to fall back on.
  const iconOnly = children === undefined && icon !== undefined;

  return (
    <button
      {...rest}
      type={type}
      className={cx("btn", className)}
      data-variant={variant}
      data-size={size}
      disabled={disabled === true || loading}
      {...(loading ? { "data-loading": "true", "aria-busy": true } : {})}
      {...(block ? { "data-block": "true" } : {})}
      {...(iconOnly ? { "data-icon-only": "true" } : {})}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconAfter}
    </button>
  );
}

/**
 * A LINK that looks like a button.
 *
 * A separate component rather than an `href` prop on `<Button>`, because the
 * two are not the same thing and the difference is not cosmetic: a link goes
 * somewhere and must be an `<a>` — middle-click opens it in a tab, the browser
 * shows its target, a screen reader calls it a link, and Enter follows it. A
 * button DOES something and must be a `<button>` — Space fires it, and there is
 * nothing to open in a new tab.
 *
 * Making one component render either element on the presence of a prop is how
 * that distinction gets lost. Two components, one look, no ambiguity about
 * which you meant.
 */
export function LinkButton<T extends string>({
  href,
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  block = false,
  children,
  className,
  ...rest
}: {
  /* Generic over the route, exactly as `next/link` is. Without the type
     parameter a dynamic route like `/work/${id}` does not satisfy `Route` —
     the typed-routes helper resolves its dynamic branch through the inferred
     literal, and `Route<string>` collapses that branch to `never`. */
  href: Route<T>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  block?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<typeof Link<T>>, "href" | "className" | "children">) {
  return (
    <Link
      {...rest}
      href={href}
      className={cx("btn", className)}
      data-variant={variant}
      data-size={size}
      {...(block ? { "data-block": "true" } : {})}
    >
      {icon}
      {children}
      {iconAfter}
    </Link>
  );
}
