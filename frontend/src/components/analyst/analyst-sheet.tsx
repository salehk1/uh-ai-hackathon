"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, MessageSquareText, Send, Square, Trash2, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { boldRuns, textBlocks } from "@/lib/chat";
import { Button } from "../ui";
import { useAnalyst, type Message } from "./analyst-context";
import { VisualView } from "./visuals";

const GENERAL_PROMPTS = [
  "Compare 77002, 77019 and 77494 on price per sqft. Which has more listings above their range?",
  "Find 3+ bedroom homes under $400K within 10 km of downtown that are below their estimated range.",
  "How accurate is the model, and how was it validated?",
];

export function AnalystSheet() {
  const a = useAnalyst();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (a.open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    restoreFocus.current?.focus?.();
  }, [a.open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [a.messages.length, a.busy]);

  useEffect(() => {
    if (!a.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") a.close();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, a[href], summary, [tabindex="0"]');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a]);

  const prompts = a.contextZpid
    ? [
        `Explain the price receipt for listing ${a.contextZpid}.`,
        `How does listing ${a.contextZpid} compare with other homes in its ZIP code?`,
        ...GENERAL_PROMPTS.slice(0, 1),
      ]
    : GENERAL_PROMPTS;

  return (
    <AnimatePresence>
      {a.open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-ink/15 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={a.close}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="analyst-title"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-line bg-canvas shadow-lg sm:inset-y-2 sm:right-2 sm:rounded-[22px] sm:border"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <MessageSquareText className="size-4.5 text-forest" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 id="analyst-title" className="text-[15px] font-semibold text-ink">
                  Housing analyst
                </h2>
                <p className="text-[11.5px] text-ink-3">Answers from the same listing tools as this app. Can take up to a minute.</p>
              </div>
              {a.messages.length > 0 && (
                <button
                  type="button"
                  onClick={a.clear}
                  className="rounded-full p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="Clear conversation"
                  title="Clear conversation"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={a.close}
                className="rounded-full p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Close analyst"
              >
                <X className="size-4.5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
              {a.messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-[13.5px] leading-relaxed text-ink-2">
                    Ask about specific listings, ZIP codes or the model. The analyst calls the search, receipt, comparison and
                    statistics tools and cites the numbers it gets back.
                  </p>
                  <ul className="space-y-2">
                    {prompts.map((p) => (
                      <li key={p}>
                        <button
                          type="button"
                          onClick={() => a.setDraft(p)}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-ink-2 shadow-sm transition-colors hover:border-line-strong hover:text-ink"
                        >
                          {p}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className="space-y-4">
                {a.messages.map((m) => (
                  <MessageView key={m.id} m={m} />
                ))}
              </ol>
              {a.busy && (
                <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[13px] text-ink-2 shadow-sm">
                  <LoaderCircle className="size-4 animate-spin text-forest" aria-hidden />
                  <span className="flex-1">Working on it. The analyst may run several tools first.</span>
                  <Button size="sm" variant="ghost" onClick={a.cancel}>
                    <Square className="size-3" aria-hidden /> Cancel
                  </Button>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form
              className="border-t border-line bg-surface/70 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                a.send(a.draft);
              }}
            >
              {a.contextZpid && (
                <div className="mb-2 flex items-center gap-2 text-[11.5px] text-ink-3">
                  <span className="rounded-full bg-sage-soft px-2 py-0.5 font-medium text-forest">Listing {a.contextZpid}</span>
                  <span>in context. Your prompt includes the id.</span>
                  <button type="button" className="ml-auto underline underline-offset-2 hover:text-ink" onClick={() => a.setContextZpid(null)}>
                    Remove
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label htmlFor="analyst-input" className="sr-only">
                  Message the analyst
                </label>
                <textarea
                  id="analyst-input"
                  ref={inputRef}
                  rows={2}
                  maxLength={2000}
                  value={a.draft}
                  onChange={(e) => a.setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      a.send(a.draft);
                    }
                  }}
                  placeholder="Ask about a listing, ZIP code or the model…"
                  className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/15"
                />
                <Button type="submit" variant="primary" className="size-11 shrink-0 px-0" disabled={!a.draft.trim() || a.busy} aria-label="Send">
                  <Send className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MessageView({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
          {m.content}
        </p>
      </li>
    );
  }
  if (m.role === "error") {
    return (
      <li
        className={clsx(
          "flex gap-2 rounded-2xl border px-3.5 py-3 text-[13px]",
          m.cancelled ? "border-line bg-surface-2 text-ink-3" : "border-danger/25 bg-danger-soft/60 text-ink",
        )}
        role={m.cancelled ? undefined : "alert"}
      >
        {!m.cancelled && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
        {m.content}
      </li>
    );
  }
  return (
    <li className="space-y-3">
      <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink shadow-sm">
        <SafeText text={m.content || "(The analyst returned no text.)"} />
      </div>
      {m.visuals.map((v, i) => (
        <VisualView key={i} v={v} />
      ))}
      {(m.toolCalls.length > 0 || m.mode) && (
        <details className="group rounded-xl px-1 text-[11.5px] text-ink-3">
          <summary className="cursor-pointer select-none rounded-md py-1 hover:text-ink">
            Technical details · {m.toolCalls.length} tool call{m.toolCalls.length === 1 ? "" : "s"}
          </summary>
          <dl className="mt-1.5 space-y-1 rounded-xl bg-surface-2 p-2.5 font-mono text-[11px]">
            <div>
              <dt className="inline text-ink-2">mode: </dt>
              <dd className="inline">{m.mode}</dd>
            </div>
            <div>
              <dt className="inline text-ink-2">source: </dt>
              <dd className="inline">{m.source}</dd>
            </div>
            {m.toolCalls.map((t, i) => (
              <div key={i} className="break-all">
                <dt className="inline text-ink-2">{t.tool}</dt> <dd className="inline">{JSON.stringify(t.args)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  );
}

/** Model text rendered as React text nodes only — never as HTML. */
function SafeText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {textBlocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            <Runs text={b.text} />
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Runs text={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Runs({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((r, i) => (r.bold ? <strong key={i} className="font-semibold">{r.text}</strong> : <span key={i}>{r.text}</span>))}
    </>
  );
}
