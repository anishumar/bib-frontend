"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BLOCK_KINDS, BLOCK_KIND_LABELS, api, apiError } from "@/lib/api/client";
import type { BlockKind, StandardBlock } from "@/lib/api/client";

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

  if (!loaded) return <p className="bib-muted">Loading…</p>;

  return (
    <main>
      <h1>Standard prose</h1>
      <p className="bib-muted" style={{ marginTop: 0 }}>
        Copied onto every new proposal and engagement letter. Editing a line changes the next
        document and nothing already issued — a document owns its copy from the moment it is
        drafted.
      </p>
      {error !== null && <p className="bib-error">{error}</p>}

      {BLOCK_KINDS.map((kind) => {
        const mine = blocks.filter((b) => b.kind === kind);
        return (
          <div className="bib-card" style={{ marginBottom: "var(--bib-gap-2)" }} key={kind}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>{BLOCK_KIND_LABELS[kind]}</h2>
            {mine.length === 0 ? (
              <p className="bib-muted" style={{ margin: 0 }}>
                Nothing standard. Documents drafted now carry no {BLOCK_KIND_LABELS[kind].toLowerCase()}.
              </p>
            ) : (
              <table className="bib-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Order</th>
                    <th>Line</th>
                    <th style={{ width: 110 }}>Prints in</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {mine.map((b) => (
                    <tr key={b.id} style={b.isActive ? undefined : { opacity: 0.55 }}>
                      <td className="bib-mono">{b.sortOrder}</td>
                      <td>
                        {/* A HEADING is a section title, not an item — the team
                            block is a table with headings, and without the
                            distinction it goes back to being one text blob. */}
                        {b.isHeading ? <strong>{b.body}</strong> : b.body}
                        {b.isHeading && (
                          <span className="bib-muted" style={{ fontSize: 13 }}> · heading</span>
                        )}
                      </td>
                      <td>
                        {b.jurisdiction === null ? (
                          <span className="bib-muted">everywhere</span>
                        ) : (
                          <span className="bib-pill" data-tone="code">{b.jurisdiction}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {b.isActive ? (
                          <button
                            className="bib-button-quiet"
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
                            <span className="bib-pill" data-tone="revoked">retired</span>{" "}
                            <button
                              className="bib-button-quiet"
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form
              style={{ marginTop: "var(--bib-gap-2)" }}
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
              <div className="bib-field-row" style={{ marginBottom: "var(--bib-gap-2)" }}>
                <div style={{ flex: "3 1 260px" }}>
                  <label className="bib-label" htmlFor={`${kind}-body`}>
                    New line
                  </label>
                  <input className="bib-input" id={`${kind}-body`} name={`${kind}-body`} required />
                </div>
                <div>
                  <label className="bib-label" htmlFor={`${kind}-order`}>
                    Order
                  </label>
                  <input
                    className="bib-input"
                    id={`${kind}-order`}
                    name={`${kind}-order`}
                    type="number"
                    min={1}
                    defaultValue={mine.length + 1}
                    required
                  />
                </div>
                <div>
                  <label className="bib-label" htmlFor={`${kind}-jurisdiction`}>
                    Only in
                  </label>
                  <input
                    className="bib-input"
                    id={`${kind}-jurisdiction`}
                    name={`${kind}-jurisdiction`}
                    maxLength={2}
                    placeholder="all"
                    style={{ width: 90 }}
                  />
                  <p className="bib-hint">Blank prints everywhere.</p>
                </div>
                <div style={{ alignSelf: "center" }}>
                  <label className="bib-check">
                    <input type="checkbox" name={`${kind}-heading`} /> Heading
                  </label>
                </div>
              </div>
              <button className="bib-button" type="submit" disabled={busy}>
                Add line
              </button>
            </form>
          </div>
        );
      })}
    </main>
  );
}

/** Narrow the generated union without retyping it — the kinds come from the
 *  API's own schema, so a kind added there is a compile error here. */
export type { BlockKind };
