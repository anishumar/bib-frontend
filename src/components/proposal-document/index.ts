/**
 * The proposal as a document, and sending it (T6.18). Both take only a
 * proposal id, so the proposal page and the builder's step 3 mount the same
 * two components; `useProposal` is the shared record they read, for a page
 * that shows more of the same proposal around them, and `putProposal` hands
 * it a record a write already answered with.
 *
 * `words` is how the PDF says money, frequency and the per-frequency total.
 * The builder says them the same way by importing them from here.
 */
export { ProposalDocument, BackToStandard, DocSection, Missing, NoteList } from "./proposal-document";
export { EditableChoice, EditableText } from "./editable";
export { EditableFee } from "./fee";
export type { FeeLine } from "./fee";
export type { SaveOutcome } from "./editable";
export { ProposalSendPanel } from "./send-panel";
export { ClientAnswer } from "./client-answer";
export { putProposal, reloadProposal, useProposal } from "./store";
export { FREQUENCY_WORDS, pdfDate, pdfMoney, summaryFee, totalWords } from "./words";
export type { BillingFrequency } from "./words";
