"use client";

/**
 * The marks the firm prints on what it sends — logo, signature, letterhead.
 *
 * PER ENTITY, NEVER PER FIRM, and that is the whole reason this screen is not
 * three upload boxes. A firm with an Indian company and a US company signs on
 * two letterheads, and a letter its US entity issued printing the Indian logo is
 * the same class of error as one printing Indian governing law (G1.8). The API
 * keys the asset on the issuing entity for exactly that reason, so the screen
 * leads with the entity rather than burying it in a dropdown nobody re-reads.
 *
 * PUTTING ONE IN FORCE SUPERSEDES, IT DOES NOT REPLACE. The previous mark stays
 * stored and readable, because a document issued last year was issued under the
 * logo the firm had last year, and a store that answered "what did this letter
 * carry" with today's file would be confidently wrong. There is no delete here
 * and no endpoint behind one.
 *
 * NOTHING RENDERS THESE YET, and the screen says so. The renderer is T3.8. A
 * control that looks live and is inert is the "feature that looks finished"
 * this codebase has been caught by before, and this screen is the only place a
 * partner would ever find out.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  apiError,
  downloadDocument,
  formatBytes,
  BRAND_ASSET_KINDS,
  BRAND_ASSET_HINTS,
  BRAND_ASSET_LABELS,
} from "@/lib/api/client";
import type { BrandAsset, BrandAssetKind } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";

interface FirmEntity {
  readonly id: string;
  readonly displayName: string;
}

export default function BrandPage() {
  const [entities, setEntities] = useState<readonly FirmEntity[]>([]);
  const [assets, setAssets] = useState<Record<string, readonly BrandAsset[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    // The firm's own companies, derived from the ISSUING PREFERENCES — the same
    // source `/invoices` uses, so the two screens cannot disagree about which
    // companies the firm has.
    //
    // Its limit, stated because the empty state depends on it: an entity the
    // firm has not assigned to any country does not appear here. That is not a
    // bug to work around with a second endpoint; it is the same list the rest
    // of the product already works from, and the fix is to give the entity a
    // country on the issuing table.
    const firm = await api.GET("/api/v1/firm-entities/preferences");
    if (firm.error) {
      setError(apiError(firm.error).message);
      setLoaded(true);
      return;
    }
    const seen = new Map<string, string>();
    for (const p of firm.data.preferences) seen.set(p.firmEntity.id, p.firmEntity.displayName);
    const list = [...seen].map(([id, displayName]) => ({ id, displayName }));
    setEntities(list);

    const perEntity = await Promise.all(
      list.map(async (e) => {
        const result = await api.GET("/api/v1/firm-entities/{entityPartyId}/brand-assets", {
          params: { path: { entityPartyId: e.id } },
        });
        return [e.id, result.data?.assets ?? []] as const;
      }),
    );
    setAssets(Object.fromEntries(perEntity));
    setError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /**
   * Two calls, and the order matters.
   *
   * The bytes become an ordinary DOCUMENT first — same store, same versioning,
   * same content hash as a client's PAN card — and only then is that version
   * put in force as the entity's mark. Doing it the other way round is not
   * possible: there would be no version id to point at.
   *
   * The upside of the document coming first is that a logo carries an upload
   * history for free, and the superseded one is still downloadable.
   */
  async function put(entity: FirmEntity, kind: BrandAssetKind, form: FormData): Promise<void> {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a file first.");
      return;
    }
    setBusy(`${entity.id}:${kind}`);
    setError(null);

    const payload = new FormData();
    payload.set("file", file);
    payload.set("title", `${entity.displayName} ${BRAND_ASSET_LABELS[kind].toLowerCase()}`);
    payload.set("kind", "brand_asset");

    const stored = await api.POST("/api/v1/documents", {
      body: payload as unknown as never,
      bodySerializer: (b: unknown) => b as FormData,
    });
    if (stored.error) {
      setBusy(null);
      setError(apiError(stored.error).message);
      return;
    }

    const inForce = await api.PUT(
      "/api/v1/firm-entities/{entityPartyId}/brand-assets/{kind}",
      {
        params: { path: { entityPartyId: entity.id, kind } },
        body: { documentVersionId: stored.data.latestVersion.id },
      },
    );
    setBusy(null);
    if (inForce.error) {
      // The document IS stored at this point and the mark is not in force. Said
      // plainly rather than rolled back: the bytes are safe, nothing is lost,
      // and pretending the upload failed would send somebody re-uploading a
      // file the store already holds.
      setError(
        `${apiError(inForce.error).message} — the file was stored, but it is not in force. Try again.`,
      );
      return;
    }
    await load();
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  return (
    <Page>
      <PageHeader
        eyebrow="Documents"
        title="Brand"
        lede="What each of the firm&rsquo;s companies prints on what it sends."
      />

      {/* The honest banner. It comes out when T3.8 lands. */}
      <p className="field-hint">
        <strong>Nothing renders these yet.</strong> They are stored, versioned and audited
        today, and the renderer that puts them on a letter or an invoice is still to be
        built. Uploading one now means it is ready and correct when that lands — it does not
        change any document the firm sends today.
      </p>

      {error !== null && <p className="notice" data-tone="danger" role="alert">{error}</p>}

      {entities.length === 0 ? (
        <div className="card">
          <p className="muted">
            This firm has no companies on its issuing list yet, so there is nothing to give a
            logo to. A company appears here once it is named on{" "}
            <Link href="/invoices">the issuing table</Link> as serving clients somewhere —
            which is the same list that decides who issues an engagement letter.
          </p>
        </div>
      ) : (
        entities.map((entity) => (
          <div className="card" key={entity.id} style={{ marginBottom: "var(--s-5)" }}>
            <h2 className="card-title">{entity.displayName}</h2>
            {BRAND_ASSET_KINDS.map((kind) => (
              <Slot
                key={kind}
                kind={kind}
                entity={entity}
                asset={(assets[entity.id] ?? []).find((a) => a.kind === kind)}
                busy={busy === `${entity.id}:${kind}`}
                onSubmit={(fd) => void put(entity, kind, fd)}
                onError={setError}
              />
            ))}
          </div>
        ))
      )}
    </Page>
  );
}

