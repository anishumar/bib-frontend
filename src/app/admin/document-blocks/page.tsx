"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BLOCK_KINDS, BLOCK_KIND_LABELS, api, apiError } from "@/lib/api/client";
import type { BlockKind, StandardBlock } from "@/lib/api/client";
import { Td, Th } from "@/components/ui";
import { Page, PageHeader } from "@/components/layout";

/**
 * The firm's STANDARD prose — the exclusions, the commercial notes, and the
 * team block that every new document is written with.
 *
 * The whole screen turns on one fact: these are COPIED onto a document at
 * creation, not referenced by it. So editing a line here changes the NEXT
 * proposal and the NEXT letter, and changes nothing that has already gone out.
 * That is said on the page, because the opposite assumption — that fixing a
 * typo fixes it everywhere — is the one a person naturally arrives with, and
 * acting on it would mean silently rewriting what a signed agreement says the
 * firm excluded.
 *
 * RETIRE, NEVER DELETE, for the same reason `/admin/grades` does: there is no
 * delete endpoint and no DELETE grant behind it. A line a document was written
 * from is part of why that document says what it says, so a retired line stays
 * listed, marked, and simply stops being copied onto anything new.
 *
 * `jurisdiction` is the field that earns this screen its keep. "All fees are
 * exclusive of GST as applicable" is wrong on a UAE proposal, and a firm that
 * cannot see which of its standard lines are country-scoped will eventually
 * send one.
 */
export default function DocumentBlocksPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<StandardBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/document-blocks/standard", {});
    if (result.response.status === 401) {
      router.push("/login");
      return;
    }
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setBlocks(result.data.blocks);
    setError(null);
    setLoaded(true);
  }, [router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function act(run: () => Promise<{ error?: unknown }>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await run();
    if (result.error) {
      setError(apiError(result.error).message);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <Page>
      <PageHeader
        eyebrow="Documents"
        title="Standard prose"
        lede="Copied onto every new proposal and engagement letter. Editing a line changes the next
        document and nothing already issued — a document owns its copy from the moment it is
        drafted."
      />
      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {BLOCK_KINDS.map((kind) => {
        const mine = blocks.filter((b) => b.kind === kind);
        return (
          <div className="card" style={{ marginBottom: "var(--s-4)" }} key={kind}>
            <h2 className="card-title">{BLOCK_KIND_LABELS[kind]}</h2>
            {mine.length === 0 ? (
              <p className="muted">
                Nothing standard. Documents drafted now carry no {BLOCK_KIND_LABELS[kind].toLowerCase()}.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <Th style={{ width: 70 }}>Order</Th>
                    <Th>Line</Th>
                    <Th style={{ width: 110 }}>Prints in</Th>
                    <Th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((b) => (
                    <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.55 }}>
                      <Td className="mono">{b.sortOrder}</Td>
                      <Td>
                        {/* A HEADING is a section title, not an item — the team
                            block is a table with headings, and without the
                            distinction it goes back to being one text blob. */}
                        {b.isHeading ? <strong>{b.body}</strong> : b.body}
                        {b.isHeading && (
                          <span className="muted text-sm"> · heading</span>
                        )}
                      </Td>
                      <Td>
                        {b.jurisdiction === null ? (
                          <span className="muted">everywhere</span>
                        ) : (
                          <span className="pill" data-tone="code">{b.jurisdiction}</span>
                        )}
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        {b.isActive ? (
                          <button
                            className="btn" data-variant="secondary" data-size="sm"
                            disabled={busy}
                            onClick={() =>
                              void act(() =>
                                api.PATCH("/api/v1/document-blocks/standard/{blockId}", {
                                  params: { path: { blockId: b.id } },
                                  body: { isActive: false },
                                }),
                              )
                            }
                          >
                            Retire
                          </button>
                        ) : (
                          <>
                            <span className="pill" data-tone="danger">retired</span>{" "}
                            <button
                              className="btn" data-variant="secondary" data-size="sm"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  api.PATCH("/api/v1/document-blocks/standard/{blockId}", {
                                    params: { path: { blockId: b.id } },
                                    body: { isActive: true },
                                  }),
                                )
                              }
                            >
                              Restore
                            </button>
                          </>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form
              style={{ marginTop: "var(--s-4)" }}
              action={(form) => {
                const jurisdiction = String(form.get(`${kind}-jurisdiction`) ?? "").toUpperCase();
                void act(() =>
                  api.POST("/api/v1/document-blocks/standard", {
                    body: {
                      kind,
                      body: String(form.get(`${kind}-body`)),
                      sortOrder: Number(form.get(`${kind}-order`)),
                      isHeading: form.get(`${kind}-heading`) === "on",
                      // Absent means "print everywhere", which is the ordinary
                      // case and a different statement from any country code.
                      ...(jurisdiction === "" ? {} : { jurisdiction }),
                    },
                  }),
                );
              }}
            >
              <div className="field-row" style={{ marginBottom: "var(--s-4)" }}>
                <div style={{ flex: "3 1 260px" }}>
                  <label className="label" htmlFor={`${kind}-body`}>
                    New line
                  </label>
                  <input className="input" id={`${kind}-body`} name={`${kind}-body`} required />
                </div>
                <div>
                  <label className="label" htmlFor={`${kind}-order`}>
                    Order
                  </label>
                  <input
                    className="input"
                    id={`${kind}-order`}
                    name={`${kind}-order`}
                    type="number"
                    min={1}
                    defaultValue={mine.length + 1}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`${kind}-jurisdiction`}>
                    Only in
                  </label>
                  <input
                    className="input"
                    id={`${kind}-jurisdiction`}
                    name={`${kind}-jurisdiction`}
                    maxLength={2}
                    placeholder="all"
                    style={{ width: 90 }}
                  />
                  <p className="field-hint">Blank prints everywhere.</p>
                </div>
                <div style={{ alignSelf: "center" }}>
                  <label className="check">
                    <input type="checkbox" name={`${kind}-heading`} /> Heading
                  </label>
                </div>
              </div>
              <button className="btn" type="submit" disabled={busy}>
                Add line
              </button>
            </form>
          </div>
        );
      })}
    </Page>
  );
}

/** Narrow the generated union without retyping it — the kinds come from the
 *  API's own schema, so a kind added there is a compile error here. */
export type { BlockKind };
