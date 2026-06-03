import type { Ionicons } from "@expo/vector-icons";

export type SettingsTarget =
  | { type: "route"; route: string }
  | { type: "action"; action: "quickConnect" };

export interface SettingsEntry {
  id: string;
  titleKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  target: SettingsTarget;
  /** extra search terms (English); the title is always searched too */
  keywords?: string[];
  /** when set, entry only shows on these platforms */
  platforms?: ("ios" | "android")[];
}

export interface SettingsSectionDef {
  id: string;
  titleKey: string;
  entries: SettingsEntry[];
}

/**
 * Single source of truth for the Settings index: drives both rendering and search.
 *
 * EXTENSIBLE SHELL — to add a setting that lands from an in-flight PR, append one
 * entry to the right section (and, if it lives inside a sub-page, an entry in
 * settingsSearchIndex.ts). No screen rewrite needed. Reserved slots (add when the
 * PR merges): sleep timer #922, sync-play #1612, wake-on-LAN #1539 (advanced);
 * download location #1486/#1193, clear image cache #1589 (storage/downloads);
 * double-tap seek #1219/#1289, subtitle background #1543 (playback).
 */
export const SETTINGS_CATALOG: SettingsSectionDef[] = [
  {
    id: "playback",
    titleKey: "home.settings.categories.playback",
    entries: [
      {
        id: "playback-controls",
        titleKey: "home.settings.playback_controls.title",
        icon: "play",
        target: { type: "route", route: "/settings/playback-controls/page" },
        keywords: ["speed", "skip", "autoplay", "orientation"],
      },
      {
        id: "audio-subtitles",
        titleKey: "home.settings.audio_subtitles.title",
        icon: "chatbox-ellipses",
        target: { type: "route", route: "/settings/audio-subtitles/page" },
        keywords: ["subtitle", "audio", "language"],
      },
      {
        id: "music",
        titleKey: "home.settings.music.title",
        icon: "musical-notes",
        target: { type: "route", route: "/settings/music/page" },
      },
    ],
  },
  {
    id: "personalization",
    titleKey: "home.settings.categories.personalization",
    entries: [
      {
        id: "appearance",
        titleKey: "home.settings.appearance.title",
        icon: "color-palette",
        target: { type: "route", route: "/settings/appearance/page" },
      },
      {
        id: "notifications",
        titleKey: "home.settings.notifications.title",
        icon: "notifications",
        target: { type: "route", route: "/settings/notifications/page" },
      },
    ],
  },
  {
    id: "advanced",
    titleKey: "home.settings.categories.advanced",
    entries: [
      {
        id: "quick-connect",
        titleKey: "home.settings.quick_connect.quick_connect_title",
        icon: "key",
        target: { type: "action", action: "quickConnect" },
      },
      {
        id: "pair",
        titleKey: "pairing.pair_with_phone",
        icon: "phone-portrait",
        target: {
          type: "route",
          route: "/(auth)/(tabs)/(home)/companion-login",
        },
        platforms: ["android"],
      },
      {
        id: "plugins",
        titleKey: "home.settings.plugins.plugins_title",
        icon: "extension-puzzle",
        target: { type: "route", route: "/settings/plugins/page" },
      },
      {
        id: "network",
        titleKey: "home.settings.network.title",
        icon: "wifi",
        target: { type: "route", route: "/settings/network/page" },
      },
      {
        id: "logs",
        titleKey: "home.settings.logs.logs_title",
        icon: "document-text",
        target: { type: "route", route: "/settings/logs/page" },
      },
      {
        id: "intro",
        titleKey: "home.settings.intro.title",
        icon: "information-circle",
        target: { type: "route", route: "/settings/intro/page" },
      },
    ],
  },
];
