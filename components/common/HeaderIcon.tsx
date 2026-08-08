/**
 * The icon vocabulary for native headers.
 *
 * Headers used to mix Feather (thin, geometric, uniform stroke) with Ionicons
 * (rounded, heavier, optical-size tuned), sometimes in the same row — which is
 * why six icons side by side never looked like a set.
 *
 * `SymbolView` resolves one name per platform to that platform's own icon
 * system: SF Symbols on iOS, Material Symbols on Android. Each is internally
 * consistent by construction, and the iOS side matches the SF Symbols the tab
 * bar already uses. The Android font ships bundled with `expo-symbols`, so
 * nothing is fetched at runtime and offline mode is unaffected.
 *
 * Deployment target is iOS 16.4, so every SF Symbol here must exist in iOS 16
 * or earlier — a symbol added later renders as a blank box on older devices.
 */

import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import type { ColorValue } from "react-native";
import { HEADER_ICON_SIZE } from "./HeaderButton";

/**
 * Names are semantic rather than visual, so swapping a glyph is a one-line
 * change here instead of a hunt through call sites. Pairs ending in a past
 * tense (`favorited`, `watchlisted`, `played`) are the "on" state of a toggle.
 */
const HEADER_ICONS = {
  // No `ios` entry on purpose: Cast is a Google mark, so SF Symbols has no
  // equivalent, and every near-miss reads as something else — `airplayvideo` is
  // AirPlay, which the app offers separately in now-playing. iOS falls back to
  // the Feather glyph below; Android has the real mark in Material Symbols.
  cast: { android: "cast" },
  sessions: { ios: "play.circle", android: "play_circle" },
  settings: { ios: "gearshape", android: "settings" },
  downloads: { ios: "arrow.down.circle", android: "download" },
  downloaded: { ios: "checkmark.circle.fill", android: "download_done" },
  queued: { ios: "hourglass", android: "hourglass" },
  remoteSession: { ios: "play.rectangle", android: "personal_video" },
  played: { ios: "checkmark.circle.fill", android: "check_circle" },
  unplayed: { ios: "checkmark.circle", android: "check_circle" },
  favorited: { ios: "heart.fill", android: "favorite" },
  favorite: { ios: "heart", android: "favorite_border" },
  watchlisted: { ios: "bookmark.fill", android: "bookmark" },
  watchlist: { ios: "bookmark", android: "bookmark_border" },
  more: { ios: "ellipsis", android: "more_horiz" },
  add: { ios: "plus", android: "add" },
  edit: { ios: "pencil", android: "edit" },
  delete: { ios: "trash", android: "delete" },
  trailer: { ios: "film", android: "movie" },
  back: { ios: "chevron.backward", android: "chevron_backward" },
} as const;

export type HeaderIconName = keyof typeof HEADER_ICONS;

/**
 * Glyphs for entries above that omit a platform, drawn from Feather instead.
 *
 * `SymbolView` renders `fallback` whenever the current platform has no name, so
 * this covers the gaps rather than forcing a bad symbol match. Keep it as short
 * as possible — it is the one place a header steps outside the platform's own
 * icon system.
 */
const FALLBACK_GLYPHS: Partial<
  Record<HeaderIconName, keyof typeof Feather.glyphMap>
> = {
  cast: "cast",
};

interface Props {
  name: HeaderIconName;
  /** Defaults to white; pass a colour to signal a toggle's "on" state. */
  tintColor?: ColorValue;
  /** Only override for icons rendered outside a header. */
  size?: number;
}

export const HeaderIcon: React.FC<Props> = ({
  name,
  tintColor = "white",
  size = HEADER_ICON_SIZE,
}) => {
  const fallbackGlyph = FALLBACK_GLYPHS[name];

  return (
    <SymbolView
      name={HEADER_ICONS[name]}
      size={size}
      tintColor={tintColor}
      resizeMode='scaleAspectFit'
      fallback={
        fallbackGlyph ? (
          <Feather name={fallbackGlyph} size={size} color={tintColor} />
        ) : undefined
      }
    />
  );
};
