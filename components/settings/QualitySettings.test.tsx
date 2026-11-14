import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { OptionGroup } from "@/components/PlatformDropdown";
import { QualitySettings } from "./QualitySettings";

const mockUpdateSettings = jest.fn();
const mockDetectBitrate = jest.fn();
const mockLast: { bitrate?: number; at?: number; failure?: string } = {};
let mockNetworkKnown = true;

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { cause?: string }) =>
      values?.cause ? `${key}: ${values.cause}` : key,
    i18n: { language: "en" },
  }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi } = jest.requireActual("@/test-utils/jellyfinApi");
  return { apiAtom: atom(makeApi()) };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: {
      defaultBitrate: { key: "Max", value: undefined },
      autoBitrateRatio: 0.7,
      autoBitrateTtlMinutes: 60,
      autoBitrateInNetworkMin: 140_000_000,
    },
    updateSettings: mockUpdateSettings,
    pluginSettings: undefined,
  }),
}));
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: (...args: unknown[]) => mockDetectBitrate(...args),
  lastDetection: () => (mockNetworkKnown ? mockLast : {}),
  ensureNetworkKnown: async () => {
    mockNetworkKnown = true;
  },
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
      title: string;
    }) => (
      <View testID={`dropdown-${title}`}>
        {groups.flatMap((group) =>
          group.options.map((option) =>
            option.type === "radio" ? (
              <Text key={String(option.value)} onPress={option.onPress}>
                {`${option.label}${option.selected ? " (selected)" : ""}`}
              </Text>
            ) : null,
          ),
        )}
      </View>
    ),
  };
});

const choicesOf = (title: string) =>
  within(screen.getByTestId(`dropdown-${title}`))
    .getAllByText(/.*/)
    .map((choice) => choice.props.children);

beforeEach(() => {
  mockNetworkKnown = true;
  mockUpdateSettings.mockClear();
  mockDetectBitrate.mockReset();
  for (const key of Object.keys(mockLast)) {
    delete mockLast[key as keyof typeof mockLast];
  }
});

describe("the Auto settings of the quality group", () => {
  test("offer the shares of the measured speed, the one set marked", async () => {
    await render(<QualitySettings />);

    expect(choicesOf("home.settings.quality.share")).toEqual([
      "50%",
      "60%",
      "70% (selected)",
      "80%",
      "90%",
    ]);
    fireEvent.press(screen.getByText("50%"));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ autoBitrateRatio: 0.5 });
  });

  test("offer how long a measure is used", async () => {
    await render(<QualitySettings />);

    expect(choicesOf("home.settings.quality.remeasure_after")).toEqual([
      "home.settings.security.inactivity_timeout.15_minutes",
      "home.settings.security.inactivity_timeout.30_minutes",
      "home.settings.security.inactivity_timeout.1_hour (selected)",
      "home.settings.security.inactivity_timeout.4_hours",
      "home.settings.security.inactivity_timeout.24_hours",
    ]);
    fireEvent.press(
      screen.getByText("home.settings.security.inactivity_timeout.15_minutes"),
    );
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateTtlMinutes: 15,
    });
  });

  test("offer the floors in the server's network, none among them", async () => {
    await render(<QualitySettings />);

    expect(choicesOf("home.settings.quality.in_network_min")).toEqual([
      "home.settings.quality.in_network_min_none",
      "40 Mb/s",
      "80 Mb/s",
      "140 Mb/s (selected)",
      "200 Mb/s",
    ]);
    fireEvent.press(
      screen.getByText("home.settings.quality.in_network_min_none"),
    );
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoBitrateInNetworkMin: 0,
    });
  });

  test("say when nothing was measured yet", async () => {
    await render(<QualitySettings />);

    expect(
      screen.getByText("home.settings.quality.last_measure_none"),
    ).toBeTruthy();
  });

  // The measure the settings show is the server's, with the options set.
  test("measure the server again on demand, and show what it gives", async () => {
    mockDetectBitrate.mockImplementation(async () => {
      mockLast.bitrate = 36_400_000;
      mockLast.at = Date.now();
      return 36_400_000;
    });
    await render(<QualitySettings />);

    fireEvent.press(screen.getByText("home.settings.quality.measure_now"));

    await waitFor(() => expect(screen.getByText("36.4 Mb/s")).toBeTruthy());
    expect(mockDetectBitrate).toHaveBeenCalledWith(expect.anything(), true, {
      ratio: 0.7,
      ttlMs: 60 * 60_000,
      inNetworkMinBitrate: 140_000_000,
    });
  });

  // Kept from an earlier launch, it is the network's: it shows once NetInfo
  // has said which network the device is on.
  test("show the measure kept for the network once it is known", async () => {
    mockNetworkKnown = false;
    mockLast.bitrate = 46_500_000;
    await render(<QualitySettings />);

    await waitFor(() => expect(screen.getByText("46.5 Mb/s")).toBeTruthy());
  });

  test("say why the last measure failed", async () => {
    mockLast.failure = "The bitrate test answered 403";
    await render(<QualitySettings />);

    expect(
      screen.getByText(
        "home.settings.quality.last_measure_failed: The bitrate test answered 403",
      ),
    ).toBeTruthy();
  });
});

// Moved out of the "Other" group: everything that decides the bitrate is in
// one place, as on TV.
describe("the default quality setting", () => {
  test("offers Auto first, under its name in the app language", async () => {
    await render(<QualitySettings />);

    expect(choicesOf("home.settings.other.default_quality")).toEqual([
      "item_card.quality_auto",
      "Max (selected)",
      "8 Mb/s",
      "4 Mb/s",
      "2 Mb/s",
      "1 Mb/s",
      "500 Kb/s",
      "250 Kb/s",
    ]);
  });

  test("stores Auto when it is picked", async () => {
    await render(<QualitySettings />);

    fireEvent.press(screen.getByText("item_card.quality_auto"));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      defaultBitrate: { key: "Auto", value: undefined },
    });
  });

  test("comes first in the group", async () => {
    await render(<QualitySettings />);

    const titles = screen
      .getAllByTestId(/^dropdown-/)
      .map((dropdown) => dropdown.props.testID);
    expect(titles[0]).toBe("dropdown-home.settings.other.default_quality");
  });
});
