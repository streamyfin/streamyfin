import { act, renderHook } from "@testing-library/react-native";

/** Holds on the system volume indicator taken and not released yet. */
let mockHolds = 0;
const mockVolume = {
  addSystemVolumeListener: jest.fn(() => ({ remove: jest.fn() })),
  getSystemVolume: jest.fn(() => 0.4),
  getSystemVolumeAsync: jest.fn(async () => 0.4),
  setSystemVolume: jest.fn(),
  hideSystemVolumeIndicator: jest.fn(() => {
    mockHolds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      mockHolds -= 1;
    };
  }),
};
jest.mock("@/modules/system-volume", () => mockVolume);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);

// Required here rather than imported: an import runs before `mockVolume`
// exists.
const { useNowPlayingVolume } =
  require("./useNowPlayingVolume") as typeof import("./useNowPlayingVolume");

beforeEach(() => {
  jest.clearAllMocks();
  mockHolds = 0;
});

describe("useNowPlayingVolume", () => {
  test("keeps the system indicator away while the phone plays", async () => {
    await renderHook(() => useNowPlayingVolume(false));

    expect(mockHolds).toBe(1);
  });

  // On Android a hold takes the volume keys, which then move the phone's
  // volume. While the queue plays on a Chromecast they must reach the system,
  // which hands them to the Cast session.
  test("takes no hold while a Cast session is connected", async () => {
    await renderHook(() => useNowPlayingVolume(true));

    expect(mockVolume.hideSystemVolumeIndicator).not.toHaveBeenCalled();
  });

  test("lets the hold go when a Cast session connects, and takes it back after", async () => {
    const { rerender } = await renderHook(
      ({ casting }: { casting: boolean }) => useNowPlayingVolume(casting),
      { initialProps: { casting: false } },
    );
    expect(mockHolds).toBe(1);

    await rerender({ casting: true });
    expect(mockHolds).toBe(0);

    await rerender({ casting: false });
    expect(mockHolds).toBe(1);
  });

  test("releases the hold when the screen goes", async () => {
    const { unmount } = await renderHook(() => useNowPlayingVolume(false));

    await unmount();
    expect(mockHolds).toBe(0);
  });

  // The synchronous read is a round trip to the audio server on iOS, which
  // can hold the JS thread for seconds as the screen opens.
  test("reads the volume off the JS thread", async () => {
    const { result } = await renderHook(() => useNowPlayingVolume(false));
    await act(async () => {});

    expect(mockVolume.getSystemVolume).not.toHaveBeenCalled();
    expect(result.current.volume.value).toBe(0.4);
  });

  test("does not let a late read overwrite a change the listener reported", async () => {
    let resolveRead: (volume: number) => void = () => {};
    mockVolume.getSystemVolumeAsync.mockImplementationOnce(
      () => new Promise<number>((resolve) => (resolveRead = resolve)),
    );
    const { result } = await renderHook(() => useNowPlayingVolume(false));
    const [[listener]] = mockVolume.addSystemVolumeListener.mock
      .calls as unknown as [[(event: { volume: number }) => void]];

    act(() => listener({ volume: 0.7 }));
    await act(async () => resolveRead(0.4));

    expect(result.current.volume.value).toBe(0.7);
  });
});
