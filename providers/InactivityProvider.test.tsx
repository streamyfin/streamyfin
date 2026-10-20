import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Text } from "react-native";
import { clearMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import { storage } from "@/utils/mmkv";
import { InactivityProvider } from "./InactivityProvider";
import { userAtom } from "./JellyfinProvider";

const mockLogout = jest.fn(async () => {});
jest.mock("./JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom(null),
  useJellyfin: () => ({ logout: mockLogout }),
}));
// The settings atom imports the screens that edit it; the provider reads the
// timeout only.
jest.mock("@/utils/atoms/settings", () => ({
  InactivityTimeout: { Disabled: 0 },
  useSettings: () => ({ settings: { inactivityTimeout: 60_000 } }),
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const TIMEOUT_MS = 60_000;
const LAST_ACTIVITY_KEY = "INACTIVITY_LAST_ACTIVITY";

const signIn = () =>
  act(() => getDefaultStore().set(userAtom, { Id: "user-1" } as never));

const renderProvider = () =>
  render(
    <InactivityProvider>
      <Text>app</Text>
    </InactivityProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  stubReactNative({ isTV: true });
  clearMmkv();
  mockLogout.mockClear();
  getDefaultStore().set(userAtom, null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("InactivityProvider", () => {
  test("signs a signed-in TV out once the timeout has passed", async () => {
    await signIn();
    await renderProvider();
    await act(() => jest.advanceTimersByTime(TIMEOUT_MS));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // The login screen resets the count only on the icons it focuses: past a
  // minute in its forms the sign-out ran there, tore down the server the form
  // was signing in to, and the next Log in threw "API not initialized"
  // (Sentry REACT-NATIVE-104).
  test("signs nobody out on the login screen", async () => {
    await renderProvider();
    await act(() => jest.advanceTimersByTime(TIMEOUT_MS * 3));
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // The issue's other event signed a user out seven seconds after they signed
  // in: the count had started on the login screen, and so had the activity on
  // record.
  test("counts from the sign-in, not from before it", async () => {
    storage.set(LAST_ACTIVITY_KEY, Date.now() - TIMEOUT_MS * 10);
    await renderProvider();
    await act(() => jest.advanceTimersByTime(TIMEOUT_MS - 1_000));

    await signIn();
    await act(() => jest.advanceTimersByTime(TIMEOUT_MS - 1_000));
    expect(mockLogout).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(1_000));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // A session restored at launch is measured from its last activity: a TV
  // left alone while the app was closed is signed out when it opens.
  test("signs out at launch a session left alone past the timeout", async () => {
    storage.set(LAST_ACTIVITY_KEY, Date.now() - TIMEOUT_MS * 2);
    await signIn();
    await renderProvider();
    expect(mockLogout).toHaveBeenCalled();
  });
});
