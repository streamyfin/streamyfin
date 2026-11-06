import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import i18n from "i18next";
import type React from "react";
import { initReactI18next } from "react-i18next";
// Number.prototype.bytesToReadable, which the app loads at startup.
import "@/augmentations/number";
import MusicSettingsPage from "@/app/(auth)/(tabs)/(home)/settings/music/page";
import en from "@/translations/en.json";

jest.mock("react-i18next", () =>
  jest.requireActual("@/test-utils/realI18next"),
);

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
// Loaded as the app loads them, so the labels go through the catalogue and i18next's plural
// rules. French stands for a Crowdin catalogue: a label written in English in the code would
// read the same in both languages.
beforeAll(() =>
  i18n.use(initReactI18next).init({
    lng: "en",
    compatibilityJSON: "v4",
    resources: {
      en: { translation: en },
      fr: {
        translation: {
          home: {
            settings: {
              music: {
                lookahead_songs_one: "{{count}} chanson",
                lookahead_songs_other: "{{count}} chansons",
              },
            },
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  }),
);
afterEach(() => act(() => i18n.changeLanguage("en")));

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

describe("MusicSettingsPage", () => {
  it("counts the songs to pre-cache in English, one song and more", async () => {
    await renderPage();

    expect(screen.getAllByText("1 song").length).toBeGreaterThan(0);
    for (const count of [2, 5]) {
      expect(screen.getAllByText(`${count} songs`).length).toBeGreaterThan(0);
    }
    // The current choice, shown on the dropdown's trigger, and its option.
    expect(screen.getAllByText("3 songs")).toHaveLength(2);
  });

  it("counts the songs to pre-cache in the app's language", async () => {
    await act(() => i18n.changeLanguage("fr"));
    await renderPage();

    expect(screen.getAllByText("1 chanson").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 chansons")).toHaveLength(2);
  });
});
