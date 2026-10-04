"use client";

/**
 * WHO AT THE FIRM CAN DO SOMETHING THIS LOGIN CANNOT (CA#3, audit 2026-10-03).
 *
 * A manager pressed "Add all standard terms" on a new firm's first letter, was
 * told "No term was added.", and found no way forward: the firm had no
 * standard terms, the Standard terms page offered her no Add button (writing
 * them is `tenant:admin`), and nothing said who could. A refusal that names
 * nobody is a dead end; one that names the partner is a phone call.
 *
 * Worked out from two reads a staff login already makes elsewhere: the firm's
 * roles (`config:read`, each role's published permissions) and its colleagues
 * (`party:read`, active staff by name and role). Nothing here decides what the
 * login may do; the API still refuses, and says so, if the offer is wrong.
 */

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { api, readRoleBody } from "@/lib/api/client";
import { useSession } from "@/components/layout";

/**
 * The names of the active colleagues whose role holds `permission`, or null
 * while they are being read (or could not be). Sorted by name.
 */
export function useWhoMay(permission: string, enabled = true): readonly string[] | null {
  const [names, setNames] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      const [roles, colleagues] = await Promise.all([
        api.GET("/api/v1/config/{kind}", { params: { path: { kind: "role" } } }),
        api.GET("/api/v1/tenancy/colleagues", {}),
      ]);
      if (!live || roles.error || colleagues.error) return;
      const holding = new Set(
        roles.data.entries
          .filter((e) => readRoleBody(e.published?.body).permissions.includes(permission))
          .map((e) => e.entry.key),
      );
      setNames(
        colleagues.data.colleagues
          .filter((c) => holding.has(c.role))
          .map((c) => c.displayName ?? c.role)
          .sort((a, b) => a.localeCompare(b)),
      );
    })();
    return () => {
      live = false;
    };
  }, [permission, enabled]);
  return names;
}

/** "Rajesh", "Rajesh or Meera", "Rajesh, Meera or Sunil". */
export function orList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1] ?? ""}`;
}

/**
 * WHERE A LETTER'S MISSING WORDS COME FROM, said to whoever is looking.
 *
 * Somebody who may set the firm's standard wording and terms gets the links
 * straight to them; anybody else is told who can, by name. The opening can
 * also be written on the letter itself, under Cover letter, which any drafter
 * may do; terms come only from the firm's own set.
 */
export function StandardsHelp({
  opening,
  terms,
  issuerPartyId,
  issuerHasCountry,
  writeAt,
}: {
  /** The letter has no opening paragraph. */
  opening: boolean;
  /**
   * The letter has no terms: "missing" when the firm may well have some to
   * add, "none" once adding them found the firm has none for this company.
   */
  terms: "missing" | "none" | false;
  issuerPartyId: string;
  /** Whether the issuing company has a country: its own terms tab exists. */
  issuerHasCountry: boolean;
  /** Where the letter's own Cover letter is written, when it is not on this
   *  page (the letter page sends the reader to the builder). */
  writeAt?: Route | undefined;
}) {
  const session = useSession();
  const mayWrite = session?.permissions.includes("tenant:admin") ?? false;
  const names = useWhoMay("tenant:admin", !mayWrite && (opening || terms !== false));
  if (!opening && terms === false) return null;
  const here =
    writeAt === undefined ? (
      <>under Cover letter on this page</>
    ) : (
      <>
        under Cover letter in the <Link href={writeAt}>letter builder</Link>
      </>
    );

  const wordingHref = `/admin/document-blocks?company=${issuerPartyId}` as Route;
  const termsHref = (issuerHasCountry ? `/admin/standard-terms?company=${issuerPartyId}` : "/admin/standard-terms") as Route;

  if (mayWrite) {
    return (
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
        {opening && (
          <li>
            Write the opening {here}, or set the firm&rsquo;s standard opening in{" "}
            <Link href={wordingHref}>Standard wording</Link> so every new letter starts with it.
          </li>
        )}
        {terms === "missing" && (
          <li>
            Add the terms with &ldquo;Add all standard terms&rdquo;. To write or change the firm&rsquo;s terms, open{" "}
            <Link href={termsHref}>Standard terms</Link>.
          </li>
        )}
        {terms === "none" && (
          <li>
            Write the firm&rsquo;s terms in <Link href={termsHref}>Standard terms</Link>, then add them here.
          </li>
        )}
      </ul>
    );
  }
  const who = names === null || names.length === 0 ? "an administrator of the firm" : orList(names);
  return (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
      {opening && (
        <li>
          Write the opening {here}. The firm&rsquo;s standard opening, which every new letter starts with, is
          set by {who}.
        </li>
      )}
      {terms === "missing" && (
        <li>
          Add the terms with &ldquo;Add all standard terms&rdquo;. If the firm has none for this company yet, only{" "}
          {who} can write them.
        </li>
      )}
      {terms === "none" && (
        <li>
          The firm has no standard terms for this letter yet. Only {who} can write them: ask them to, then add
          them here.
        </li>
      )}
    </ul>
  );
}
