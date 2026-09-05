import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef } from "react";
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
   * mid-click and moves everything beside it.
   *
   * IT DOES NOT SET `disabled`, AND THAT IS THE WHOLE POINT. It used to, and
   * the cost was measured by walking the product: a disabled element is blurred
   * by the browser, so pressing Enter on any submit in this app dropped focus
   * to `<body>` for the length of the request and left it there. Every write,
   * every screen. `aria-disabled` says the same thing to assistive technology,
   * the click is swallowed here, and the keyboard user keeps their place.
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
  onClick,
  ref,
  ...rest
}: ButtonProps) {
  /**
   * FOCUS COMES BACK WHEN THE BUTTON DOES.
   *
   * `loading` no longer disables (see the prop's note), but a hundred and
   * twenty call sites in this app pass `disabled={busy}` directly, and a
   * disabled element is blurred by the browser. Rewriting them all is a worse
   * change than this one: half of them read `busy || somethingElse`, where the
   * second half is a REAL unavailability that should disable.
   *
   * So this watches the transition back. When the button becomes pressable
   * again and nothing holds focus — which is exactly the state the browser
   * leaves behind when it blurs a disabled element — it takes focus back. It
   * never steals: `document.body` is the only activeElement it will act on.
   *
   * Found by walking the product: pressing Enter on any submit dropped the
   * keyboard user to the top of the document for the length of the request and
   * left them there.
   */
  const own = useRef<HTMLButtonElement>(null);
  const wasUnavailable = useRef(false);
  const unavailable = disabled === true;

  useEffect(() => {
    if (wasUnavailable.current && !unavailable) {
      const active = document.activeElement;
      if (active === null || active === document.body) own.current?.focus();
    }
    wasUnavailable.current = unavailable;
  }, [unavailable]);
  // A button with no children is an icon button: square, and it needs the
  // caller to have given it an `aria-label` — there is no text to fall back on.
  const iconOnly = children === undefined && icon !== undefined;

  return (
    <button
      {...rest}
      /* Both refs: this component needs one to give focus back, and callers
         pass their own (`useSwapFocus` does). A spread `ref` would silently
         win over one set here, so they are merged rather than chosen between. */
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref !== null && ref !== undefined) ref.current = node;
      }}
      type={type}
      className={cx("btn", className)}
      data-variant={variant}
      data-size={size}
      /* A button the caller DISABLED is really disabled — it is offering
         nothing and should leave the tab order. A button that is merely BUSY
         stays focusable and says so, because taking it out from under a
         keyboard for the length of a request is how a form loses its user. */
      disabled={disabled === true}
      {...(loading
        ? { "data-loading": "true", "aria-busy": true, "aria-disabled": true }
        : {})}
      onClick={(event) => {
        // The click is swallowed rather than prevented by `disabled`, so a
        // second press while saving cannot submit twice.
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
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
