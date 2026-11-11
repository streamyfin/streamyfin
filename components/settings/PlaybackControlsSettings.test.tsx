import { render, screen } from "@testing-library/react-native";
import type { OptionGroup } from "@/components/PlatformDropdown";
import { PlaybackControlsSettings } from "./PlaybackControlsSettings";

const mockUpdateSettings = jest.fn();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/components/PlaybackSpeedSelector", () => ({
  PLAYBACK_SPEEDS: [{ label: "1x", value: 1 }],
}));
jest.mock("@/packages/expo-screen-orientation", () => ({
  OrientationLock: {
    DEFAULT: 0,
    PORTRAIT_UP: 3,
    LANDSCAPE: 5,
    LANDSCAPE_LEFT: 6,
    LANDSCAPE_RIGHT: 7,
  },
}));
jest.mock("@/utils/atoms/settings", () => ({
  ScreenOrientationEnum: {
    0: "orientations.DEFAULT",
    3: "orientations.PORTRAIT_UP",
    5: "orientations.LANDSCAPE",
    6: "orientations.LANDSCAPE_LEFT",
    7: "orientations.LANDSCAPE_RIGHT",
  },
  useSettings: () => ({
    settings: {
      defaultVideoOrientation: 0,
      defaultPlaybackSpeed: 1,
      stillWatchingPreset: "disabled",
    },
    updateSettings: mockUpdateSettings,
    pluginSettings: undefined,
  }),
}));
// Each dropdown lists its choices under its title, in the order it offers
// them.
jest.mock("@/components/PlatformDropdown", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    PlatformDropdown: ({
      groups,
      title,
    }: {
      groups: OptionGroup[];
      title?: string;
    }) => (
      <View accessibilityLabel={title}>
        {groups.flatMap((group) =>
          group.options.map((option) => (
            <Text
              key={option.label}
              onPress={"onPress" in option ? option.onPress : undefined}
            >
              {option.label}
            </Text>
          )),
        )}
      </View>
    ),
  };
});

beforeEach(() => {
  mockUpdateSettings.mockClear();
});

// The default quality moved to the quality group, with Auto's settings.
describe("the other settings", () => {
  test("no longer hold the default quality", async () => {
    await render(<PlaybackControlsSettings />);

    expect(
      screen.queryByLabelText("home.settings.other.default_quality"),
    ).toBeNull();
  });
});
