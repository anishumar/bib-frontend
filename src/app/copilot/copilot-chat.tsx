"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api/client";
import type { Membership, Principal } from "@/lib/api/client";
import { Page, PageHeader } from "@/components/layout";
import { Loading } from "@/components/states";
import { Button, Card, ErrorNotice, Icon, Meta, MetaItem, Pill } from "@/components/ui";

/**
 * AI Copilot, at `/copilot` (V1.1, 2026-09-28).
 *
 * It WAS the workspace's first screen, and every staff role landed on "AI
 * Copilot · Not live yet" after signing in, with every sidebar group closed: a
 * screen that cannot answer anything, in front of the work that was due. Staff
 * now land on their work; this is one link in the sidebar, marked not live.
 *
 * ── WHAT THIS REPLACED, AND WHY ─────────────────────────────────────────────
 *
 * This was "Home": a page that printed the session's user id, its tenant id and
 * a row of permission keys at whoever signed in. Every one of those is a fact
 * about the SYSTEM, and the person opening a practice-management product at
 * nine in the morning is not asking a question about the system. Two full uuids
 * above the fold told a partner nothing except that the software was written by
 * somebody else, for somebody else.
 *
 * The facts have not been deleted — support asks for them, and a person who
 * cannot produce their own firm id has nothing to give when something goes
 * wrong. They are at the bottom, behind a closed disclosure, which is where a
 * fact that matters once a year belongs.
 *
 * ── IT CANNOT ANSWER ANYTHING YET, AND SAYS SO EVERY TIME ───────────────────
 *
 * There is no model behind this and no endpoint to call. What exists is the
 * SHAPE: the thread, the composer, the openers, the delay. That is deliberate —
 * the screen is being built before the feature so the feature lands into
 * something already designed, rather than arriving as a panel bolted to the
 * side of whatever was here.
 *
 * The one thing it must never do is imply it worked. So the reply is honest in
 * three places at once: the sentence itself, the line under the composer, and
 * the pill in the page header. A demo that quietly looks live is a demo that
 * gets promised to a client.
 *
 * WHEN THE API ARRIVES, `<Answer>` is the only thing that changes — it renders
 * what came back instead of what is written into it, and everything around it
 * already works.
 */

interface Turn {
  readonly id: number;
  readonly from: "you" | "copilot";
  readonly text: string;
}

/**
 * The openers.
 *
 * Every one is a question this product will genuinely be able to answer, out of
 * records it already holds — the work board knows what is late, the receivables
 * screen knows who has not paid. Offering something it will never do would be a
 * promise made by a placeholder.
 */
const OPENERS: readonly string[] = [
  "What is late this week, and whose is it?",
  "Which clients owe us money the longest?",
  "Summarise everything open for one client.",
  "Who has the most work on right now?",
];

/**
 * Where the question could be answered TODAY, by hand.
 *
 * A keyword match, and deliberately a crude one — it is not pretending to
 * understand the sentence, it is noticing a word and naming the screen that
 * already has the answer. Being sent somewhere useful is worth more than a
 * refusal that ends the conversation, and the reply says plainly that this is
 * the product pointing rather than the Copilot answering.
 */
const SIGNPOSTS: readonly {
  readonly words: readonly string[];
  /** Typed, so a signpost pointing at a screen that no longer exists is a
   *  compile error rather than a 404 the Copilot cheerfully hands somebody. */
  readonly href: Route;
  readonly label: string;
}[] = [
  { words: ["late", "overdue", "due", "deadline", "filing", "work", "task"], href: "/work-items", label: "the Work board" },
  { words: ["owe", "unpaid", "paid", "payment", "receivable", "outstanding", "collect"], href: "/receivables", label: "Receivables" },
  { words: ["invoice", "bill", "billed", "raise"], href: "/invoices", label: "Invoices" },
  { words: ["proposal", "quote", "quoted", "pricing"], href: "/proposals", label: "Proposals" },
  { words: ["lead", "pipeline", "prospect"], href: "/leads", label: "the Pipeline" },
  { words: ["client", "customer", "entity", "group"], href: "/clients", label: "Clients" },
  { words: ["compliance", "statutory", "gst", "tds", "return", "calendar"], href: "/calendar", label: "the Compliance calendar" },
];

function signpostFor(question: string): { href: Route; label: string } | null {
  const asked = question.toLowerCase();
  const hit = SIGNPOSTS.find((s) => s.words.some((w) => asked.includes(w)));
  return hit === undefined ? null : { href: hit.href, label: hit.label };
}

