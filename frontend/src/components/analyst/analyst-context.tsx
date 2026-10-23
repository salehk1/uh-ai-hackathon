"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, apiFetch, errorMessage } from "@/lib/api/client";
import { chatResponseSchema } from "@/lib/api/schemas";
import { historyForRequest, normalizeVisual, type ChatTurn, type ChatVisual } from "@/lib/chat";
import { AnalystSheet } from "./analyst-sheet";

export type Message =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      visuals: ChatVisual[];
      toolCalls: { tool: string; args: Record<string, unknown> }[];
      mode: string;
      source: string;
    }
  | { id: string; role: "error"; content: string; cancelled: boolean };

type OpenOptions = { prompt?: string; zpid?: number };

type Ctx = {
  open: boolean;
  messages: Message[];
  busy: boolean;
  draft: string;
  contextZpid: number | null;
  setDraft: (s: string) => void;
  setContextZpid: (z: number | null) => void;
  openAnalyst: (o?: OpenOptions) => void;
  close: () => void;
  send: (text: string) => void;
  cancel: () => void;
  clear: () => void;
};

const AnalystCtx = createContext<Ctx | null>(null);

export function useAnalyst() {
  const c = useContext(AnalystCtx);
  if (!c) throw new Error("useAnalyst outside AnalystProvider");
  return c;
}

let seq = 0;
const id = () => `m${++seq}`;

/**
 * Conversation state lives on the client (the backend keeps no sessions). /chat is a single
 * JSON response after a tool loop: we show an honest busy state, allow cancelling, and never retry
 * automatically. A chat failure is contained here and doesn't affect the rest of the app.
 */
export function AnalystProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [contextZpid, setContextZpid] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const openAnalyst = useCallback((o?: OpenOptions) => {
    setOpen(true);
    if (o?.zpid !== undefined) setContextZpid(o.zpid);
    if (o?.prompt) setDraft(o.prompt);
  }, []);

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      const history: ChatTurn[] = historyForRequest(
        messages.flatMap((m) => (m.role === "user" || m.role === "assistant" ? [{ role: m.role, content: m.content }] : [])),
      );
      setMessages((ms) => [...ms, { id: id(), role: "user", content: message }]);
      setDraft("");
      setBusy(true);
      const ac = new AbortController();
      ctrl.current = ac;
      apiFetch("/api/chat", chatResponseSchema, { json: { message, history }, signal: ac.signal })
        .then(({ data, source }) => {
          setMessages((ms) => [
            ...ms,
            {
              id: id(),
              role: "assistant",
              content: data.text,
              visuals: data.visuals.map(normalizeVisual),
              toolCalls: data.tool_calls,
              mode: data.mode,
              source,
            },
          ]);
        })
        .catch((e: unknown) => {
          const cancelled = (e as Error).name === "AbortError" || (e instanceof ApiError && e.code === "cancelled");
          setMessages((ms) => [
            ...ms,
            {
              id: id(),
              role: "error",
              cancelled,
              content: cancelled
                ? "Cancelled. The analyst didn't finish this answer."
                : e instanceof ApiError && e.code === "backend_timeout"
                  ? "The analyst took too long to respond. Maps, reports and comparisons still work."
                  : `The analyst is unavailable right now (${errorMessage(e)}). Maps, reports and comparisons still work.`,
            },
          ]);
        })
        .finally(() => {
          if (ctrl.current === ac) ctrl.current = null;
          setBusy(false);
        });
    },
    [busy, messages],
  );

  const cancel = useCallback(() => ctrl.current?.abort(), []);
  const clear = useCallback(() => {
    ctrl.current?.abort();
    setMessages([]);
    setContextZpid(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      open,
      messages,
      busy,
      draft,
      contextZpid,
      setDraft,
      setContextZpid,
      openAnalyst,
      close: () => setOpen(false),
      send,
      cancel,
      clear,
    }),
    [open, messages, busy, draft, contextZpid, openAnalyst, send, cancel, clear],
  );

  return (
    <AnalystCtx.Provider value={value}>
      {children}
      <AnalystSheet />
    </AnalystCtx.Provider>
  );
}
