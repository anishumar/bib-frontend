"use client";

/**
 * The marks the firm prints on what it sends — logo, signature, letterhead and
 * proposal cover.
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

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  apiError,
  downloadDocument,
  formatBytes,
  BRAND_ASSET_KINDS,
  BRAND_ASSET_ACCEPT,
  BRAND_ASSET_HINTS,
  BRAND_ASSET_LABELS,
} from "@/lib/api/client";
import type { BrandAsset, BrandAssetKind, InvoiceSeries } from "@/lib/api/client";
import { Button, Field, FieldRow, Input } from "@/components/ui";
import {
  Card,
  CardTitle,
  ErrorNotice,
  Notice,
  Page,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
} from "@/components/tw";
import { longInstant } from "@/lib/day";

interface FirmEntity {
  readonly id: string;
  readonly displayName: string;
}

export default function BrandPage() {
  const [entities, setEntities] = useState<readonly FirmEntity[]>([]);
  /**
   * The firm's invoice number series — one row per company, per financial year,
   * per document type.
   *
   * On THIS page because the two questions are one question: what each of the
   * firm's companies puts on the documents it issues. And it has to be this
   * page rather than a screen built on `GET /invoice-series` alone, because
   * that read only returns a row once an invoice HAS been raised — a company
   * with no invoices yet would simply not be listed, and nobody would learn
   * why the prefix cannot be set. The entity list here is the issuing table's,
   * so the absence is visible and explained.
   */
  const [series, setSeries] = useState<readonly InvoiceSeries[]>([]);
  const [assets, setAssets] = useState<Record<string, readonly BrandAsset[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    // `config:read`, a weaker permission than the write it feeds — so somebody
    // who may not rename a series can still see what the numbers read as.
    const [seriesResult, me] = await Promise.all([
      api.GET("/api/v1/invoice-series", {}),
      api.GET("/api/v1/auth/me", {}),
    ]);
    setSeries(seriesResult.data?.series ?? []);
    // What to OFFER. Renaming a series is `tenant:admin`, and the API's refusal
    // is what gets shown if one arrives anyway.
    setCanWrite(me.data?.permissions.includes("tenant:admin") ?? false);

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
   * Rename what one company's invoice numbers READ as.
   *
   * There is no confirmation dialog and there is deliberately not going to be
   * one — the page says what this does before the button, which is the shape
   * `/admin/verification` uses for maker != checker. A dialog that repeats a
   * warning somebody has already read trains people to dismiss warnings.
   */
  async function setPrefix(entity: FirmEntity, prefix: string): Promise<void> {
    setBusy(`${entity.id}:series`);
    setError(null);
    const result = await api.POST("/api/v1/invoice-series/{entityPartyId}/prefix", {
      params: { path: { entityPartyId: entity.id } },
      body: { prefix },
    });
    setBusy(null);
    if (result.error) {
      setError(apiError(result.error).message);
      return;
    }
    await load();
  }

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
        `The file was saved but is not in use yet, so try again. ${apiError(inForce.error).message}`,
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
        lede="The logo, signature, letterhead and proposal cover each of your companies prints on what it sends, and how its invoices are numbered."
      />

      {/* THE HONEST BANNER, and it had gone stale in the other direction: it
          still said nothing printed these long after the renderer (T3.8) drew
          the logo on every letter and invoice and 0081 the signature on a sent
          letter. A caveat that is no longer true teaches a partner to
          disbelieve the screen. What is still true is said: the letterhead is
          stored and not drawn. */}
      <p className="field-hint">
        <strong>What prints where:</strong> the logo heads every letter, invoice and proposal this
        company issues; the signature signs its engagement letters once they are sent; the
        proposal cover is the first page of its proposals. The letterhead is stored and is not
        printed on anything yet. <strong>Invoice numbers</strong> are live too: that section on
        each company shows how the next invoice will be numbered.
      </p>

      <ErrorNotice error={error} />

      {entities.length === 0 ? (
        <Card>
          <p className="muted">
            Your firm has no issuing companies yet, so there is nothing to give a logo to. A
            company appears here once it is named on{" "}
            <Link href="/invoices">the issuing table</Link> as the company that serves clients
            in a country. The same list decides which company issues an engagement letter.
          </p>
        </Card>
      ) : (
        entities.map((entity) => (
          <Card key={entity.id}>
            {/* The heading has an id because every slot's control is named by
                it. "Logo" is not a name on a firm with two companies. */}
            <h2 className="card-title" id={entityHeadingId(entity)}>
              {entity.displayName}
            </h2>
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
            {/* THE ONE THING ON THIS PAGE THAT IS ALREADY LIVE. Everything
                above is stored and not yet rendered anywhere (T3.8); an invoice
                number is on every invoice the firm has issued, and this is what
                the next one will read as. */}
            <InvoiceNumbers
              entity={entity}
              series={series.filter((r) => r.entityPartyId === entity.id)}
              canWrite={canWrite}
              busy={busy === `${entity.id}:series`}
              onSet={(prefix) => void setPrefix(entity, prefix)}
            />
          </Card>
        ))
      )}
    </Page>
  );
}

