import { renderHook, waitFor } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import { useOrientation } from "./useOrientation";

const mockGetOrientationAsync = jest.fn();

jest.mock("@/packages/expo-screen-orientation", () => {
  const actual = jest.requireActual("expo-screen-orientation");
  return {
    Orientation: actual.Orientation,
    OrientationLock: actual.OrientationLock,
    getOrientationAsync: () => mockGetOrientationAsync(),
    addOrientationChangeListener: () => ({ remove: () => {} }),
    lockAsync: async () => {},
    unlockAsync: async () => {},
  };
});

const { Orientation, OrientationLock } = jest.requireActual(
  "expo-screen-orientation",
);

const PORTRAIT_WINDOW = { width: 440, height: 956, scale: 3, fontScale: 1 };
const LANDSCAPE_WINDOW = { width: 956, height: 440, scale: 3, fontScale: 1 };

describe("useOrientation", () => {
  let windowSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGetOrientationAsync.mockReset();
    windowSpy = jest.spyOn(Dimensions, "get");
  });

  afterEach(() => {
    windowSpy.mockRestore();
  });

  // The native module has no orientation to report until it has seen one, and
  // a simulator that is never rotated stays there. Treating that as landscape
  // gave the movie page its short landscape header on an upright phone.
  test("reads an unknown orientation from the shape of the window", async () => {
    windowSpy.mockReturnValue(PORTRAIT_WINDOW);
    mockGetOrientationAsync.mockResolvedValue(Orientation.UNKNOWN);

    const { result } = await renderHook(() => useOrientation());
    await waitFor(() => expect(mockGetOrientationAsync).toHaveBeenCalled());

    expect(result.current.orientation).toBe(OrientationLock.PORTRAIT_UP);
  });

  test("still reads an unknown orientation as landscape in a wide window", async () => {
    windowSpy.mockReturnValue(LANDSCAPE_WINDOW);
    mockGetOrientationAsync.mockResolvedValue(Orientation.UNKNOWN);

    const { result } = await renderHook(() => useOrientation());
    await waitFor(() => expect(mockGetOrientationAsync).toHaveBeenCalled());

    expect(result.current.orientation).toBe(OrientationLock.LANDSCAPE);
  });

  // The answer arrives a render after mount: a page that sizes itself by the
  // orientation should not open in the wrong layout while it waits.
  test("starts from the shape of the window, before the module answers", async () => {
    windowSpy.mockReturnValue(PORTRAIT_WINDOW);
    mockGetOrientationAsync.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => useOrientation());

    expect(result.current.orientation).toBe(OrientationLock.PORTRAIT_UP);
  });

  test("keeps the orientation the module reports", async () => {
    windowSpy.mockReturnValue(PORTRAIT_WINDOW);
    mockGetOrientationAsync.mockResolvedValue(Orientation.LANDSCAPE_LEFT);

    const { result } = await renderHook(() => useOrientation());

    await waitFor(() =>
      expect(result.current.orientation).toBe(OrientationLock.LANDSCAPE_LEFT),
    );
  });
});
