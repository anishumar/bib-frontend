import type { Metadata } from "next";
import { PortalFrame } from "./portal-frame";

/**
 * The client portal's own layout.
 *
 * The root layout still supplies the fonts, the theme script and `AppShell` —
 * which treats every `/portal` route as bare, so the staff sidebar renders
 * nothing here. This is what wraps the client's app instead.
 *
 * The title is the portal's, not the workspace's: a client's browser tab must
 * not say "10X Workspace", which is the name of the half of the product they
 * are not in.
 */
export const metadata: Metadata = {
  title: "Your portal — BiB",
  description: "What your accountants are doing for you.",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalFrame>{children}</PortalFrame>;
}
