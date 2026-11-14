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

  // A silent clip that only shows the subtitles: it loops with its one
  // subtitle track on.
  it("loops the clip with its subtitle track on", async () => {
    await render(<SubtitlePreview />);
    await screen.findByTestId("mpv-player");

    expect(mockPlayerProps.at(-1)?.source).toEqual({
      url: "file:///sample_subtitled.mp4",
      autoplay: true,
      initialSubtitleId: 1,
      loop: true,
    });
  });
});
