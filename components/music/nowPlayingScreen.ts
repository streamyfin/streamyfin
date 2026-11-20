import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

/** The music player's screen in the root stack. */
export const nowPlayingScreen = {
  name: "(auth)/now-playing",
  // A cast that starts or resumes on the TV, and the notification, push the
  // player from Now Playing too: the push brings this one back on top instead
  // of stacking a second modal over it.
  dangerouslySingular: true,
  options: {
    headerShown: false,
    presentation: "modal",
    gestureEnabled: true,
  },
} satisfies ComponentProps<typeof Stack.Screen>;
