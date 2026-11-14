import { render, screen } from "@testing-library/react-native";
import type React from "react";
import { PlaybackControlsSettings } from "./PlaybackControlsSettings";

const mockUpdateSettings = jest.fn();
const mockPluginSettings: Record<string, { locked: boolean }> = {};
jest.mock("@/utils/atoms/settings", () => ({
  ScreenOrientationEnum: {},
  useSettings: () => ({
    settings: {
      defaultVideoOrientation: 0,
      defaultBitrate: { key: "Max" },
      defaultPlaybackSpeed: 1,
      disableHapticFeedback: false,
      showResumeDialog: true,
      autoPlayNextEpisode: true,
    },
    updateSettings: mockUpdateSettings,
    pluginSettings: mockPluginSettings,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: jest.fn() }));
jest.mock("@/packages/expo-screen-orientation", () => ({
  OrientationLock: {
    DEFAULT: 0,
    PORTRAIT_UP: 1,
    LANDSCAPE: 5,
    LANDSCAPE_LEFT: 6,
    LANDSCAPE_RIGHT: 7,
  },
}));
// Whether each dropdown, by title, was handed `disabled`.
const mockDropdownDisabled = new Map<string, boolean | undefined>();
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({
    trigger,
    title,
    disabled,
  }: {
    trigger: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => {
    mockDropdownDisabled.set(title, disabled);
    return trigger;
  },
}));

beforeEach(() => {
  mockUpdateSettings.mockClear();
  mockDropdownDisabled.clear();
  for (const key of Object.keys(mockPluginSettings)) {
    delete mockPluginSettings[key];
  }
});

// The group was greyed out, and its touches dropped, once the orientation and
// the haptics were both locked; with the safe area row gone from it, that
// took two locks instead of three, though each row carries its own.
describe("a plugin that locks the orientation and the haptics", () => {
  beforeEach(() => {
    mockPluginSettings.defaultVideoOrientation = { locked: true };
    mockPluginSettings.disableHapticFeedback = { locked: true };
  });

  test("does not mark the whole group as disabled by the admin", async () => {
    await render(<PlaybackControlsSettings />);

    expect(screen.queryByText("Disabled by admin")).toBeNull();
  });

  test("leaves the rows it did not lock to the viewer's touches", async () => {
    await render(<PlaybackControlsSettings />);
    // Haptics, resume dialog, autoplay, in that order.
    const autoplay = screen.getAllByRole("switch")[2];

    // On a device a pointerEvents="none" ancestor drops every touch; the
    // test renderer's fireEvent does not, so the chain is read instead.
    const blocking: string[] = [];
    for (let node = autoplay.parent; node; node = node.parent) {
      if (node.props.pointerEvents === "none") blocking.push(String(node.type));
    }
    expect(blocking).toEqual([]);
  });
});

// A row only greys itself out: its dropdown still opened, and the value picked
// there was dropped by updateSettings. The group's wrapper used to block the
// orientation's once the haptics were locked too.
test("a locked setting's dropdown does not open", async () => {
  mockPluginSettings.defaultVideoOrientation = { locked: true };
  mockPluginSettings.defaultBitrate = { locked: true };
  mockPluginSettings.defaultPlaybackSpeed = { locked: true };
  mockPluginSettings.stillWatchingPreset = { locked: true };

  await render(<PlaybackControlsSettings />);

  expect(Object.fromEntries(mockDropdownDisabled)).toEqual({
    "home.settings.other.orientation": true,
    "home.settings.other.default_quality": true,
    "home.settings.other.default_playback_speed": true,
    "home.settings.other.still_watching": true,
  });
});

test("an unlocked setting's dropdown opens", async () => {
  await render(<PlaybackControlsSettings />);

  expect([...mockDropdownDisabled.values()]).not.toContain(true);
});