/** The id of a company's own heading — what names every control under it.
 *  Derived from the party id rather than `useId` because it is needed inside a
 *  `.map`, where a hook cannot go. */
function entityHeadingId(entity: FirmEntity): string {
  return `brand-entity-${entity.id}`;
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
  const headingId = useId();
  const hintId = useId();
  const label = BRAND_ASSET_LABELS[kind];

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
    <div className="mt-4 border-t border-line pt-4">
      <div className="card-head">
        <h3 className="card-title" id={headingId}>
          {label}
        </h3>
        {/* An id, so the sentence on the right of the heading is the file
            control's DESCRIPTION rather than prose sitting near it. It was
            wired to nothing: measured, this screen described 0 of 3 controls. */}
        <span className="muted text-sm" id={hintId}>
          {BRAND_ASSET_HINTS[kind]}
        </span>
      </div>

      {asset === undefined ? (
        <p className="unstated mb-4">none set</p>
      ) : (
        <div className="cluster mb-4">
          {preview !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${entity.displayName} ${kind}`}
              className="max-h-12 max-w-[200px] bg-[var(--logo-plate)] p-1"
            />
          )}
          <span className="muted text-sm">
            {asset.version.filename} · {formatBytes(asset.version.byteSize)} · since{" "}
            {/* `createdAt` is a `timestamptz`. `.slice(0, 10)` took the UTC day,
                which is YESTERDAY in India until 05:30 every morning — and
                printed it as `2026-09-04` besides. Seen rendered rather than
                reasoned about: an asset stored at 20:10Z read "since
                2026-09-04" at 03:53 on the fifth, local. `longInstant` parses
                and prints the day it fell on HERE. */}
            {longInstant(asset.createdAt)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Download the ${label.toLowerCase()} for ${entity.displayName}`}
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
          </Button>
        </div>
      )}

      <form
        ref={formRef}
        action={(fd) => {
          onSubmit(fd);
          formRef.current?.reset();
        }}
        className="cluster"
      >
        {/* NAMED. Three of these on a card and not one had a label, an
            `aria-label` or a wrapping <label> — the app's own probe excluded
            `type="file"` from its control count, which is why the sweep that
            reported "0 unnamed controls" was reporting on two of the three
            kinds of control on this screen. Named by the COMPANY and the kind
            together, because "Logo" repeats once per company. */}
        <input
          name="file"
          type="file"
          className="input"
          aria-labelledby={`${entityHeadingId(entity)} ${headingId}`}
          aria-describedby={hintId}
          accept={BRAND_ASSET_ACCEPT[kind]}
          required
        />
        {/* The word on the button stays; the NAME says which of the three it
            belongs to. Three buttons reading "Set" is one name, not three. */}
        <Button
          type="submit"
          disabled={busy}
          aria-label={`${asset === undefined ? "Set" : "Replace"} the ${label.toLowerCase()} for ${entity.displayName}`}
        >
          {busy ? "Saving…" : asset === undefined ? "Set" : "Replace"}
        </Button>
      </form>
      {asset !== undefined && (
        <p className="field-hint">
          Replacing keeps the current file on record, so a document issued under it still shows
          what it carried at the time.
        </p>
      )}
    </div>
  );
}

/**
 * WHAT THIS COMPANY'S INVOICE NUMBERS READ AS — and it is a tax document act.
 *
 * `GET /invoice-series` and `POST /invoice-series/{entityPartyId}/prefix` are
 * the last two of the thirteen routes with no caller. The read is the more
 * useful half on its own: an invoice series is CONSECUTIVE, a tax authority may
 * ask about it, and until now no screen in the product said where each of the
 * firm's series had reached.
 *
 * ## Everything on this panel comes from reading `setSeriesPrefix`, not its name
 *
 * - **It changes FUTURE numbers only.** Every issued invoice keeps the number
 *   it was issued with; the freeze trigger refuses to move one. So a firm that
 *   changes its mind gets a series that reads differently from a point in time,
 *   which is what actually happens at a real firm.
 * - **It changes EVERY FINANCIAL YEAR's row for this company**, not this year's
 *   — the UPDATE has no `financial_year` predicate. That is the sentence that
 *   makes this not a rename: a back-dated invoice into a closed year would then
 *   be numbered with the NEW prefix and sit in the same consecutive series as
 *   the old-prefix numbers already issued for that year.
 * - **It leaves CREDIT NOTES alone** — the UPDATE is `document_type =
 *   'invoice'`. Two legal series that must not interleave, so a firm renaming
 *   one has not renamed the other, and the table below shows both.
 * - **The shape is refused, not normalised**: up to twelve characters, upper
 *   case letters, digits, "-" and "/", starting with a letter or digit. It
 *   prints on a legal document.
 *
 * ## A company with no series is a REAL state and the commonest one
 *
 * A row appears the first time an invoice is raised for that company in that
 * year. Before then `POST …/prefix` updates nothing and answers 204 — a silent
 * success that changes not one number. So a company with no series is told
 * exactly that, and offered no box, rather than being left out of a list.
 */
