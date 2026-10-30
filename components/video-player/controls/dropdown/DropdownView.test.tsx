import { render } from "@testing-library/react-native";
import type { OptionGroup } from "@/components/PlatformDropdown";
import DropdownView from "./DropdownView";

let mockParams: Record<string, string> = {};
let mockOffline = false;
let mockGroups: OptionGroup[] = [];

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({ groups }: { groups: OptionGroup[] }) => {
    mockGroups = groups;
    return null;
  },
}));
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("react-native-awesome-slider", () => ({ Slider: () => null }));
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetBackdrop: () => null,
  BottomSheetModal: () => null,
}));
jest.mock("../contexts/VideoContext", () => ({
  useVideoContext: () => ({
    subtitleTracks: [
      { name: "Disable", index: -1 },
      { name: "English", index: 2 },
    ],
    audioTracks: [{ name: "AAC", index: 1 }],
  }),
}));
jest.mock("../contexts/PlayerContext", () => ({
  usePlayerContext: () => ({
    item: { Id: "item-1" },
    mediaSource: { Id: "source-1" },
    downloadedItem: {
      userData: { audioStreamIndex: 1, subtitleStreamIndex: 2 },
    },
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ replace: jest.fn() }),
}));
// The real settings atom loads the screens that edit it.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { subtitleSize: 1 }, pluginSettings: {} }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const checked = (title: string) =>
  mockGroups
    .find((g) => g.title === title)
    ?.options.filter((o) => "selected" in o && o.selected)
    .map((o) => o.label);

beforeEach(() => {
  mockGroups = [];
});

// A download opens with blank track params, so the menu checked no audio row
// and no subtitle row, not even "Disable", while the player played the
// downloaded tracks.
test("checks the tracks a download was made with", async () => {
  mockOffline = true;
  mockParams = { itemId: "item-1", audioIndex: "", subtitleIndex: "" };
  await render(<DropdownView />);

  expect(checked("player.menu.audio")).toEqual(["AAC"]);
  expect(checked("player.menu.subtitles")).toEqual(["English"]);
});

test("checks the tracks the route asks for", async () => {
  mockOffline = false;
  mockParams = { itemId: "item-1", audioIndex: "1", subtitleIndex: "-1" };
  await render(<DropdownView />);

  expect(checked("player.menu.audio")).toEqual(["AAC"]);
  expect(checked("player.menu.subtitles")).toEqual(["Disable"]);
});
