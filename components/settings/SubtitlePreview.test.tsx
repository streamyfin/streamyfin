import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { SubtitlePreview } from "./SubtitlePreview";

const mockPlayerProps: Record<string, unknown>[] = [];

jest.mock("@/modules/mpv-player", () => {
  const { View } = require("react-native");
  return {
    MpvPlayerView: (
      props: Record<string, unknown> & { children?: ReactNode },
    ) => {
      mockPlayerProps.push(props);
      return <View testID='mpv-player' />;
    },
  };
});

jest.mock("expo-asset", () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: async () => undefined,
      localUri: "file:///sample_subtitled.mp4",
    }),
  },
}));

jest.mock("@/assets/sample_subtitled.mp4", () => 1, { virtual: true });

jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));

describe("SubtitlePreview", () => {
  beforeEach(() => {
    mockPlayerProps.length = 0;
  });

  // The clip has no sound and only shows subtitles: as a player for the user's
  // media it stopped their music on iOS and opened in picture in picture when
  // they left the app.
  it("plays the clip without background playback", async () => {
    await render(<SubtitlePreview />);
    await screen.findByTestId("mpv-player");

    const props = mockPlayerProps.at(-1);
    expect(props?.backgroundPlayback).toBe(false);
  });
});
