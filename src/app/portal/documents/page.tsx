"use client";

/**
 * The client portal's SELF-SERVE LIBRARY (T6.7).
 *
 * ── THE ACCEPTANCE LINE IS THE WHOLE BRIEF ────────────────────────────────
 *
 * *"A client finds last year's challan without emailing anyone."* Read it word
 * by word and it decides every choice on this page:
 *
 * · LAST YEAR'S — so there is NO window. The status home shows ninety days
 *   because it answers "what is happening now"; a window here would make the
 *   one question this page exists for unanswerable. It also means a client two
 *   years in has fifty rows, which is what decides the next two points.
 * · CHALLAN — so the row DOWNLOADS. T6.6 stopped at the filename deliberately
 *   and said so; a library that lists files and cannot open them sends the same
 *   email it was built to stop.
 * · WITHOUT EMAILING ANYONE — so the empty state has to say which kind of empty
 *   it is. "Nothing here yet" and "nothing matches what you typed" are
 *   different sentences and only one of them means the client should ask.
 *
 * ── A TABLE, AND NOT CARDS ───────────────────────────────────────────────
 *
 * The first version drew a card per document, which reads well for three and
 * becomes a page somebody scrolls for two minutes at thirty — and thirty is the
 * ordinary case after a year, because this list has no window. It also matches
 * `/portal/invoices`, which is a table: two lists of the client's own records
 * drawn two different ways is how a portal starts to look assembled rather than
 * designed.
 *
 * ── WHAT IS IN IT IS THE FIRM'S DECISION, AND THE PAGE SAYS SO ───────────
 *
 * A document reaches this list because it is the client's AND the firm marked it
 * client-visible (migration 0066) — the flag defaults FALSE and is set from the
 * document's KIND when it is uploaded, so a challan appears and a working paper
 * does not. That is enforced in the DATABASE, not by this screen choosing what
 * to draw. The footer says it in a sentence, because a client who cannot find
 * something needs to know whether to look harder or to ask.
 *
 * ── AND THE DOWNLOAD IS A REAL REQUEST, NOT AN href ─────────────────────
 *
 * There is no pre-signed URL in this product and there will not be one (T3.6):
 * a URL that outlives the session that minted it is checked by a storage vendor
 * rather than by the four gates. So the bytes are FETCHED with the session
 * cookie, turned into a blob and saved — which is also why the button can show
 * that it is working and can show a refusal, neither of which an `<a href>` can.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api/client";
import type { PortalDocument } from "@/lib/api/client";
import {
  Button,
  Field,
  Icon,
  Input,
  Notice as UiNotice,
} from "@/components/ui";
import { Empty, Page, PageHeader, Pill, Section, Sub, Table, TableWrap, Td, Th } from "@/components/tw";
import { ErrorState, Loading, NoResults } from "@/components/states";
import { usePortalSession } from "../portal-frame";
import { browserDay, longInstant } from "@/lib/day";

/** What each kind is called on a client's own page. The firm's vocabulary is
 *  `statutory_filing`; a client reads "Filed with the authority". Kinds that
 *  never reach this surface are absent rather than mapped to a placeholder. */
const KIND_LABEL: Record<string, string> = {
  statutory_filing: "Filed with the authority",
  invoice: "Invoice",
  credit_note: "Credit note",
  engagement_letter: "Engagement letter",
  identity_proof: "Identity document",
  correspondence: "Correspondence",
  proposal: "Proposal",
  working_paper: "Working paper",
  other: "Document",
};

/**
 * How many documents there have to be before a search box is worth drawing.
 *
 * Below this the LIST is the answer, and a box over it implies there is more
 * behind it — the same judgement the portal's own sidebar makes about not
 * carrying a search over four links. Eight is about a screen's worth on a
 * phone: the point at which somebody starts scrolling rather than reading.
 */
const SEARCH_FROM = 8;

