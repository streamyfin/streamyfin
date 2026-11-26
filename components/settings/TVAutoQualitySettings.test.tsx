import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { TVAutoQualitySettings } from "./TVAutoQualitySettings";

const mockUpdateSettings = jest.fn();
const mockShowOptions = jest.fn();
const mockMeasure = jest.fn(async () => {});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));
jest.mock("@/hooks/useTVOptionModal", () => ({
  useTVOptionModal: () => ({ showOptions: mockShowOptions }),
}));
jest.mock("@/hooks/useAutoBitrateMeasure", () => ({
  useAutoBitrateMeasure: () => ({
    last: { bitrate: 36_400_000 },
    measuring: false,
    measure: mockMeasure,
  }),
}));
let mockPluginSettings: Record<string, { locked: boolean }> | undefined;
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: {
      autoBitrateRatio: 0.7,
      autoBitrateTtlMinutes: 60,
      autoBitrateInNetworkMin: 140_000_000,
      autoBitrateAdapt: true,
    },
    updateSettings: mockUpdateSettings,
    pluginSettings: mockPluginSettings,
  }),
}));
// The real option row's font sizes and focus timer reach a setting and a
// provider this spec has no part in.
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ body: 20, callout: 16 }),
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
// The option rows render for real, so a locked one is pressed as the remote
// would: its lock is the button's, not this spec's. The toggle is its label and
// its state, and flips when pressed.
jest.mock("@/components/tv", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    TVSettingsOptionButton: jest.requireActual(
      "@/components/tv/settings/TVSettingsOptionButton",
    ).TVSettingsOptionButton,
    TVSettingsToggle: ({
      label,
      value,
      onToggle,
      disabledByAdmin,
    }: {
      label: string;
      value: boolean;
      onToggle: (value: boolean) => void;
      disabledByAdmin?: boolean;
    }) => (
      <Text onPress={() => onToggle(!value)}>
        {`${label}: ${value ? "on" : "off"}${disabledByAdmin ? " (locked)" : ""}`}
      </Text>
    ),
  };
});

type Options = {
  title: string;
  options: { label: string; value: number; selected: boolean }[];
  onSelect: (value: number) => void;
};
const opened = () => mockShowOptions.mock.calls.at(-1)?.[0] as Options;

beforeEach(() => {
  mockPluginSettings = undefined;
  mockUpdateSettings.mockClear();
  mockShowOptions.mockClear();
  mockMeasure.mockClear();
});

describe("the Auto quality settings on TV", () => {
  test("show the admin's lock on adapting Auto during playback", async () => {
    mockPluginSettings = { autoBitrateAdapt: { locked: true } };
    await render(<TVAutoQualitySettings />);

    expect(
      screen.getByText("home.settings.quality.adapt: on (locked)"),
    ).toBeTruthy();
  });

  const lists = [
    ["autoBitrateRatio", "home.settings.quality.share"],
    ["autoBitrateTtlMinutes", "home.settings.quality.remeasure_after"],
    ["autoBitrateInNetworkMin", "home.settings.quality.in_network_min"],
  ] as const;

  test.each(lists)(
    "say %s is locked and keep it closed, the others open",
    async (key, label) => {
      mockPluginSettings = { [key]: { locked: true } };
      await render(<TVAutoQualitySettings />);

      expect(
        screen.getAllByText("home.settings.disabled_by_admin"),
      ).toHaveLength(1);
      await fireEvent.press(screen.getByText(label));
      expect(mockShowOptions).not.toHaveBeenCalled();

      for (const [, other] of lists.filter(([, list]) => list !== label)) {
        await fireEvent.press(screen.getByText(other));
      }
      expect(mockShowOptions).toHaveBeenCalledTimes(2);
    },
  );

  test("turn off adapting Auto during playback", async () => {
    await render(<TVAutoQualitySettings />);

    fireEvent.press(screen.getByText("home.settings.quality.adapt: on"));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateAdapt: false,
    });
  });

  test("show each setting with what it is set to", async () => {
    await render(<TVAutoQualitySettings />);

    for (const shown of [
      "home.settings.quality.share",
      "70%",
      "home.settings.quality.remeasure_after",
      "home.settings.security.inactivity_timeout.1_hour",
      "home.settings.quality.in_network_min",
      "140 Mb/s",
      "home.settings.quality.measure_now",
      "36.4 Mb/s",
    ]) {
      expect(screen.getByText(shown)).toBeTruthy();
    }
  });

  test("offer the shares, the one set marked, and save the one picked", async () => {
    await render(<TVAutoQualitySettings />);

    await fireEvent.press(screen.getByText("home.settings.quality.share"));

    expect(opened().options.map((option) => option.label)).toEqual([
      "50%",
      "60%",
      "70%",
      "80%",
      "90%",
    ]);
    expect(opened().options.find((option) => option.selected)?.value).toBe(0.7);
    opened().onSelect(0.5);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ autoBitrateRatio: 0.5 });
  });

  test("save how long a measure is used", async () => {
    await render(<TVAutoQualitySettings />);

    await fireEvent.press(
      screen.getByText("home.settings.quality.remeasure_after"),
    );
    opened().onSelect(240);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateTtlMinutes: 240,
    });
  });

  test("save the floor in the server's network", async () => {
    await render(<TVAutoQualitySettings />);

    await fireEvent.press(
      screen.getByText("home.settings.quality.in_network_min"),
    );
    opened().onSelect(0);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateInNetworkMin: 0,
    });
  });

  test("measure the server on demand", async () => {
    await render(<TVAutoQualitySettings />);

    await fireEvent.press(
      screen.getByText("home.settings.quality.measure_now"),
    );

    await waitFor(() => expect(mockMeasure).toHaveBeenCalled());
  });
});