export default function CopilotPage() {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const nextId = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const foot = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const me = await api.GET("/api/v1/auth/me", {});
      if (!live) return;
      if (me.error) {
        // Not signed in is an ordinary state, not a failure to report.
        router.push("/login");
        return;
      }
      setPrincipal(me.data);

      const mine = await api.GET("/api/v1/tenancy/me/memberships", {});
      if (!live) return;
      if (mine.error) {
        setError(apiError(mine.error).message);
        return;
      }
      setMemberships(mine.data.memberships);
    })();

    return () => {
      live = false;
    };
  }, [router]);

  // The pending reply is a real timer, and a component that unmounts while one
  // is out would set state on nothing. Cleared here rather than guarded at the
  // callback, because cancelling the work beats ignoring its result.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  /** Keep the newest turn in view. A thread that grows below the fold and stays
   *  there looks like a send that did nothing. */
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  const send = useCallback((question: string) => {
    const asked = question.trim();
    if (asked === "" || timer.current !== null) return;

    const mine: Turn = { id: nextId.current++, from: "you", text: asked };
    setTurns((t) => [...t, mine]);
    setDraft("");
    setThinking(true);

    // THE DELAY IS ON PURPOSE. An answer that appears in the same frame as the
    // question reads as a canned string, which is exactly what it is — and the
    // screen is meant to behave the way the real one will, so that when the
    // real one lands nothing about the interaction changes.
    timer.current = setTimeout(() => {
      timer.current = null;
      setThinking(false);
      setTurns((t) => [...t, { id: nextId.current++, from: "copilot", text: asked }]);
    }, 700);
  }, []);

  if (!principal) return <Loading />;

  return (
    <Page>
      {/* No lede (Wave 4): "not live" is still said in the three places
          CLAUDE.md names, the pill, the reply and the line under the box. */}
      <PageHeader title="AI Copilot" aside={<Pill tone="warn">Not live yet</Pill>} />

      <ErrorNotice error={error} />

      <Card>
        <div className="chat">
          <div className="chat-thread">
            {turns.length === 0 && !thinking ? (
              <div className="chat-hero">
                <span className="chat-hero-mark" aria-hidden="true">
                  <Icon name="copilot" size={26} />
                </span>
                <h2>What would you like to know?</h2>
                <div className="chat-suggests">
                  {OPENERS.map((opener) => (
                    <button
                      key={opener}
                      type="button"
                      className="chat-suggest"
                      onClick={() => { send(opener); }}
                    >
                      {opener}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn) =>
                turn.from === "you" ? (
                  <div key={turn.id} className="chat-turn" data-from="you">
                    <p className="chat-said">{turn.text}</p>
                  </div>
                ) : (
                  <div key={turn.id} className="chat-turn" data-from="copilot">
                    <span className="chat-mark" aria-hidden="true">
                      <Icon name="copilot" size={15} />
                    </span>
                    <div className="chat-answer">
                      <Answer question={turn.text} />
                    </div>
                  </div>
                ),
              )
            )}

            {thinking && (
              <div className="chat-turn" data-from="copilot">
                <span className="chat-mark" aria-hidden="true">
                  <Icon name="copilot" size={15} />
                </span>
                {/* Announced, because a screen reader gets nothing at all from
                    three animated dots. */}
                <span className="chat-dots" role="status" aria-label="Copilot is answering">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}

            <div ref={foot} />
          </div>

          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <label className="sr-only" htmlFor="copilot-ask">
              Ask the Copilot
            </label>
            <textarea
              id="copilot-ask"
              ref={box}
              rows={1}
              value={draft}
              placeholder="e.g. What is due this week?"
              onChange={(e) => {
                setDraft(e.target.value);
                // Grow to fit what has been typed. The CSS caps it at 12rem and
                // lets it scroll after that, so a pasted page cannot push the
                // send button off the screen.
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${String(el.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a newline. The other way round is
                // correct for a document and wrong for a chat, and everybody who
                // has used one already has the habit.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                  if (box.current !== null) box.current.style.height = "auto";
                }
              }}
            />
            {/* `iconAfter`, not `icon`: the arrow points at where the question
                is going, and in front of the word it points back at it. And no
                `aria-label` — the button has a visible label, and adding one
                replaces "Ask" with something else for exactly the reader who
                cannot see the arrow either. */}
            <Button
              type="submit"
              size="sm"
              disabled={draft.trim() === "" || thinking}
              iconAfter={<Icon name="arrowRight" size={15} />}
            >
              Ask
            </Button>
          </form>

          <p className="chat-disclaimer">
            The Copilot is not connected to your firm&rsquo;s data yet. Nothing typed here is
            sent anywhere or stored.
          </p>
        </div>
      </Card>

      {turns.length > 0 && (
        // To the RIGHT, under the composer's own edge, so it reads as an action
        // on the conversation above it rather than a stray link the page left
        // lying in the margin.
        <p className="cluster end">
          <Button
            variant="link"
            onClick={() => {
              setTurns([]);
              setDraft("");
            }}
          >
            Start again
          </Button>
        </p>
      )}

      {/* ── The facts this page used to open with ──────────────────────────
          Closed, and last. They are worth keeping — a support conversation
          starts with "what is your firm id" and somebody has to be able to
          answer — but they are not what anybody came here for. */}
      <details className="disclosure">
        <summary>Technical details</summary>
        <Card>
          <Meta>
            <MetaItem label="Signed in as">
              {principal.role === null ? (
                <span className="unstated">no role</span>
              ) : (
                <Pill tone="ok">{principal.role}</Pill>
              )}
            </MetaItem>
            <MetaItem label="At">
              {principal.tenantId === null ? (
                <>
                  <span className="unstated">no firm selected</span>
                  {/* WHY, not just that. A null tenant is not an error and not a
                      missing setting — it is what a session looks like when the
                      account belongs to more than one firm and has not picked
                      one. Saying only "not selected" leaves somebody hunting for
                      a switch that is doing exactly what it should. */}
                  <span className="sub">this session belongs to more than one firm</span>
                </>
              ) : (
                principal.tenantName ?? <span className="mono">{principal.tenantId}</span>
              )}
            </MetaItem>
            <MetaItem label="Fees">
              {/* The FEE AXIS, not the role. Commercial visibility is a flag on
                  the membership and is orthogonal to what somebody may reach — a
                  manager who may read every client is not automatically somebody
                  who may see what the firm earns. */}
              {principal.commercialVisibility === true ? (
                <Pill tone="ok">visible</Pill>
              ) : (
                <Pill tone="quiet">hidden</Pill>
              )}
            </MetaItem>
          </Meta>

          <div className="card-foot">
            <Meta layout="list">
              <MetaItem label="User id">
                <span className="mono text-sm">{principal.userId}</span>
              </MetaItem>
              {principal.tenantId !== null && (
                <MetaItem label="Firm id">
                  <span className="mono text-sm">{principal.tenantId}</span>
                </MetaItem>
              )}
              <MetaItem label="Memberships">
                {memberships.length === 0 ? (
                  <span className="unstated">none</span>
                ) : (
                  <span className="cluster tight">
                    {memberships.map((m) => (
                      <Pill key={m.id} tone="quiet">
                        {m.tenantName ?? m.tenantId.slice(0, 8)} · {m.role} · {m.audience}
                      </Pill>
                    ))}
                  </span>
                )}
              </MetaItem>
              <MetaItem label="This session may">
                {principal.permissions.length === 0 ? (
                  <span className="unstated">nothing</span>
                ) : (
                  <span className="cluster tight">
                    {principal.permissions.map((p) => (
                      <Pill key={p} tone="code">
                        {p}
                      </Pill>
                    ))}
                  </span>
                )}
              </MetaItem>
            </Meta>
          </div>
        </Card>
      </details>
    </Page>
  );
}

/**
 * The answer. One answer, every time, and it is the truth.
 *
 * THIS IS THE SEAM. When there is an endpoint, this component renders what came
 * back instead of what is written here, and nothing else on the screen moves.
 */
function Answer({ question }: { question: string }) {
  const signpost = signpostFor(question);

  return (
    <>
      <p>
        I am not connected to your firm&rsquo;s records yet, so I cannot answer that. This
        screen shows what is coming.
      </p>
      {signpost === null ? (
        <p>
          When it is live, I will answer out of the same records the rest of the workspace
          reads, and only the ones your role already reaches.
        </p>
      ) : (
        <p>
          The workspace can already answer it, though. Look on{" "}
          <Link href={signpost.href}>{signpost.label}</Link>.
        </p>
      )}
    </>
  );
}
