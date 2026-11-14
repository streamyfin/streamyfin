import { render, screen } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";

// The knobs this group renders steer mpv's demuxer cache; the gate under test
// hides the whole group when ExoPlayer is the engine.
let mockSettings: Record<string, unknown> | undefined;
jest.mock("@/utils/atoms/settings", () => ({
  ...jest.requireActual("@/utils/atoms/settings"),
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: () => undefined,
  }),
}));
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: (key: string) => key }),
}));
// PlatformDropdown drags in @gorhom/bottom-sheet → reanimated → native
// worklets, which has no jest surface. The dropdown's open behavior isn't
// what this spec tests: rendering the trigger inline is faithful to it.
jest.mock("@/components/PlatformDropdown", () => ({
  PlatformDropdown: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/atoms/api", () => ({
  apiAtom: jest.requireActual("jotai").atom(null),
  userAtom: jest.requireActual("jotai").atom(null),
}));
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  logAndCaptureError: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: jest.requireActual("jotai").atom([]),
}));

// Android TV: the only platform where ExoPlayer can be the engine, so the
// only place the gate can actually fire.
stubReactNative({ OS: "android", isTV: true });

// Required after the platform is set, not imported: the settings module
// reads Platform once, when the module is evaluated.
const { VideoPlayer } =
  require("@/utils/atoms/settings") as typeof import("@/utils/atoms/settings");
const { MpvBufferSettings } =
  require("./MpvBufferSettings") as typeof import("./MpvBufferSettings");

describe("MpvBufferSettings", () => {
  afterEach(() => {
    mockSettings = undefined;
  });

  test("renders the buffer group for the mpv engine", async () => {
    mockSettings = {};
    await render(<MpvBufferSettings />);
    expect(screen.getByText("home.settings.buffer.title")).toBeTruthy();
  });

  test("renders nothing when ExoPlayer is the engine", async () => {
    mockSettings = { videoPlayer: VideoPlayer.ExoPlayer };
    await render(<MpvBufferSettings />);
    expect(screen.queryByText("home.settings.buffer.title")).toBeNull();
  });
});
