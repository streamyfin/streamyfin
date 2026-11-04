import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
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
      defaultBitrate: { key: "Max", value: undefined },
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

const qualityChoices = () =>
  within(screen.getByLabelText("home.settings.other.default_quality"));

beforeEach(() => {
  mockUpdateSettings.mockClear();
});

describe("the default quality setting", () => {
  test("offers Auto first, under its name in the app language", async () => {
    await render(<PlaybackControlsSettings />);

    expect(
      qualityChoices()
        .getAllByText(/./)
        .map((choice) => choice.props.children),
    ).toEqual([
      "item_card.quality_auto",
      "Max",
      "8 Mb/s",
      "4 Mb/s",
      "2 Mb/s",
      "1 Mb/s",
      "500 Kb/s",
      "250 Kb/s",
    ]);
  });

  test("stores Auto when it is picked", async () => {
    await render(<PlaybackControlsSettings />);

    await fireEvent.press(qualityChoices().getByText("item_card.quality_auto"));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      defaultBitrate: { key: "Auto", value: undefined },
    });
  });
});
