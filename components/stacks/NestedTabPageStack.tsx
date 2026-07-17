import { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { HeaderBackButton } from "../common/HeaderBackButton";

type ICommonScreenOptions = ComponentProps<typeof Stack.Screen>["options"];

export const commonScreenOptions: ICommonScreenOptions = {
  title: "",
  headerShown: !Platform.isTV,
  headerTransparent: Platform.OS === "ios",
  headerShadowVisible: false,
  headerBlurEffect: "none",
  headerLeft: () => <HeaderBackButton />,
};

const routes = [
  "persons/[personId]",
  "items/page",
  "series/[id]",
  "music/album/[albumId]",
  "music/artist/[artistId]",
  "music/playlist/[playlistId]",
];

export const nestedTabPageScreenOptions: Record<string, ICommonScreenOptions> =
  Object.fromEntries(routes.map((route) => [route, commonScreenOptions]));
