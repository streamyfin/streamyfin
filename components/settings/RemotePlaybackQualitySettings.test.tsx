import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { settingsAtom } from "@/utils/atoms/settings";
import {
  forgetTarget,
  NO_REMOTE_QUALITY,
  type RemotePlaybackQuality,
  setKindQuality,
  setTargetQuality,
} from "@/utils/cast/remoteQuality";
import { RemotePlaybackQualitySettings } from "./RemotePlaybackQualitySettings";

type Option = { label: string; selected?: boolean; onPress: () => void };

const mockUpdateSettings = jest.fn();
let mockQuality: RemotePlaybackQuality = NO_REMOTE_QUALITY;
// The options each dropdown rendered first, as the Android sheet keeps the ones it opened with.
let mockSheets: Record<string, Option[]> = {};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/utils/atoms/settings", () => {
  const { atom, useAtomValue } = jest.requireActual("jotai");
  const settingsAtom = atom(null);
  return {
    settingsAtom,
    useSettings: () => ({
      settings: useAtomValue(settingsAtom),
      updateSettings: mockUpdateSettings,
    }),
  };
});
// Each option a pressable row named after its dropdown, so a test picks one.
jest.mock("@/components/PlatformDropdown", () => {
  const { Text, TouchableOpacity, View } = jest.requireActual("react-native");
  return {
    PlatformDropdown: ({
      title,
      trigger,
      groups,
    }: {
      title: string;
      trigger: React.ReactNode;
      groups: { options: Option[] }[];
    }) => {
      const options = groups.flatMap((group) => group.options);
      mockSheets[title] ??= options;
      return (
        <View>
          {trigger}
          {options.map((option) => (
            <TouchableOpacity
              key={option.label}
              accessibilityLabel={`${title} / ${option.label}${option.selected ? " (selected)" : ""}`}
              onPress={option.onPress}
            >
              <Text>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    },
  };
});

const salon = { id: "device-a", name: "Salon", kind: "cast" as const };
const bedroom = { id: "device-b", name: "Bedroom", kind: "cast" as const };
const kitchen = { id: "device-c", name: "Kitchen", kind: "cast" as const };

const store = getDefaultStore();
const stored = (quality: RemotePlaybackQuality) => {
  mockQuality = quality;
  store.set(settingsAtom as never, { remotePlaybackQuality: quality } as never);
};

beforeEach(() => {
  stored({ ...NO_REMOTE_QUALITY, known: [salon, bedroom] });
  mockSheets = {};
  mockUpdateSettings.mockClear();
});

test("lists Chromecast, then each receiver the app connected to", async () => {
  await render(<RemotePlaybackQualitySettings />);
  expect(screen.getByText("home.settings.remote_quality.title")).toBeTruthy();
  expect(
    screen.getByLabelText(
      "home.settings.remote_quality.chromecast / Max (selected)",
    ),
  ).toBeTruthy();
  // A receiver follows Chromecast until it is given its own quality.
  expect(
    screen.getByLabelText(
      "Salon / home.settings.remote_quality.same_as_chromecast (selected)",
    ),
  ).toBeTruthy();
  expect(screen.getAllByText("Bedroom").length).toBeGreaterThan(0);
});

test("a quality for Chromecast caps every receiver of that kind", async () => {
  await render(<RemotePlaybackQualitySettings />);
  await act(async () =>
    fireEvent.press(
      screen.getByLabelText("home.settings.remote_quality.chromecast / 4 Mb/s"),
    ),
  );
  expect(mockUpdateSettings).toHaveBeenCalledWith({
    remotePlaybackQuality: { ...mockQuality, byKind: { cast: "4 Mb/s" } },
  });
});

test("a receiver takes its own quality, and goes back to Chromecast's", async () => {
  stored({ ...mockQuality, byTarget: { "device-b": "1 Mb/s" } });
  await render(<RemotePlaybackQualitySettings />);
  await act(async () =>
    fireEvent.press(screen.getByLabelText("Salon / 2 Mb/s")),
  );
  expect(mockUpdateSettings).toHaveBeenLastCalledWith({
    remotePlaybackQuality: {
      ...mockQuality,
      byTarget: { "device-b": "1 Mb/s", "device-a": "2 Mb/s" },
    },
  });
  await act(async () =>
    fireEvent.press(
      screen.getByLabelText(
        "Bedroom / home.settings.remote_quality.same_as_chromecast",
      ),
    ),
  );
  expect(mockUpdateSettings).toHaveBeenLastCalledWith({
    remotePlaybackQuality: { ...mockQuality, byTarget: {} },
  });
});

test("a receiver can be forgotten", async () => {
  await render(<RemotePlaybackQualitySettings />);
  await act(async () =>
    fireEvent.press(
      screen.getByLabelText("Salon / home.settings.remote_quality.forget"),
    ),
  );
  expect(mockUpdateSettings).toHaveBeenCalledWith({
    remotePlaybackQuality: { ...mockQuality, known: [bedroom] },
  });
});

// A receiver connected while a sheet is open is remembered under it; the choice made in that sheet must not
// write back the list it opened with.
test.each([
  [
    "home.settings.remote_quality.chromecast",
    "4 Mb/s",
    (quality: RemotePlaybackQuality) =>
      setKindQuality(quality, "cast", "4 Mb/s"),
  ],
  [
    "Salon",
    "2 Mb/s",
    (quality: RemotePlaybackQuality) =>
      setTargetQuality(quality, "device-a", "2 Mb/s"),
  ],
  [
    "Salon",
    "home.settings.remote_quality.forget",
    (quality: RemotePlaybackQuality) => forgetTarget(quality, "device-a"),
  ],
])(
  "%s / %s, chosen in a sheet opened before a connection, keeps the receiver remembered since",
  async (sheet, label, expected) => {
    await render(<RemotePlaybackQualitySettings />);
    const remembered = { ...mockQuality, known: [kitchen, salon, bedroom] };
    await act(async () => stored(remembered));

    await act(async () =>
      mockSheets[sheet].find((option) => option.label === label)?.onPress(),
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      remotePlaybackQuality: expected(remembered),
    });
  },
);
