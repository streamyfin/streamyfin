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
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: {
      autoBitrateRatio: 0.7,
      autoBitrateTtlMinutes: 60,
      autoBitrateInNetworkMin: 140_000_000,
      autoBitrateAdapt: true,
    },
    updateSettings: mockUpdateSettings,
  }),
}));
// A row is its label and its value, and opens what it opens when pressed.
jest.mock("@/components/tv", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    TVSettingsOptionButton: ({
      label,
      value,
      onPress,
    }: {
      label: string;
      value: string;
      onPress: () => void;
    }) => <Text onPress={onPress}>{`${label}: ${value}`}</Text>,
    TVSettingsToggle: ({
      label,
      value,
      onToggle,
    }: {
      label: string;
      value: boolean;
      onToggle: (value: boolean) => void;
    }) => (
      <Text onPress={() => onToggle(!value)}>
        {`${label}: ${value ? "on" : "off"}`}
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
  mockUpdateSettings.mockClear();
  mockShowOptions.mockClear();
  mockMeasure.mockClear();
});

describe("the Auto quality settings on TV", () => {
  test("turn off adapting Auto during playback", async () => {
    await render(<TVAutoQualitySettings />);

    fireEvent.press(screen.getByText("home.settings.quality.adapt: on"));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateAdapt: false,
    });
  });

  test("show each setting with what it is set to", async () => {
    await render(<TVAutoQualitySettings />);

    expect(screen.getByText("home.settings.quality.share: 70%")).toBeTruthy();
    expect(
      screen.getByText(
        "home.settings.quality.remeasure_after: home.settings.security.inactivity_timeout.1_hour",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("home.settings.quality.in_network_min: 140 Mb/s"),
    ).toBeTruthy();
    expect(
      screen.getByText("home.settings.quality.measure_now: 36.4 Mb/s"),
    ).toBeTruthy();
  });

  test("offer the shares, the one set marked, and save the one picked", async () => {
    await render(<TVAutoQualitySettings />);

    fireEvent.press(screen.getByText("home.settings.quality.share: 70%"));

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

    fireEvent.press(
      screen.getByText(
        "home.settings.quality.remeasure_after: home.settings.security.inactivity_timeout.1_hour",
      ),
    );
    opened().onSelect(240);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateTtlMinutes: 240,
    });
  });

  test("save the floor in the server's network", async () => {
    await render(<TVAutoQualitySettings />);

    fireEvent.press(
      screen.getByText("home.settings.quality.in_network_min: 140 Mb/s"),
    );
    opened().onSelect(0);

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateInNetworkMin: 0,
    });
  });

  test("measure the server on demand", async () => {
    await render(<TVAutoQualitySettings />);

    fireEvent.press(
      screen.getByText("home.settings.quality.measure_now: 36.4 Mb/s"),
    );

    await waitFor(() => expect(mockMeasure).toHaveBeenCalled());
  });
});
