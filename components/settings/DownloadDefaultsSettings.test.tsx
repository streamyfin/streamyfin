import { fireEvent, render, screen } from "@testing-library/react-native";
import type { OptionGroup } from "@/components/PlatformDropdown";
import type { Settings } from "@/utils/atoms/settings";
import { DownloadDefaultsSettings } from "./DownloadDefaultsSettings";

const mockUpdateSettings = jest.fn();
let mockSettings: Partial<Settings> = {};

jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { mode?: string }) =>
      options?.mode ? `${key} (${options.mode})` : key,
  }),
}));
// Lists the options instead of a menu to open, so a spec can pick from it.
jest.mock("@/components/PlatformDropdown", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    PlatformDropdown: ({ groups }: { groups: OptionGroup[] }) =>
      groups.flatMap((group) =>
        group.options.map((option) => (
          <Text
            key={option.label}
            onPress={"onPress" in option ? option.onPress : undefined}
          >
            {option.label}
          </Text>
        )),
      ),
  };
});

const SAME_AS_PLAYBACK =
  "home.settings.storage.download_audio_same_as_playback";

beforeEach(() => {
  mockUpdateSettings.mockClear();
  mockSettings = {};
});

describe("DownloadDefaultsSettings, audio channels", () => {
  // "Auto" is a mode of its own, so the default names what it follows.
  test("names the playback mode that Same as playback follows", async () => {
    mockSettings = { audioTranscodeMode: "stereo" } as Partial<Settings>;
    await render(<DownloadDefaultsSettings />);

    expect(
      screen.getByText(
        `${SAME_AS_PLAYBACK} (home.settings.audio.transcode_mode.stereo)`,
      ),
    ).toBeTruthy();
  });

  test("Same as playback clears a download audio mode", async () => {
    mockSettings = {
      downloadAudioTranscodeMode: "5.1",
    } as Partial<Settings>;
    await render(<DownloadDefaultsSettings />);

    await fireEvent.press(
      screen.getByText(
        `${SAME_AS_PLAYBACK} (home.settings.audio.transcode_mode.auto)`,
      ),
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      downloadAudioTranscodeMode: undefined,
    });
  });

  test("a mode picked for downloads overrides the playback one", async () => {
    await render(<DownloadDefaultsSettings />);

    await fireEvent.press(
      screen.getByText("home.settings.audio.transcode_mode.stereo"),
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      downloadAudioTranscodeMode: "stereo",
    });
  });
});
