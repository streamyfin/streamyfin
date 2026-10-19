import { act, renderHook } from "@testing-library/react-native";

// Pins patches/react-native-google-cast@4.9.1.patch. The library's hooks ask
// the native side for the current state without a rejection handler; on
// Android that call rejects with IllegalStateException("No session") when the
// session ended in the meantime, and every such rejection reached Sentry as
// an unhandled one (REACT-NATIVE-3S, upstream issue #580).

const makeClient = () => ({
  getMediaStatus: jest.fn(),
  getStreamPosition: jest.fn(),
  onMediaStatusUpdated: jest.fn(() => ({ remove: jest.fn() })),
  onMediaProgressUpdated: jest.fn(() => ({ remove: jest.fn() })),
});
const makeSession = () => ({ getCastDevice: jest.fn() });

// What the hooks see as the current client and session; a spec swaps them to
// stand for a new session starting.
let mockClient = makeClient();
let mockSession = makeSession();

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

// An answer the native side has not given yet.
const deferred = <T,>() => {
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((_resolve, rejectWith) => {
    reject = rejectWith;
  });
  return { promise, reject };
};

// Lets every pending rejection settle, so Node reports the unhandled ones.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe.each(["src", "lib/commonjs"])(
  "react-native-google-cast %s",
  (build) => {
    const unhandled = jest.fn();
    const hook = (name: string) =>
      require(`react-native-google-cast/${build}/api/${name}`).default;

    beforeAll(() => process.on("unhandledRejection", unhandled));
    afterAll(() => process.off("unhandledRejection", unhandled));
    beforeEach(() => {
      unhandled.mockReset();
      mockClient = makeClient();
      mockSession = makeSession();
    });

    it("useMediaStatus answers null when the session is gone", async () => {
      const useMediaStatus = hook("useMediaStatus");
      mockClient.getMediaStatus.mockImplementation(noSession);

      const { result } = await renderHook(() => useMediaStatus());
      await settle();

      expect(mockClient.getMediaStatus).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("useStreamPosition answers null when the session is gone", async () => {
      const useStreamPosition = hook("useStreamPosition");
      mockClient.getStreamPosition.mockImplementation(noSession);

      const { result } = await renderHook(() => useStreamPosition());
      await settle();

      expect(mockClient.getStreamPosition).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("useCastDevice answers null when the session is gone", async () => {
      const useCastDevice = hook("useCastDevice");
      mockSession.getCastDevice.mockImplementation(noSession);

      const { result } = await renderHook(() => useCastDevice());
      await settle();

      expect(mockSession.getCastDevice).toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("still passes on what the native side answers", async () => {
      const useMediaStatus = hook("useMediaStatus");
      const status = { playerState: "playing" };
      mockClient.getMediaStatus.mockResolvedValue(status);

      const { result } = await renderHook(() => useMediaStatus());
      await settle();

      expect(result.current).toBe(status);
    });

    // A rejection from the session that was replaced must not clear what the
    // new one answered: useCastDevice has no event that would set it again.
    it("useMediaStatus keeps the new session's status over a late rejection", async () => {
      const useMediaStatus = hook("useMediaStatus");
      const late = deferred();
      mockClient.getMediaStatus.mockReturnValue(late.promise);
      const { result, rerender } = await renderHook(() => useMediaStatus());

      const status = { playerState: "playing" };
      mockClient = makeClient();
      mockClient.getMediaStatus.mockResolvedValue(status);
      await rerender({});
      await settle();
      // Inside act, so the state the late answer sets is applied as it would
      // be in the app.
      await act(async () => {
        late.reject(new Error("java.lang.IllegalStateException: No session"));
        await settle();
      });

      expect(result.current).toBe(status);
      expect(unhandled).not.toHaveBeenCalled();
    });

    it("useCastDevice keeps the new session's device over a late rejection", async () => {
      const useCastDevice = hook("useCastDevice");
      const late = deferred();
      mockSession.getCastDevice.mockReturnValue(late.promise);
      const { result, rerender } = await renderHook(() => useCastDevice());

      const device = { deviceId: "living-room" };
      mockSession = makeSession();
      mockSession.getCastDevice.mockResolvedValue(device);
      await rerender({});
      await settle();
      // Inside act, so the state the late answer sets is applied as it would
      // be in the app.
      await act(async () => {
        late.reject(new Error("java.lang.IllegalStateException: No session"));
        await settle();
      });

      expect(result.current).toBe(device);
      expect(unhandled).not.toHaveBeenCalled();
    });
  },
);
