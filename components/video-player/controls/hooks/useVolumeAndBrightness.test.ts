import { act, renderHook } from "@testing-library/react-native";

/** Holds on the system volume indicator taken and not released yet. */
let mockHolds = 0;
const mockVolume = {
  getSystemVolume: jest.fn(() => 0.3),
  getSystemVolumeAsync: jest.fn(async () => 0.3),
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
jest.mock("expo-brightness", () => ({
  getBrightnessAsync: jest.fn(async () => 0.5),
  setBrightnessAsync: jest.fn(async () => {}),
}));

// Required here rather than imported: an import runs before `mockVolume`
// exists.
const { useVolumeAndBrightness } =
  require("./useVolumeAndBrightness") as typeof import("./useVolumeAndBrightness");

beforeEach(() => {
  jest.clearAllMocks();
  mockHolds = 0;
});

describe("useVolumeAndBrightness volume drag", () => {
  // Picture in picture unmounts the controls mid-gesture, so the drag never
  // ends. A hold left behind kept the system indicator away, and on Android
  // the volume keys taken, for the life of the app.
  test("releases the indicator hold when it unmounts mid-gesture", async () => {
    const { result, unmount } = await renderHook(() =>
      useVolumeAndBrightness(),
    );

    await act(() => result.current.startVolumeDrag(100));
    expect(mockHolds).toBe(1);

    await unmount();
    expect(mockHolds).toBe(0);
  });

  // GestureOverlay starts the drag on the next frame, which can come after
  // the controls are gone.
  test("takes no hold for a drag that starts after it unmounted", async () => {
    const { result, unmount } = await renderHook(() =>
      useVolumeAndBrightness(),
    );
    const { startVolumeDrag } = result.current;

    await unmount();
    await act(() => startVolumeDrag(100));

    expect(mockVolume.hideSystemVolumeIndicator).not.toHaveBeenCalled();
    expect(mockHolds).toBe(0);
  });

  // The synchronous read is a round trip to the audio server on iOS, which
  // can hold the JS thread for seconds at the start of the gesture.
  test("reads the starting volume off the JS thread", async () => {
    const onVolumeChange = jest.fn();
    const { result } = await renderHook(() =>
      useVolumeAndBrightness({ onVolumeChange }),
    );

    await act(() => result.current.startVolumeDrag(100));
    await act(() => result.current.updateVolumeDrag(-50));

    expect(mockVolume.getSystemVolume).not.toHaveBeenCalled();
    expect(mockVolume.getSystemVolumeAsync).toHaveBeenCalledTimes(1);
    expect(mockVolume.setSystemVolume).toHaveBeenLastCalledWith(0.6);
    expect(onVolumeChange).toHaveBeenLastCalledWith(60);
  });

  test("does not pick a drag back up when the read lands after it ended", async () => {
    let resolveRead: (volume: number) => void = () => {};
    mockVolume.getSystemVolumeAsync.mockImplementationOnce(
      () => new Promise<number>((resolve) => (resolveRead = resolve)),
    );
    const { result } = await renderHook(() => useVolumeAndBrightness());

    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.startVolumeDrag(100);
    });
    act(() => result.current.endVolumeDrag());
    await act(async () => {
      resolveRead(0.3);
      await started;
    });
    await act(() => result.current.updateVolumeDrag(-50));

    expect(mockVolume.setSystemVolume).not.toHaveBeenCalled();
  });
});
