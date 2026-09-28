"use client";

/**
 * Where the pages' bytes come from.
 *
 * - `usePreview`: a DRAFT (or a letter frozen by sending) drawn by
 *   `POST /documents/preview`, which files nothing. Asked again about 800 ms
 *   after the record last changed, so a run of edits is one render; the old
 *   pages stay until the new bytes are drawn.
 * - `useStoredPdf`: a document of RECORD (a sent proposal's pinned PDF, a
 *   letter's signed copy), fetched as stored and never re-rendered.
 */

import { useEffect, useRef, useState } from "react";
import { api, apiError, fetchDocumentBytes } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { PageAnchor } from "./pdf-pages";

type Preview = components["schemas"]["DocumentPreview"];

export interface PreviewState {
  readonly data: Uint8Array | null;
  readonly anchors: readonly PageAnchor[];
  /** The day a draft was dated as Send will date it, or null. */
  readonly datedAsIfSent: string | null;
  readonly missingBrand: Preview["missingBrand"];
  readonly issuingEntity: Preview["issuingEntity"];
  readonly contentHash: string | null;
  /** A render is on its way; the pages shown are the previous ones. */
  readonly updating: boolean;
  /** The API's own sentence when the last render was refused. */
  readonly error: string | null;
}

const EMPTY: PreviewState = {
  data: null,
  anchors: [],
  datedAsIfSent: null,
  missingBrand: [],
  issuingEntity: null,
  contentHash: null,
  updating: false,
  error: null,
};

/** How long after the last change a new render is asked for. */
const SETTLE_MS = 800;

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function usePreview({
  kind,
  subjectRef,
  revision,
  enabled,
  asOf,
}: {
  kind: "proposal" | "engagement_letter";
  subjectRef: string;
  /** Changes whenever what the document prints may have changed. */
  revision: string;
  enabled: boolean;
  /** The caller's day, for a letter (Send takes the same). */
  asOf?: string | undefined;
}): PreviewState {
  /** The last answer, and the revision it answered. */
  const [answer, setAnswer] = useState<{ revision: string; state: PreviewState } | null>(null);
  const asked = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++asked.current;
    const delay = first.current ? 0 : SETTLE_MS;
    first.current = false;
    const timer = window.setTimeout(() => {
      void api
        .POST("/api/v1/documents/preview", {
          body: { kind, subjectRef, ...(asOf === undefined ? {} : { asOf }) },
        })
        .then((result) => {
          if (asked.current !== mine) return;
          if (result.error) {
            const message = apiError(result.error).message;
            setAnswer((a) => ({ revision, state: { ...(a?.state ?? EMPTY), updating: false, error: message } }));
            return;
          }
          const p = result.data;
          setAnswer({
            revision,
            state: {
              data: decode(p.pdf),
              anchors: p.anchors,
              datedAsIfSent: p.datedAsIfSent,
              missingBrand: p.missingBrand,
              issuingEntity: p.issuingEntity,
              contentHash: p.contentHash,
              updating: false,
              error: null,
            },
          });
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [kind, subjectRef, revision, enabled, asOf]);

  const state = answer?.state ?? EMPTY;
  // Updating while the pages shown answer an older revision than the record's.
  return { ...state, updating: enabled && answer !== null && answer.revision !== revision };
}

export function useStoredPdf({
  documentId,
  versionId,
}: {
  documentId: string | null;
  versionId?: string | undefined;
}): { data: Uint8Array | null; error: string | null } {
  const [state, setState] = useState<{ key: string; data: Uint8Array | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  const key = `${documentId ?? ""}:${versionId ?? ""}`;

  useEffect(() => {
    if (documentId === null) return;
    let live = true;
    void fetchDocumentBytes(documentId, versionId).then((r) => {
      if (live) setState({ key, data: r.bytes, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [documentId, versionId, key]);

  return state.key === key ? { data: state.data, error: state.error } : { data: null, error: null };
}
