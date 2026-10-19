import { renderHook } from "@testing-library/react-native";

// Pins patches/react-native-google-cast@4.9.1.patch. The library's hooks ask
// the native side for the current state without a rejection handler; on
// Android that call rejects with IllegalStateException("No session") when the
// session ended in the meantime, and every such rejection reached Sentry as
// an unhandled one (REACT-NATIVE-3S, upstream issue #580).

const mockClient = {
  getMediaStatus: jest.fn(),
  getStreamPosition: jest.fn(),
  onMediaStatusUpdated: jest.fn(() => ({ remove: jest.fn() })),
  onMediaProgressUpdated: jest.fn(() => ({ remove: jest.fn() })),
};
const mockSession = { getCastDevice: jest.fn() };

// Metro bundles the sources (the package's "react-native" entry), Jest and
// Node load lib/commonjs: the patch covers both, and so does this spec.
for (const build of ["src", "lib/commonjs"]) {
  jest.mock(
    `react-native-google-cast/${build}/api/useRemoteMediaClient`,
    () => ({ __esModule: true, default: () => mockClient }),
  );
  jest.mock(`react-native-google-cast/${build}/api/useCastSession`, () => ({
    __esModule: true,
    default: () => mockSession,
  }));
}

const noSession = () =>
  Promise.reject(new Error("java.lang.IllegalStateException: No session"));

// Lets every pending rejection settle, so Node reports the unhandled ones.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe.each(["src", "lib/commonjs"])(
  "react-native-google-cast %s",
  (build) => {
    const unhandled = jest.fn();

    beforeAll(() => process.on("unhandledRejection", unhandled));
    afterAll(() => process.off("unhandledRejection", unhandled));
    beforeEach(() => {
      unhandled.mockReset();
      jest.clearAllMocks();
    });

    it("useMediaStatus answers null when the session is gone", async () => {
      const useMediaStatus = require(
        `react-native-google-cast/${build}/api/useMediaStatus`,
      ).default;
      mockClient.getMediaStatus.mockImplementation(noSession);

      const { result } = await renderHook(() => useMediaStatus());
      await settle();

      expect(mockClient.getMediaStatus).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("useStreamPosition answers null when the session is gone", async () => {
      const useStreamPosition = require(
        `react-native-google-cast/${build}/api/useStreamPosition`,
      ).default;
      mockClient.getStreamPosition.mockImplementation(noSession);

      const { result } = await renderHook(() => useStreamPosition());
      await settle();

      expect(mockClient.getStreamPosition).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("useCastDevice answers null when the session is gone", async () => {
      const useCastDevice = require(
        `react-native-google-cast/${build}/api/useCastDevice`,
      ).default;
      mockSession.getCastDevice.mockImplementation(noSession);

      const { result } = await renderHook(() => useCastDevice());
      await settle();

      expect(mockSession.getCastDevice).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("still passes on what the native side answers", async () => {
      const useMediaStatus = require(
        `react-native-google-cast/${build}/api/useMediaStatus`,
      ).default;
      const status = { playerState: "playing" };
      mockClient.getMediaStatus.mockResolvedValue(status);

      const { result } = await renderHook(() => useMediaStatus());
      await settle();

      expect(result.current).toBe(status);
    });
  },
);
