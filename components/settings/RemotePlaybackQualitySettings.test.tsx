import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  NO_REMOTE_QUALITY,
  type RemotePlaybackQuality,
} from "@/utils/cast/remoteQuality";
import { RemotePlaybackQualitySettings } from "./RemotePlaybackQualitySettings";

const mockUpdateSettings = jest.fn();
let mockQuality: RemotePlaybackQuality = NO_REMOTE_QUALITY;

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { remotePlaybackQuality: mockQuality },
    updateSettings: mockUpdateSettings,
  }),
}));
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
      groups: {
        options: { label: string; selected?: boolean; onPress: () => void }[];
      }[];
    }) => (
      <View>
        {trigger}
        {groups
          .flatMap((group) => group.options)
          .map((option) => (
            <TouchableOpacity
              key={option.label}
              accessibilityLabel={`${title} / ${option.label}${option.selected ? " (selected)" : ""}`}
              onPress={option.onPress}
            >
              <Text>{option.label}</Text>
            </TouchableOpacity>
          ))}
      </View>
    ),
  };
});

const salon = { id: "device-a", name: "Salon", kind: "cast" as const };
const bedroom = { id: "device-b", name: "Bedroom", kind: "cast" as const };

beforeEach(() => {
  mockQuality = { ...NO_REMOTE_QUALITY, known: [salon, bedroom] };
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
  mockQuality = { ...mockQuality, byTarget: { "device-b": "1 Mb/s" } };
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
