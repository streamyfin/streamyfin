import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import { useMemo } from "react";
import { Platform } from "react-native";
import { matchesQuery } from "./searchFilter";
import { SETTINGS_CATALOG, type SettingsTarget } from "./settingsCatalog";
import { SETTINGS_SEARCH_INDEX } from "./settingsSearchIndex";

export interface SearchResult {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  target: SettingsTarget;
}

export const useSettingsSearch = (query: string): SearchResult[] => {
  const os: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
  return useMemo(() => {
    if (!query.trim()) return [];
    const results: SearchResult[] = [];
    for (const section of SETTINGS_CATALOG) {
      for (const e of section.entries) {
        if (e.platforms && !e.platforms.includes(os)) continue;
        const title = t(e.titleKey);
        if (matchesQuery({ title, keywords: e.keywords }, query)) {
          results.push({ id: e.id, title, icon: e.icon, target: e.target });
        }
      }
    }
    for (const o of SETTINGS_SEARCH_INDEX) {
      if (o.platforms && !o.platforms.includes(os)) continue;
      const title = t(o.titleKey);
      if (matchesQuery({ title, keywords: o.keywords }, query)) {
        results.push({
          id: `${o.parentRoute}#${o.titleKey}`,
          title,
          icon: "search",
          subtitle: t(o.parentTitleKey),
          target: { type: "route", route: o.parentRoute },
        });
      }
    }
    return results;
  }, [query, os]);
};