function Slot({
  kind,
  entity,
  asset,
  busy,
  onSubmit,
  onError,
}: {
  kind: BrandAssetKind;
  entity: FirmEntity;
  asset: BrandAsset | undefined;
  busy: boolean;
  onSubmit: (form: FormData) => void;
  onError: (message: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // The preview goes through an authenticated fetch like every other read in
  // this app — the session is an httpOnly cookie on another origin, so an
  // <img src> pointing at the API would be an anonymous request and render a
  // broken image in any environment where the API is on another domain.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      // A PDF letterhead is a legitimate asset and simply has no thumbnail —
      // resolved here rather than with an early return, so the effect has one
      // exit and never sets state synchronously.
      if (asset === undefined || !asset.version.mediaType.startsWith("image/")) {
        if (!cancelled) setPreview(null);
        return;
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/api/v1/documents/${asset.version.documentId}/versions/${asset.version.id}/content`,
        { credentials: "include" },
      ).catch(() => null);
      if (response === null || !response.ok || cancelled) return;
      url = URL.createObjectURL(await response.blob());
      setPreview(url);
    })();
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [asset]);

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s-4)", marginTop: "var(--s-4)" }}>
      <div className="card-head">
        <h3 className="card-title">{BRAND_ASSET_LABELS[kind]}</h3>
        <span className="muted text-sm">
          {BRAND_ASSET_HINTS[kind]}
        </span>
      </div>

      {asset === undefined ? (
        <p className="unstated" style={{ margin: "0 0 var(--s-4)" }}>
          none set
        </p>
      ) : (
        <div className="cluster" style={{ alignItems: "center", marginBottom: "var(--s-4)" }}>
          {preview !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${entity.displayName} ${kind}`}
              style={{
                maxHeight: 48,
                maxWidth: 200,
                background: "var(--logo-plate)",
                padding: "var(--s-1)",
              }}
            />
          )}
          <span className="muted text-sm">
            {asset.version.filename} · {formatBytes(asset.version.byteSize)} · since{" "}
            {asset.createdAt.slice(0, 10)}
          </span>
          <button
            type="button"
            className="btn" data-variant="secondary" data-size="sm"
            onClick={() => {
              // The VERSION, named explicitly rather than "latest": a
              // superseded mark is still downloadable, and the latest version
              // of that document is not necessarily the one in force.
              void downloadDocument(
                asset.version.documentId,
                asset.version.filename,
                asset.version.id,
              ).then((failure) => {
                if (failure !== null) onError(failure);
              });
            }}
          >
            Download
          </button>
        </div>
      )}

      <form
        ref={formRef}
        action={(fd) => {
          onSubmit(fd);
          formRef.current?.reset();
        }}
        className="cluster"
        style={{ alignItems: "center" }}
      >
        <input name="file" type="file" className="input" accept="image/*,application/pdf" required />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Saving…" : asset === undefined ? "Set" : "Replace"}
        </button>
      </form>
      {asset !== undefined && (
        <p className="field-hint">
          Replacing supersedes — the current one stays stored, so a document issued under it
          still resolves what it carried.
        </p>
      )}
    </div>
  );
}
