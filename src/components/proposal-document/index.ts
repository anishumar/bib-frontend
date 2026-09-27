/**
 * The proposal as a document, and sending it (T6.18). Both take only a
 * proposal id, so the proposal page and the builder's step 3 mount the same
 * two components; `useProposal` is the shared record they read, for a page
 * that shows more of the same proposal around them.
 */
export { ProposalDocument } from "./proposal-document";
export { ProposalSendPanel } from "./send-panel";
export { reloadProposal, useProposal } from "./store";
