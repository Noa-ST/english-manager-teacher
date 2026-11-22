"use client";

import * as React from "react";
import {
  applyBrandThemeToDocument,
  persistBrandThemeLocally,
  readStoredBrandTheme,
  SETTINGS_UPDATED_EVENT,
  type BrandThemeColors,
} from "@/services/settings-helpers";

/**
 * Global client-side Brand Theme synchronizer.
 * Applies cached theme immediately on mount, refreshes from PostgreSQL via
 * `/api/public/brand-theme`, and listens to live `SETTINGS_UPDATED_EVENT`
 * broadcasts from `/settings`.
 */
export function BrandThemeSync() {
  React.useEffect(() => {
    // 1. Apply cached theme immediately for instant visual consistency
    const cached = readStoredBrandTheme();
    if (cached) {
      applyBrandThemeToDocument(cached);
    }

    // 2. Fetch authoritative theme from PostgreSQL
    let active = true;
    fetch("/api/public/brand-theme", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { data?: { brandTheme?: BrandThemeColors | null } } | null) => {
        if (!active) return;
        const theme = payload?.data?.brandTheme;
        if (theme) {
          const normalized = applyBrandThemeToDocument(theme);
          persistBrandThemeLocally(normalized);
        }
      })
      .catch(() => {});

    // 3. Listen to live updates from Settings
    const handleSettingsUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{ brandTheme?: BrandThemeColors | null }>
      ).detail;
      if (detail?.brandTheme) {
        const normalized = applyBrandThemeToDocument(detail.brandTheme);
        persistBrandThemeLocally(normalized);
      }
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  return null;
}