export default function PortalLibraryPage() {
  const session = usePortalSession();
  const [documents, setDocuments] = useState<PortalDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async (): Promise<void> => {
    const result = await api.GET("/api/v1/portal/documents", {
      // The BROWSER's own calendar day: it decides which grants are in force,
      // and a UTC server is a day behind a firm in India every morning.
      params: { query: { asOf: browserDay() } },
    });
    if (result.error) {
      setError(apiError(result.error).message);
      setLoaded(true);
      return;
    }
    setDocuments(result.data.documents);
    setError(null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const firm = session?.tenantName ?? "your accountants";

  if (!loaded) return <Loading label="Loading your documents" />;
  if (documents === null) {
    return (
      <Page>
        <PageHeader title="Your documents" />
        <ErrorState message={error ?? "This page could not be loaded."} />
      </Page>
    );
  }

  // FILTERED IN THE BROWSER, on purpose. A client has tens of documents, not
  // hundreds of filings, and a round trip per keystroke would make the search
  // feel worse than scrolling. Matched across the title, the filename and what
  // the document is about, because "challan", "GSTR" and "July" are all things
  // somebody types looking for the same row.
  const needle = query.trim().toLowerCase();
  const shown =
    needle === ""
      ? documents
      : documents.filter((d) =>
          [d.title, d.filename, d.aboutWhat ?? "", d.companyName, KIND_LABEL[d.kind] ?? d.kind]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        );

  return (
    <Page>
      <PageHeader
        eyebrow={firm}
        title="Your documents"
        lede={`Everything ${firm} has shared with you, newest first. Nothing here expires.`}
      />

      {/* TWO EMPTY STATES, TWO SENTENCES. A client who has been given nothing
          should be told to ask; a client whose search matched nothing should be
          told to search differently. Drawing both as a blank page is the screen
          declining to say which is true — T6.5's own finding, applied again. */}
      {documents.length === 0 ? (
        <Empty title="Nothing shared with you yet" icon="files">
          {firm} has not yet put any of your documents here. Filed returns, challans and
          signed letters appear as they are made — if you are looking for something in
          particular, ask them for it and it can be added.
        </Empty>
      ) : (
        <>
          {/* THE SEARCH APPEARS ONLY WHEN THERE IS SOMETHING TO SEARCH — see
              SEARCH_FROM. A box over one document is furniture. */}
          {documents.length > SEARCH_FROM && (
            <div className="max-w-[26rem]">
              <Field
                label="Find one"
                hint="Matches the title, the file name, and the job or invoice it belongs to."
              >
                <Input
                  value={query}
                  placeholder="challan, GSTR-3B, July…"
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                />
              </Field>
            </div>
          )}

          {shown.length === 0 ? (
            <NoResults
              action={
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                  }}
                >
                  Clear the search
                </Button>
              }
            />
          ) : (
            <Section title={heading(documents.length, shown.length)} level={2}>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Document</Th>
                      <Th>What it is</Th>
                      <Th>About</Th>
                      <Th>Added</Th>
                      <Th>
                        <span className="sr-only">Download</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((doc) => (
                      <DocumentRow key={doc.documentId} doc={doc} />
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </Section>
          )}
        </>
      )}

      {/* WHAT IS NOT HERE, SAID OUT LOUD — the third time this portal has had to
          learn it. A client who cannot find something has to know whether to
          look harder or to ask, and a page that stayed silent would leave them
          concluding the firm never filed it. */}
      <p className="max-w-[var(--measure)] text-sm text-muted">
        {firm} decides which of your documents appear here — their own working papers and
        internal notes about your affairs do not. If something you expect is missing, ask
        them and they can share it.
      </p>
    </Page>
  );
}

/**
 * One row, and the download is a real REQUEST rather than a link.
 *
 * There is no pre-signed URL in this product and there will not be one (T3.6):
 * a URL that outlives the session that minted it is checked by a storage vendor
 * rather than by the rules that decide what this reader may see. So the bytes
 * are fetched with the session cookie, turned into a blob and saved — which is
 * also why the button can say it is working and can show a refusal, neither of
 * which an `<a href>` can.
 */
function DocumentRow({ doc }: { doc: PortalDocument }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held so a saved blob URL can be revoked: without this every download leaks
  // its object URL for the life of the tab.
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    };
  }, []);

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await api.GET("/api/v1/portal/documents/{documentId}/content", {
      params: { path: { documentId: doc.documentId }, query: { asOf: browserDay() } },
      parseAs: "blob",
    });
    setBusy(false);
    if (result.error) {
      // THE API'S REFUSAL IS WHAT GETS SHOWN. The list said this row exists; if
      // the server disagrees by the time it is asked, that is what the reader is
      // told rather than a silent nothing.
      setError(apiError(result.error).message);
      return;
    }
    const url = URL.createObjectURL(result.data as unknown as Blob);
    if (lastUrl.current !== null) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = url;
    const link = document.createElement("a");
    link.href = url;
    // The firm's own filename, which is what the server's
    // `content-disposition: attachment` would have said anyway.
    link.download = doc.filename;
    link.click();
  }

  return (
    <>
      <tr>
        <Td>
          {doc.title}
          {/* The filename and the size UNDER the title rather than in columns of
              their own: they are what a reader checks after finding the row, not
              what they scan to find it. `<Sub>` is what the staff file panel uses
              for the same pair. */}
          <Sub>
            {doc.filename} · {readableSize(doc.byteSize)}
          </Sub>
        </Td>
        <Td>
          <Pill tone="neutral">{KIND_LABEL[doc.kind] ?? "Document"}</Pill>
        </Td>
        {/* THE COMPANY IS SHOWN ONCE, NOT TWICE. A calendar-raised task is
            titled "Quarterly TDS statements — Cobalt Foods Private Limited — Q1
            FY2026-27" — the firm's own words, and correct on the firm's board
            where a hundred clients' work sits together. On a page a client
            opened, their own company's name is the least useful third of that
            string, it is already in the rail and the topbar, and it was wide
            enough to push this table into a horizontal scrollbar with ONE row
            in it. So the second line is drawn only when it adds something. */}
        <Td>
          {doc.aboutWhat === null ? (
            doc.companyName
          ) : (
            <>
              {without(doc.aboutWhat, doc.companyName)}
              {!doc.aboutWhat.includes(doc.companyName) && <Sub>{doc.companyName}</Sub>}
            </>
          )}
        </Td>
        <Td>
          <span className="mono">{longInstant(doc.addedOn)}</span>
        </Td>
        <Td align="right" className="nowrap">
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            icon={<Icon name="download" size={15} />}
            onClick={() => void download()}
          >
            Download
          </Button>
        </Td>
      </tr>
      {/* The refusal sits UNDER its own row rather than in a banner at the top of
          the page: with thirty rows, a message somewhere else is a message about
          nothing in particular. */}
      {error !== null && (
        <tr>
          <Td colSpan={5}>
            <UiNotice tone="danger" eyebrow="That did not download">
              <p>{error}</p>
            </UiNotice>
          </Td>
        </tr>
      )}
    </>
  );
}

