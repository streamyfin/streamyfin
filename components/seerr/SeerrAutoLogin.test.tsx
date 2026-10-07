import { act, render, waitFor } from "@testing-library/react-native";
import { atom, Provider } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  holdSeerrSignIn,
  seerrSignInsAtLoginAtom,
} from "@/utils/seerrSignInAtLogin";
import { store } from "@/utils/store";
import { SeerrAutoLogin } from "./SeerrAutoLogin";

const mockSignInWithQuickConnect = jest.fn();
const mockGetSeerrPassword = jest.fn();
const mockSeerr = { login: jest.fn(), forget: jest.fn() };
const mockSeerrUserAtom = atom<{ id: number } | undefined>(undefined);

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = require("jotai");
  return {
    apiAtom: atom(null),
    userAtom: atom(null),
  };
});
jest.mock("@/hooks/useSeerr", () => ({
  SeerrApi: jest.fn(() => mockSeerr),
  useSeerr: () => {
    const { useAtom } = require("jotai");
    const [seerrUser, setSeerrUser] = useAtom(mockSeerrUserAtom);
    return { seerrUser, setSeerrUser };
  },
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { seerrServerUrl: "https://seerr.test", autoLoginSeerr: true },
    pluginSettings: { seerrServerUrl: { value: "https://seerr.test" } },
  }),
}));
jest.mock("@/utils/customHeaders", () => ({
  getIntegrationHeaders: () => ({}),
}));
jest.mock("@/utils/log", () => ({
  writeErrorLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeToLog: jest.fn(),
}));
jest.mock("@/utils/mmkv", () => ({
  storage: { getString: () => "https://jellyfin.test" },
}));
jest.mock("@/utils/seerrPassword", () => ({
  deleteSeerrPassword: jest.fn(async () => {}),
  getSeerrPassword: (...args: unknown[]) => mockGetSeerrPassword(...args),
}));
jest.mock("@/utils/seerrQuickConnect", () => ({
  signInWithQuickConnect: (...args: unknown[]) =>
    mockSignInWithQuickConnect(...args),
}));

const renderAutoLogin = () =>
  render(
    <Provider store={store}>
      <SeerrAutoLogin />
    </Provider>,
  );

// A password sign-in brings the plugin's Seerr address with its refresh, which
// starts this component while that sign-in is still running Quick Connect for
// the same user. Both ran, and opened two Seerr sessions for one user.
describe("signing in to Seerr at launch", () => {
  beforeEach(() => {
    mockSignInWithQuickConnect.mockReset();
    mockSignInWithQuickConnect.mockResolvedValue(undefined);
    mockGetSeerrPassword.mockReset();
    mockGetSeerrPassword.mockResolvedValue(undefined);
    mockSeerr.login.mockReset();
    mockSeerr.forget.mockReset();
    store.set(userAtom, { Id: "user", Name: "alex" } as never);
    store.set(apiAtom, {} as never);
  });

  afterEach(() => {
    store.set(seerrSignInsAtLoginAtom, new Map());
    store.set(mockSeerrUserAtom, undefined);
    store.set(userAtom, null);
    store.set(apiAtom, null);
  });

  test("runs at once when no sign-in is in progress", async () => {
    await renderAutoLogin();

    expect(mockSignInWithQuickConnect).toHaveBeenCalledTimes(1);
  });

  // Not spent while that sign-in runs: one that could not open a session
  // leaves this its turn.
  test("waits while a password sign-in signs the same user in", async () => {
    const end = holdSeerrSignIn("user");
    await renderAutoLogin();
    expect(mockSignInWithQuickConnect).not.toHaveBeenCalled();

    await act(async () => end());

    expect(mockSignInWithQuickConnect).toHaveBeenCalledTimes(1);
  });

  test("has nothing left to do once the held sign-in opened a session", async () => {
    const end = holdSeerrSignIn("user");
    await renderAutoLogin();

    await act(async () => {
      store.set(mockSeerrUserAtom, { id: 7 });
      end();
    });

    expect(mockSignInWithQuickConnect).not.toHaveBeenCalled();
  });

  test("is not held by another user's sign-in", async () => {
    const end = holdSeerrSignIn("someone-else");
    await renderAutoLogin();

    expect(mockSignInWithQuickConnect).toHaveBeenCalledTimes(1);
    end();
  });

  test("signs in with the stored password when Quick Connect could not", async () => {
    mockGetSeerrPassword.mockResolvedValue("secret");
    mockSeerr.login.mockResolvedValue({ id: 8 });

    await renderAutoLogin();

    await waitFor(() =>
      expect(store.get(mockSeerrUserAtom)).toEqual({ id: 8 }),
    );
  });

  // A sign-out or an account switch clears the Seerr data, and a sign-in still
  // on its way would bring the previous account's session back for the next.
  test("drops the session of an account that left while its stored password signed it in", async () => {
    mockGetSeerrPassword.mockResolvedValue("secret");
    mockSeerr.login.mockImplementation(async () => {
      store.set(userAtom, { Id: "next", Name: "sam" } as never);
      return { id: 8 };
    });

    await renderAutoLogin();

    await waitFor(() => expect(mockSeerr.forget).toHaveBeenCalledTimes(1));
    expect(store.get(mockSeerrUserAtom)).toBeUndefined();
  });

  test("drops Quick Connect's session for an account that left before it was handed over", async () => {
    mockSignInWithQuickConnect.mockImplementation(async () => {
      store.set(userAtom, { Id: "next", Name: "sam" } as never);
      return { id: 7 };
    });

    await renderAutoLogin();

    await waitFor(() => expect(mockSeerr.forget).toHaveBeenCalledTimes(1));
    expect(store.get(mockSeerrUserAtom)).toBeUndefined();
  });
});
