/**
 * The document as the PDF (2026-09-28): pdf.js pages, hotspots over the
 * editable pieces, and the "Edit" list beside them. See "The preview IS the
 * PDF" in CLAUDE.md.
 */
export { PdfPages } from "./pdf-pages";
export type { PageAnchor } from "./pdf-pages";
export { PdfWorkspace } from "./workspace";
export type { Piece, PieceGroup } from "./workspace";
export { usePreview, useStoredPdf } from "./use-preview";
export type { PreviewState } from "./use-preview";