/**
 * The heading over the table, which is also the count.
 *
 * "12 documents" answers how much is here without a second line saying it, and
 * while a search is running it says how much of that is on screen — a filtered
 * list with no count reads as a list that lost things.
 */
function heading(total: number, shown: number): string {
  return shown === total
    ? `${String(total)} ${total === 1 ? "document" : "documents"}`
    : `${String(shown)} of ${String(total)}`;
}

/**
 * Take the company's name out of a title that already carries it.
 *
 * String surgery on a label the firm typed, which is normally the wrong thing to
 * do — so it is narrow: it removes the company name and the separator around it
 * and nothing else, and if the name is not in there the title comes back
 * untouched. What licenses it is that this is the CLIENT's own page, where their
 * own company name is the one word in a work item's title that carries no
 * information — it is in the rail, in the topbar, and on the row already.
 */
function without(title: string, company: string): string {
  return title
    .replace(new RegExp(`\\s*[—–-]\\s*${escapeRe(company)}`), "")
    .replace(company, "")
    .replace(/\s*[—–-]\s*$/, "")
    .trim();
}

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "3 Sep 2026" from an ISO instant. In the reader's own locale, never with a
 *  time: when in the day a document was filed is not something a client needs,
 *  and printing it invites questions about a clock. */
/** A size somebody can judge a download by. Binary units, one decimal, and no
 *  attempt at cleverness below a kilobyte. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
