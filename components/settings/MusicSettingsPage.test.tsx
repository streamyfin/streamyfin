import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type React from "react";
// Number.prototype.bytesToReadable, which the app loads at startup.
import "@/augmentations/number";
import MusicSettingsPage from "@/app/(auth)/(tabs)/(home)/settings/music/page";

const mockSettings = {
  audioLookaheadCount: 3,
  audioMaxCacheSizeMB: 500,
  musicNormalizationMode: "off",
};
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: jest.fn(),
    pluginSettings: {},
  }),
}));
jest.mock("@/providers/AudioStorage", () => ({
  clearCache: jest.fn(),
  clearPermanentDownloads: jest.fn(),
  getStorageStats: async () => ({ cacheSize: 0, permanentSize: 0 }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => jest.fn() }));
jest.mock("sonner-native", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// The dropdown shows its trigger and every option's label.
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({
    trigger,
    groups,
  }: {
    trigger: React.ReactNode;
    groups: { options: { label: string }[] }[];
  }) => {
    const { Text } = jest.requireActual("react-native");
    return (
      <>
        {trigger}
        {groups
          .flatMap((group) => group.options)
          .map((option) => (
            <Text key={option.label}>{option.label}</Text>
          ))}
      </>
    );
  },
}));
// The key, and its values when there are some, stand for the translation.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: object) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));

// No garbage collection timer, so Jest can exit when the spec ends.
const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
        })
      }
    >
      <MusicSettingsPage />
    </QueryClientProvider>,
  );

const songs = (count: number) =>
  `home.settings.music.lookahead_songs {"count":${count}}`;

describe("MusicSettingsPage", () => {
  // The songs to pre-cache read "1 song", "3 songs" in English, whatever the app's language.
  it("counts the songs to pre-cache in the app's language", async () => {
    await renderPage();

    for (const count of [1, 2, 3, 5]) {
      expect(screen.getAllByText(songs(count)).length).toBeGreaterThan(0);
    }
    // The current choice, shown on the dropdown's trigger, and its option.
    expect(screen.getAllByText(songs(3))).toHaveLength(2);
  });
});
