import { act, renderHook } from "@testing-library/react-native";
import { useAutoBitrateMeasure } from "./useAutoBitrateMeasure";

const mockApi = { basePath: "https://jellyfin.example.com" };
let mockLast: { bitrate?: number; at?: number; failure?: string } = {};
const mockListeners = new Set<() => void>();

jest.mock("@/providers/JellyfinProvider", () => ({ apiAtom: {} }));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useAtomValue: () => mockApi,
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  ensureNetworkKnown: async () => undefined,
  detectBitrate: async () => 0,
  lastDetection: () => mockLast,
  onDetectionChanged: (listener: () => void) => {
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  },
}));

/** A detection kept by someone else, a cast or a playback. */
const detectedElsewhere = (bitrate: number) =>
  act(() => {
    mockLast = { bitrate, at: Date.now() };
    for (const listener of mockListeners) listener();
  });

beforeEach(() => {
  mockLast = {};
  mockListeners.clear();
});

describe("useAutoBitrateMeasure", () => {
  // The settings kept the measure they read when they opened: one a cast made meanwhile showed only once they were
  // opened again (iPhone, 15/11).
  test("shows a measure made elsewhere while it is mounted", async () => {
    const { result } = await renderHook(() => useAutoBitrateMeasure());
    await act(async () => {});
    expect(result.current.last).toEqual({});

    await detectedElsewhere(57_100_000);

    expect(result.current.last.bitrate).toBe(57_100_000);
  });

  test("stops listening once unmounted", async () => {
    const { unmount } = await renderHook(() => useAutoBitrateMeasure());
    await act(async () => {});

    await unmount();

    expect(mockListeners.size).toBe(0);
  });
});
