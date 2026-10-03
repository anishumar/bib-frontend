"use client";

import type { ConfigVersion } from "@/lib/api/client";
import { EmptyRow, NotSet, Pill, Table, TableWrap, Td, Th } from "@/components/ui";
import { longInstant } from "@/lib/day";
import { useSeesFees } from "@/components/fees";
import { changesBetween, priceWords, readServiceRecord, type Namer } from "../service";

/**
 * Every version of one service, newest first (`GET /config/service/{key}`,
 * read once by the page): which one is in force, when each was published and
 * until when, the price each carried, and what each changed from the one
 * before it, in words.
 *
 * A proposal line PINS the version it was quoted from, so "was this quoted
 * from the April price" is answered here. `ConfigHistory` (`@/lib/ui`) is the
 * generic disclosure the settings screens use; a service has a price and a
 * body a person can read, so its history says them rather than linking to
 * `/audit` for everything.
 */
export function ServiceHistory({
  versions,
  names,
}: {
  versions: readonly ConfigVersion[];
  names: Namer;
}) {
  // B09/F09: the price is null for a login that cannot see fees: Hidden.
  const seesFees = useSeesFees();
  const live = versions.find((v) => v.status === "published") ?? null;
  // The draft waiting to be published: the newest, and newer than the live
  // version (see `rowOf`). Any other draft was overtaken.
  const newest = versions.find((v) => v.status === "draft") ?? null;
  const pending = newest !== null && (live === null || newest.version > live.version) ? newest : null;
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Version</Th>
            <Th>State</Th>
            <Th>Published</Th>
            <Th>In force until</Th>
            <Th align="right">Price</Th>
            <Th>What changed</Th>
          </tr>
        </thead>
        <tbody>
          {versions.length === 0 && <EmptyRow colSpan={6}>No versions yet.</EmptyRow>}
          {versions.map((v, i) => {
            const body = readServiceRecord(v.body);
            // The version before this one, by number: newest first, so the
            // next row down.
            const before = versions[i + 1];
            const changes = before === undefined ? null : changesBetween(readServiceRecord(before.body), body, names);
            // Until the next PUBLISHED version took over: the nearest newer
            // row that was ever published.
            const next = versions
              .slice(0, i)
              .reverse()
              .find((n) => n.publishedAt !== null);
            const price = priceWords(body);
            return (
              <tr key={v.id}>
                <Td className="nowrap">Version {v.version}</Td>
                <Td className="nowrap">
                  <StatePill version={v} live={live} pending={pending} />
                </Td>
                <Td className="nowrap">{v.publishedAt === null ? <NotSet>Not published</NotSet> : longInstant(v.publishedAt)}</Td>
                <Td className="nowrap">
                  {v.status === "published"
                    ? "Still in force"
                    : v.publishedAt === null
                      ? null
                      : next?.publishedAt == null
                        ? <NotSet />
                        : longInstant(next.publishedAt)}
                </Td>
                <Td align="right" className="nowrap">
                  {seesFees === false ? <NotSet>Hidden</NotSet> : (price ?? <NotSet>No list price</NotSet>)}
                </Td>
                <Td>
                  <span className="cell-text">
                    {changes === null
                      ? "First version"
                      : changes.length === 0
                        ? "No change"
                        : changes.map((c) => c.label).join(", ")}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/** In force (teal), Replaced, the pending draft (Draft, or Unpublished
 *  changes in amber beside a live version), or Never published: a draft that
 *  a later version overtook and that will never take effect. */
function StatePill({ version, live, pending }: { version: ConfigVersion; live: ConfigVersion | null; pending: ConfigVersion | null }) {
  if (version.status === "published") {
    return (
      <Pill dot tone="ok">
        In force
      </Pill>
    );
  }
  if (version.status === "archived") return <Pill dot>Replaced</Pill>;
  if (pending !== null && version.id === pending.id) {
    return live === null ? (
      <Pill dot>Draft</Pill>
    ) : (
      <Pill dot tone="warn">
        Unpublished changes
      </Pill>
    );
  }
  return <Pill dot>Never published</Pill>;
}
