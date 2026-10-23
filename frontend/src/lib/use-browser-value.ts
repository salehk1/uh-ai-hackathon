"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Read a browser-only value (storage, capabilities) without a setState-in-effect round trip.
 * The server snapshot is used during SSR and hydration, then the client value takes over.
 */
export function useBrowserValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noop, read, () => serverValue);
}

export function readStorage(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
