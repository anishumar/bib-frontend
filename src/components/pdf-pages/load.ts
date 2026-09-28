"use client";

/**
 * pdf.js, loaded only by the screens that draw a PDF (a dynamic import, so no
 * other screen pays for it), with its worker served from THIS origin.
 *
 * The Content-Security-Policy is `default-src 'self'` with no `worker-src`, so
 * a worker falls back to `script-src 'self'`: a worker from a CDN or a `blob:`
 * URL is refused, and one bundled from `node_modules` by `new URL(…,
 * import.meta.url)` is served from our own origin and allowed. WebAssembly
 * would need `'wasm-unsafe-eval'`, which the policy does not grant; our own
 * PDFs carry only PNG and JPEG images and embedded fonts, which pdf.js draws
 * without it, so `useWasm` is off rather than failing in the console.
 */

type PdfJs = typeof import("pdfjs-dist");

let loading: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (loading === null) {
    loading = import("pdfjs-dist").then((lib) => {
      // One worker for every document the page opens.
      if (lib.GlobalWorkerOptions.workerPort === null) {
        lib.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" },
        );
      }
      return lib;
    });
    // A failed load (a network blip) may be tried again on the next render.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** The options every document here is opened with. */
export const OPEN_OPTIONS = {
  useWasm: false,
  useSystemFonts: false,
  // Our documents embed their fonts; nothing is fetched for them.
  useWorkerFetch: false,
  stopAtErrors: false,
} as const;
