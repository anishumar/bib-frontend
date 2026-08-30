"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * Light, dark, or whatever the machine says.
 *
 * THREE states, not two. A two-way toggle cannot express "follow the system",
 * so somebody whose laptop turns dark at sunset has no way to ask for that
 * here — and "system" is the default, which a two-way switch would silently
 * overwrite the first time it was touched.
 *
 * The choice lives in `localStorage` and is applied by stamping `data-theme`
 * on `<html>`. `system` stamps NOTHING, which is what lets the
 * `prefers-color-scheme` block in the tokens do its job: an absent attribute
 * means "not decided here", not "light".
 */

export type ThemeChoice = "light" | "dark" | "system";

const KEY = "bib-theme";

function isChoice(v: string | null): v is ThemeChoice {
  return v === "light" || v === "dark" || v === "system";
}

/**
 * The stored preference IS external state — it lives in the browser, it
 * outlives the component, and another tab can change it. So it is read with
 * `useSyncExternalStore` rather than copied into `useState` inside an effect:
 * that copy is a second source of truth that has to be kept in step, and
 * writing it during an effect causes the cascading render React now warns
 * about.
 *
 * `getServerSnapshot` returns `system` because the server cannot know, and
 * `system` is what the document renders as — so the first client render
 * agrees with the HTML and there is no hydration mismatch. The inline script
 * below has already applied the real choice to the DOM by then; this hook is
 * only about which button looks pressed.
 */
function subscribe(onChange: () => void): () => void {
  // `storage` fires in OTHER tabs; the custom event covers this one, since a
  // tab does not receive its own storage event.
  window.addEventListener("storage", onChange);
  window.addEventListener("bib-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("bib-theme-change", onChange);
  };
}

function getSnapshot(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return isChoice(stored) ? stored : "system";
  } catch {
    // Storage unavailable — a private window, an embedded webview, site data
    // blocked. `system` is a correct answer, not a fallback.
    return "system";
  }
}

function getServerSnapshot(): ThemeChoice {
  return "system";
}

/**
 * The inline script that runs before the page paints.
 *
 * Without it there is a flash: the server renders with no attribute, the
 * browser paints light, and the stored dark choice only lands once React has
 * hydrated. This reads the same key and stamps the same attribute, so by the
 * time anything is painted the answer is already right.
 *
 * Wrapped in try/catch for the same reason `getSnapshot` is — a theme
 * preference is not worth a blank page.
 */
export const themeScript = `try{var c=localStorage.getItem(${JSON.stringify(KEY)});if(c==="dark"||c==="light")document.documentElement.setAttribute("data-theme",c)}catch(e){}`;

const OPTIONS = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Match system", icon: "monitor" },
] as const;

export function ThemeSwitch() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = useCallback((next: ThemeChoice): void => {
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies to this tab; it just will not be remembered.
    }
    // Tells this tab's subscribers. Without it the pressed state would not move
    // until something else re-rendered.
    window.dispatchEvent(new Event("bib-theme-change"));
  }, []);

  return (
    <div className="themeswitch" role="group" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          /* `aria-pressed` rather than `aria-selected`: these are toggle
             buttons in a group, not tabs, and a screen reader should say
             "pressed" for the one in force. */
          aria-pressed={choice === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => { choose(o.value); }}
        >
          <Icon name={o.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
