"use client";

import * as React from "react";

import { toIsoDate } from "@/services/schedule-calendar-helpers";

const emptySubscribe = () => () => {};
const DEFAULT_SERVER_TODAY_ISO = "2026-11-21";
const getClientTodayIso = () => toIsoDate(new Date());

/**
 * Hydration-safe hook returning today's local YYYY-MM-DD date string.
 * Returns a deterministic fallback during SSR and reads `new Date()` cleanly on the client.
 */
export function useTodayIso(serverFallback = DEFAULT_SERVER_TODAY_ISO): string {
  return React.useSyncExternalStore(
    emptySubscribe,
    getClientTodayIso,
    () => serverFallback,
  );
}
