import { act, renderHook } from "@testing-library/react-native";

// Pins patches/react-native-google-cast@4.9.1.patch, which covers the two
// hooks the app mounts (components/Chromecast.tsx, components/PlayButton.tsx).
// Each asks the native side for the current state with no rejection handler,
// and that call rejects once the session is gone: on Android with
// IllegalStateException("No session") (REACT-NATIVE-3S, upstream issue #580),
// on iOS with GCKErrorCodeNoMediaSession, which reads "Cocoa error 32"
// (REACT-NATIVE-8R). Jest fails a test on a rejection nothing handles: that is
// what fails the rejection cases on the unpatched hooks.

const makeClient = () => ({
  getMediaStatus: jest.fn(),
  onMediaStatusUpdated: jest.fn(() => ({ remove: jest.fn() })),
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

const NO_SESSION = "java.lang.IllegalStateException: No session";
const noSession = () => Promise.reject(new Error(NO_SESSION));

// The iOS rejection as React Native hands it over: RNGCRemoteMediaClient.m
// rejects with NSError(NSCocoaErrorDomain, GCKErrorCodeNoMediaSession = 32),
// and RCTJSErrorFromCodeMessageAndNSError takes its localizedDescription for
// both the message and the code.
const COCOA_ERROR_32 = "The operation couldn’t be completed. (Cocoa error 32.)";
const noMediaSessionOnIOS = () =>
  Promise.reject(
    Object.assign(new Error(COCOA_ERROR_32), {
      code: COCOA_ERROR_32,
      domain: "NSCocoaErrorDomain",
      userInfo: {},
    }),
  );

// An answer the native side has not given yet.
const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolveWith, rejectWith) => {
    resolve = resolveWith;
    reject = rejectWith;
  });
  return { promise, resolve, reject };
};

// Lets every pending answer settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe.each(["src", "lib/commonjs"])(
  "react-native-google-cast %s",
  (build) => {
    const hook = (name: string) =>
      require(`react-native-google-cast/${build}/api/${name}`).default;

    beforeEach(() => {
      mockClient = makeClient();
      mockSession = makeSession();
    });

    it.each([
      ["Android", noSession],
      ["iOS", noMediaSessionOnIOS],
    ])(
      "useMediaStatus answers null when %s has no session",
      async (_platform, rejection) => {
        const useMediaStatus = hook("useMediaStatus");
        mockClient.getMediaStatus.mockImplementation(rejection);

        const { result } = await renderHook(() => useMediaStatus());
        await settle();

        expect(mockClient.getMediaStatus).toHaveBeenCalled();
        expect(result.current).toBeNull();
      },
    );

    it("useCastDevice answers null when the session is gone", async () => {
      const useCastDevice = hook("useCastDevice");
      mockSession.getCastDevice.mockImplementation(noSession);

      const { result } = await renderHook(() => useCastDevice());
      await settle();

      expect(mockSession.getCastDevice).toHaveBeenCalled();
      expect(result.current).toBeNull();
    });

    it("still passes on what the native side answers", async () => {
      const useMediaStatus = hook("useMediaStatus");
      const useCastDevice = hook("useCastDevice");
      const status = { playerState: "playing" };
      const device = { deviceId: "living-room" };
      mockClient.getMediaStatus.mockResolvedValue(status);
      mockSession.getCastDevice.mockResolvedValue(device);

      const statusHook = await renderHook(() => useMediaStatus());
      const deviceHook = await renderHook(() => useCastDevice());
      await settle();

      expect(statusHook.result.current).toBe(status);
      expect(deviceHook.result.current).toBe(device);
    });

    // A late answer from the session that was replaced, whether it rejects or
    // resolves, must not replace what the new one answered: useCastDevice has
    // no event that would set it again.
    describe.each([
      [
        "rejection",
        (late: ReturnType<typeof deferred<object>>) =>
          late.reject(new Error(NO_SESSION)),
      ],
      [
        "answer",
        (late: ReturnType<typeof deferred<object>>) =>
          late.resolve({ stale: true }),
      ],
    ])("over a late %s from the replaced session", (_kind, settleLate) => {
      it("useMediaStatus keeps the new session's status", async () => {
        const useMediaStatus = hook("useMediaStatus");
        const late = deferred<object>();
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
          settleLate(late);
          await settle();
        });

        expect(result.current).toBe(status);
      });

      it("useCastDevice keeps the new session's device", async () => {
        const useCastDevice = hook("useCastDevice");
        const late = deferred<object>();
        mockSession.getCastDevice.mockReturnValue(late.promise);
        const { result, rerender } = await renderHook(() => useCastDevice());

        const device = { deviceId: "living-room" };
        mockSession = makeSession();
        mockSession.getCastDevice.mockResolvedValue(device);
        await rerender({});
        await settle();
        await act(async () => {
          settleLate(late);
          await settle();
        });

        expect(result.current).toBe(device);
      });
    });
  },
);
