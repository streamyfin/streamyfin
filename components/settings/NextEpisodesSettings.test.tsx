import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
// The real menu is a native or bottom sheet one; this lists every choice.
jest.mock("@/components/PlatformDropdown", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    PlatformDropdown: ({
      groups,
      trigger,
      disabled,
    }: {
      groups: {
        options: {
          label: string;
          onPress?: () => void;
          onToggle?: () => void;
        }[];
      }[];
      trigger: React.ReactNode;
      disabled?: boolean;
    }) => (
      <View>
        {trigger}
        {!disabled &&
          groups
            .flatMap((group) => group.options)
            .map((option) => (
              <Text
                key={option.label}
                onPress={option.onPress ?? option.onToggle}
              >
                {`option:${option.label}`}
              </Text>
            ))}
      </View>
    ),
  };
});
const mockRunNextEpisodesCheck = jest.fn();
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ runNextEpisodesCheck: mockRunNextEpisodesCheck }),
}));
const mockUpdateSettings = jest.fn();
const mockSettings = {
  settings: {
    nextEpisodesDownloadCount: 3,
    nextEpisodesWifiOnly: true,
    nextEpisodesDeleteAnyDownload: false,
  },
  pluginSettings: {} as Record<string, { locked: boolean; value: unknown }>,
};
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    ...mockSettings,
    updateSettings: mockUpdateSettings,
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "user-1" }) };
});

import {
  type NextEpisodesRule,
  nextEpisodesRulesAtom,
  withRule,
} from "@/providers/Downloads/nextEpisodesRules";
import { NextEpisodesSettings } from "./NextEpisodesSettings";

const rule = (
  seriesId: string,
  change: Partial<NextEpisodesRule> = {},
): NextEpisodesRule => ({
  seriesId,
  seriesName: `Show ${seriesId}`,
  count: 3,
  deleteWatched: false,
  downloadedIds: [],
  ...change,
});

const renderSettings = async (...rules: NextEpisodesRule[]) => {
  const store = createStore();
  for (const r of rules) {
    store.set(nextEpisodesRulesAtom, (current) =>
      withRule(current, "user-1", r),
    );
  }
  await render(
    <Provider store={store}>
      <NextEpisodesSettings />
    </Provider>,
  );
  return store;
};

beforeEach(() => {
  clearMmkv();
  jest.clearAllMocks();
  mockSettings.pluginSettings = {};
});

describe("NextEpisodesSettings", () => {
  test("says when no series keeps its next episodes downloaded", async () => {
    await renderSettings();
    expect(screen.getByText("home.settings.downloads.no_series")).toBeTruthy();
  });

  test("lists each series with what its rule keeps", async () => {
    await renderSettings(
      rule("a", { count: 5 }),
      rule("b", { deleteWatched: true }),
    );

    expect(screen.getByText("Show a")).toBeTruthy();
    expect(
      screen.getByText("home.settings.downloads.series_rule:5"),
    ).toBeTruthy();
    expect(
      screen.getByText("home.settings.downloads.series_rule_delete:3"),
    ).toBeTruthy();
  });

  test("changes the count of one series", async () => {
    const store = await renderSettings(rule("a", { downloadedIds: ["e1"] }));

    // The first menu is the default count; the second is the series'.
    const [, seriesCount] = screen.getAllByText(
      "option:home.settings.downloads.episode_count:10",
    );
    await fireEvent.press(seriesCount);

    expect(store.get(nextEpisodesRulesAtom)["user-1"].a).toMatchObject({
      count: 10,
      downloadedIds: ["e1"],
    });
    expect(mockRunNextEpisodesCheck).toHaveBeenCalled();
  });

  test("stops keeping a series' episodes downloaded", async () => {
    const store = await renderSettings(rule("a"), rule("b"));

    const [stopFirst] = screen.getAllByText(
      "option:home.settings.downloads.stop_keeping",
    );
    await fireEvent.press(stopFirst);

    expect(Object.keys(store.get(nextEpisodesRulesAtom)["user-1"])).toEqual([
      "b",
    ]);
  });

  test("turning Wi-Fi only off checks again at once", async () => {
    await renderSettings();

    await fireEvent(
      screen.getByLabelText("home.settings.downloads.wifi_only"),
      "valueChange",
      false,
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      nextEpisodesWifiOnly: false,
    });
    expect(mockRunNextEpisodesCheck).toHaveBeenCalled();
  });

  // The plugin lets a server admin propose any count from 3 to 10.
  test("shows a default count the server proposed among the choices", async () => {
    mockSettings.settings.nextEpisodesDownloadCount = 7;
    try {
      await renderSettings();
    } finally {
      mockSettings.settings.nextEpisodesDownloadCount = 3;
    }

    expect(
      screen.getByText("home.settings.downloads.episode_count:7"),
    ).toBeTruthy();
    expect(
      screen.getByText("option:home.settings.downloads.episode_count:7"),
    ).toBeTruthy();
  });

  test("cannot change what the server admin locked", async () => {
    mockSettings.pluginSettings = {
      nextEpisodesWifiOnly: { locked: true, value: true },
      nextEpisodesDownloadCount: { locked: true, value: 3 },
    };
    await renderSettings();

    expect(
      screen.getByLabelText("home.settings.downloads.wifi_only").props.disabled,
    ).toBe(true);
    expect(
      screen.queryByText("option:home.settings.downloads.episode_count:5"),
    ).toBeNull();
  });
});
