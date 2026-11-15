import { Stack } from "expo-router";
import type { TFunction } from "i18next";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { HeaderGradient } from "@/components/common/HeaderGradient";

type ICommonScreenOptions = ComponentProps<typeof Stack.Screen>["options"];

/**
 * Applied via `<Stack screenOptions={...}>` in every tab layout.
 *
 * The native stack renders its own back button, aligned by UIKit / the Android
 * Toolbar, so screens must never supply a custom `headerLeft` just to go back —
 * that is what knocked every header out of alignment. These two options are all
 * it takes to match the app's look: a white chevron with no back title.
 *
 * `scrollEdgeEffects.top` is hidden because on iOS 26 UIKit paints a soft blur
 * under the navigation bar of any inset-adjusted scroll view, which defeats the
 * fully transparent headers this app uses. Readability over content comes from
 * `headerBackground` instead: a dark-to-transparent scrim behind every header.
 */
export const stackScreenOptions: ICommonScreenOptions = {
  headerTintColor: "white",
  headerBackButtonDisplayMode: "minimal",
  scrollEdgeEffects: { top: "hidden" },
  headerBackground:
    Platform.OS === "ios" ? () => <HeaderGradient /> : undefined,
};

export const commonScreenOptions: ICommonScreenOptions = {
  title: "",
  headerShown: !Platform.isTV,
  headerTransparent: Platform.OS === "ios",
  headerShadowVisible: false,
  headerBlurEffect: "none",
};

const routes = [
  "persons/[personId]",
  "studios/[studioId]",
  "items/page",
  "series/[id]",
  "music/album/[albumId]",
  "music/artist/[artistId]",
  "music/playlist/[playlistId]",
  "watchlists/[watchlistId]",
];

export const nestedTabPageScreenOptions: Record<string, ICommonScreenOptions> =
  Object.fromEntries(routes.map((route) => [route, commonScreenOptions]));

const watchlistSheetOptions: ICommonScreenOptions = {
  presentation: "modal",
  headerShown: !Platform.isTV,
  headerStyle: { backgroundColor: "#171717" },
  headerTintColor: "white",
  contentStyle: { backgroundColor: "#171717" },
};

/**
 * The watchlist create and edit sheets. They sit in the shared group with the
 * watchlist itself, so they open over the tab that asked for them instead of
 * switching to another one.
 */
export const watchlistSheetScreenOptions = (
  t: TFunction,
): Record<string, ICommonScreenOptions> => ({
  "watchlists/create": {
    ...watchlistSheetOptions,
    title: t("watchlists.create_title"),
  },
  "watchlists/edit/[watchlistId]": {
    ...watchlistSheetOptions,
    title: t("watchlists.edit_title"),
  },
});
