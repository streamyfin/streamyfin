import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Text } from "react-native";
import { INACTIVITY_LAST_ACTIVITY_STORAGE_KEY } from "@/constants/Inactivity";
import { clearMmkv } from "@/test-utils/mmkv";
import { emitAppState, stubReactNative } from "@/test-utils/reactNative";
import { settingsAtom } from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";
import { InactivityProvider, useInactivity } from "./InactivityProvider";
import { userAtom } from "./JellyfinProvider";

const mockLogout = jest.fn(async () => {});
jest.mock("./JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom(null),
  useJellyfin: () => ({ logout: mockLogout }),
}));
// The settings atom imports the screens that edit it; the provider reads the
// timeout and whether the local settings have loaded. The local settings load
// after the first render, as in the app; a plugin lock comes with the session
// restored at launch, or from the server right after a sign-in.
jest.mock("@/utils/atoms/settings", () => {
  const { atom, useAtomValue } = jest.requireActual("jotai");
  const settingsAtom = atom(null);
  const lockAtom = atom(undefined);
  return {
    InactivityTimeout: { Disabled: 0 },
    settingsAtom,
    mockLockAtom: lockAtom,
    useSettings: () => {
      const local = useAtomValue(settingsAtom);
      const lock = useAtomValue(lockAtom);
      return {
        settings: { inactivityTimeout: lock ?? local?.inactivityTimeout ?? 0 },
      };
    },
  };
});
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const TIMEOUT_MS = 60_000;
const { mockLockAtom } = jest.requireMock("@/utils/atoms/settings");
const store = getDefaultStore();

const signIn = (id = "user-1") =>
  act(() => store.set(userAtom, { Id: id } as never));
const signOut = () => act(() => store.set(userAtom, null));
const loadSettings = (inactivityTimeout = TIMEOUT_MS) =>
  act(() => store.set(settingsAtom, { inactivityTimeout } as never));
const lockTimeout = (timeout: number) =>
  act(() => store.set(mockLockAtom, timeout));
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const recordActivityAgo = (ms: number) =>
  storage.set(INACTIVITY_LAST_ACTIVITY_STORAGE_KEY, Date.now() - ms);

let controls: ReturnType<typeof useInactivity>;
const Controls = () => {
  controls = useInactivity();
  return <Text>app</Text>;
};

const renderProvider = () =>
  render(
    <InactivityProvider>
      <Controls />
    </InactivityProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  stubReactNative({ isTV: true });
  clearMmkv();
  mockLogout.mockClear();
  store.set(userAtom, null);
  store.set(settingsAtom, null);
  store.set(mockLockAtom, undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("InactivityProvider", () => {
  test("signs a signed-in TV out once the timeout has passed", async () => {
    await signIn();
    await renderProvider();
    await loadSettings();
    await wait(TIMEOUT_MS);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // The login screen resets the count only on the icons it focuses: past a
  // minute in its forms the sign-out ran there, tore down the server the form
  // was signing in to, and the next Log in threw "API not initialized"
  // (Sentry REACT-NATIVE-104).
  test("signs nobody out on the login screen", async () => {
    await renderProvider();
    await loadSettings();
    await wait(TIMEOUT_MS * 3);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // The issue's other event signed a user out seven seconds after they signed
  // in: the count had started on the login screen, and so had the activity on
  // record.
  test("counts from the sign-in, not from before it", async () => {
    recordActivityAgo(TIMEOUT_MS * 10);
    await renderProvider();
    await loadSettings();
    await wait(TIMEOUT_MS - 1_000);

    await signIn();
    await wait(TIMEOUT_MS - 1_000);
    expect(mockLogout).not.toHaveBeenCalled();

    await wait(1_000);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // A switch from one account to another never goes through signed out.
  test("counts a switch to another user from the switch", async () => {
    await signIn("user-a");
    await renderProvider();
    await loadSettings();
    await wait(TIMEOUT_MS - 5_000);

    await signIn("user-b");
    await wait(5_000);
    expect(mockLogout).not.toHaveBeenCalled();

    await wait(TIMEOUT_MS - 5_000);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // A plugin lock only comes back from the server after the sign-in, so the
  // timeout is off when the sign-in happens and on a moment later.
  test("counts a timeout set right after the sign-in from the sign-in", async () => {
    recordActivityAgo(TIMEOUT_MS * 120);
    await renderProvider();
    await loadSettings(0);

    await signIn();
    await lockTimeout(TIMEOUT_MS);
    await wait(TIMEOUT_MS - 1_000);
    expect(mockLogout).not.toHaveBeenCalled();

    await wait(1_000);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test("counts a timeout turned on in Settings from then", async () => {
    await signIn();
    await renderProvider();
    await loadSettings(0);
    // An activity recorded while it was on, earlier in the session.
    recordActivityAgo(TIMEOUT_MS * 120);

    await loadSettings(TIMEOUT_MS);
    await wait(TIMEOUT_MS - 1_000);
    expect(mockLogout).not.toHaveBeenCalled();

    await wait(1_000);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // A video pauses the count. A sign-out while it plays, by the server
  // revoking the session for one, must not leave it paused for the next user.
  test("counts again for the next user after a sign-out during a video", async () => {
    await signIn("user-a");
    await renderProvider();
    await loadSettings();
    await act(() => controls.pauseInactivityTimer());

    await signOut();
    await act(() => controls.resumeInactivityTimer());
    await signIn("user-b");
    await wait(TIMEOUT_MS);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  describe("at launch", () => {
    // A session restored at launch is measured from its last activity: a TV
    // left alone while the app was closed is signed out when it opens.
    test("signs out a session left alone past the timeout", async () => {
      recordActivityAgo(TIMEOUT_MS * 2);
      await signIn();
      await renderProvider();
      await loadSettings();

      expect(mockLogout).toHaveBeenCalledTimes(1);
      // And nothing writes the activity back after that sign-out.
      expect(storage.getNumber(INACTIVITY_LAST_ACTIVITY_STORAGE_KEY)).toBe(
        undefined,
      );
    });

    test.each([
      ["set in the app's settings", false],
      ["locked by the plugin", true],
    ])(
      "keeps the time left when the timeout is %s",
      async (_source, locked) => {
        recordActivityAgo(TIMEOUT_MS - 10_000);
        if (locked) await lockTimeout(TIMEOUT_MS);
        await signIn();
        await renderProvider();
        await loadSettings(locked ? 0 : TIMEOUT_MS);

        await wait(10_500);
        expect(mockLogout).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("back in the foreground", () => {
    test("signs nobody out on the login screen", async () => {
      recordActivityAgo(TIMEOUT_MS * 10);
      await renderProvider();
      await loadSettings();

      await act(() => emitAppState("background"));
      await act(() => emitAppState("active"));
      expect(mockLogout).not.toHaveBeenCalled();
    });

    test("signs a session out once the timeout has passed while away", async () => {
      await signIn();
      await renderProvider();
      await loadSettings();

      await act(() => emitAppState("background"));
      await wait(TIMEOUT_MS + 1_000);
      expect(mockLogout).not.toHaveBeenCalled();
      await act(() => emitAppState("active"));
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