function InvoiceNumbers({
  entity,
  series,
  canWrite,
  busy,
  onSet,
}: {
  entity: FirmEntity;
  series: readonly InvoiceSeries[];
  canWrite: boolean;
  busy: boolean;
  onSet: (prefix: string) => void;
}) {
  const invoices = series.filter((r) => r.documentType === "invoice");
  // The current prefix is whatever the rows agree on; they are all set by one
  // UPDATE, so they always do. Taking the newest year's is the honest reading
  // if a direct database edit ever made them disagree.
  const current = [...invoices].sort((a, b) => b.financialYear - a.financialYear)[0]?.prefix;

  return (
    <div style={{ marginTop: "var(--s-5)" }}>
      <h3 className="card-title text-md">Invoice numbers</h3>

      {series.length === 0 ? (
        <p className="muted text-md">
          {entity.displayName} has not issued an invoice yet. Numbering starts with the first
          invoice, as <span className="mono">INV/&lt;year&gt;/0001</span>, and the prefix can be
          changed from then on.
        </p>
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Year</Th>
                  <Th>Series</Th>
                  <Th align="right">Issued</Th>
                  <Th>The next one</Th>
                </tr>
              </thead>
              <tbody>
                {series.map((r) => (
                  <tr key={`${r.financialYear}:${r.documentType}`}>
                    <Td className="mono">{financialYearLabel(r.financialYear)}</Td>
                    <Td>
                      {r.documentType === "invoice" ? "Invoices" : "Credit notes"}{" "}
                      <span className="mono annot">{r.prefix}</span>
                    </Td>
                    {/* WHERE THE SERIES HAS REACHED, which is also how many
                        documents it has issued — a gapless series has no zeroth
                        document, so the counter and the count are the same
                        number. */}
                    <Td align="right" className="mono">
                      {r.lastNumber}
                    </Td>
                    <Td className="mono">
                      {r.prefix}/{financialYearLabel(r.financialYear)}/
                      {String(r.lastNumber + 1).padStart(4, "0")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {canWrite && (
            <>
              {/* THE CONSEQUENCES, BEFORE THE BUTTON. The same shape
                  /admin/verification uses to put maker != checker above its
                  form: somebody about to rename a statutory series should meet
                  the explanation, not the refusal. */}
              <Notice tone="warn" eyebrow="This is not a rename">
                <p>
                  Invoice numbers run in an unbroken <strong>sequence</strong>, and a tax
                  authority may ask about it. Changing the prefix changes the numbers{" "}
                  <strong>from now on</strong>. Every invoice already issued keeps the number it
                  was issued with.
                </p>
                <p>
                  The change applies to <strong>every financial year</strong> of{" "}
                  {entity.displayName}&rsquo;s invoices, not just the current one. So an invoice
                  back-dated into a closed year would get the new prefix and sit in the same
                  sequence as the old-prefix numbers already issued for that year. Credit notes
                  are not affected and keep their own numbering.
                </p>
              </Notice>

              <form
                action={(form) => {
                  const next = String(form.get(`prefix-${entity.id}`) ?? "")
                    .trim()
                    .toUpperCase();
                  if (next === "" || next === current) return;
                  onSet(next);
                }}
              >
                {/* NAMED BY THE COMPANY, with no legend. A firm with three
                    companies draws three of these forms on one page, each
                    asking for "The prefix" — which is 3 controls under 1 name
                    and the exact defect probe 6 exists to catch. Named by the
                    company because that is the immutable thing here; the prefix
                    itself is in the box. */}
                <fieldset
                  className="fieldset"
                  aria-label={`${entity.displayName} invoice numbers`}
                >
                  <FieldRow>
                    <Field
                      label="The prefix"
                      hint="Up to twelve characters: capital letters, digits, “-” and “/”, starting with a letter or digit. It prints on a legal document, so anything else is not accepted."
                    >
                      {/* THE CURRENT VALUE, not a placeholder. Somebody renaming
                          a series should be editing what is there rather than
                          typing into a box whose emptiness suggests there is
                          nothing set. */}
                      <Input
                        name={`prefix-${entity.id}`}
                        defaultValue={current ?? ""}
                        maxLength={12}
                        required
                      />
                    </Field>
                  </FieldRow>
                  <div className="cluster">
                    <Button
                      type="submit"
                      variant="destructive-quiet"
                      loading={busy}
                      aria-label={`Change what ${entity.displayName}'s invoice numbers read as`}
                    >
                      {busy ? "Changing…" : "Change the series"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * `2026` -> `2026-27`, the label the API's own `formatInvoiceNumber` builds a
 * number from.
 *
 * Written here rather than imported because it is not on the wire: the series
 * row carries the YEAR as an integer, and every invoice number the product has
 * ever issued spells it this way. The two must not disagree, which is why this
 * is one line with the rule stated rather than a format somebody chose.
 */
function financialYearLabel(year: number): string {
  return `${String(year)}-${String((year + 1) % 100).padStart(2, "0")}`;
}
