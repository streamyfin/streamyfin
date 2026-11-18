import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import axios, { type AxiosRequestConfig } from "axios";
import MockAdapter from "axios-mock-adapter";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { SIGN_OUT_SESSION_END_TIMEOUT_MS } from "@/constants/Jellyfin";
import { PUSH_DEVICE_PATH } from "@/constants/Notifications";
import { clearMmkv } from "@/test-utils/mmkv";
import { clearSecureStore } from "@/test-utils/secureStore";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { saveAccountCredential } from "@/utils/secureCredentials";
import { store } from "@/utils/store";
import { JellyfinProvider, useJellyfin } from "./JellyfinProvider";

// The provider's own decisions stay real; what it reads settings and Seerr
// through is replaced, as neither has a say in a sign-out.
jest.mock("@/utils/atoms/settings", () => {
  const settingsModule = jest
    .requireActual("@/test-utils/settings")
    .makeSettingsModule();
  const handles = {
    setPluginSettings: () => {},
    forgetPluginSignIns: () => {},
    refreshStreamyfinPluginSettings: async () => undefined,
  };
  return {
    ...settingsModule,
    useSettings: () => ({ ...settingsModule.useSettings(), ...handles }),
  };
});
jest.mock("@/hooks/useSeerr", () => {
  const seerr = {
    clearAllSeerrData: async () => {},
    seerrUser: undefined,
    setSeerrUser: () => {},
  };
  return { SeerrApi: class {}, useSeerr: () => seerr };
});
// The TV home screen tiles live in native modules.
jest.mock("@/utils/tvDiscovery/sync", () => ({
  clearTVDiscoverySafely: () => {},
}));

const SERVER = "https://jellyfin.example.com";
const TOKEN = "0123456789abcdef0123456789abcdef";
const USER = { Id: "user-1", Name: "alice", ServerId: "server-1" };

// Every api the provider creates gets an axios instance of its own, made from
// the global defaults, so the adapter installed there answers all of them.
let server: MockAdapter;

const tokenOf = (config: AxiosRequestConfig) =>
  /Token="([^"]+)"/.exec(String(config.headers?.Authorization))?.[1];
const sessionEnds = () =>
  server.history.post.filter((request) =>
    request.url?.endsWith("/Sessions/Logout"),
  );

const signedInAtLaunch = () => {
  storage.set("serverUrl", SERVER);
  storage.set("token", TOKEN);
  storage.set("user", JSON.stringify(USER));
};

const renderProvider = async () => {
  const handle: { current?: ReturnType<typeof useJellyfin> } = {};
  const Probe = () => {
    handle.current = useJellyfin();
    return null;
  };
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>
        <JellyfinProvider>{children}</JellyfinProvider>
      </QueryClientProvider>
    </JotaiProvider>
  );
  await render(<Probe />, { wrapper: Wrapper });
  return {
    logout: () => {
      if (!handle.current) throw new Error("provider not mounted");
      return handle.current.logout();
    },
  };
};

beforeEach(() => {
  clearMmkv();
  clearSecureStore();
  server = new MockAdapter(axios);
  // The launch check of the restored session. Left unanswered, as when the
  // server is out of reach at launch: an answer saves the session as an
  // account, which the saved-account case below sets up on its own.
  server.onGet(`${SERVER}/Users/Me`).reply(() => new Promise(() => {}));
  server.onDelete(new RegExp(`${PUSH_DEVICE_PATH}/`)).reply(204);
  server.onPost(`${SERVER}/Sessions/Logout`).reply(204);
});

afterEach(() => {
  server.restore();
});

describe("JellyfinProvider sign-out", () => {
  it("ends the session on the server, so the token stops working", async () => {
    signedInAtLaunch();
    const { logout } = await renderProvider();

    await act(() => logout());

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
  });

  it("waits for the push registration to go, as its delete is sent with the token", async () => {
    signedInAtLaunch();
    let answerDelete = () => {};
    server.onDelete(new RegExp(`${PUSH_DEVICE_PATH}/`)).reply(
      () =>
        new Promise((resolve) => {
          answerDelete = () => resolve([204]);
        }),
    );
    const { logout } = await renderProvider();

    await act(() => logout());

    await waitFor(() => expect(server.history.delete).toHaveLength(1));
    expect(sessionEnds()).toHaveLength(0);
    answerDelete();
    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
  });

  it("signs out at once while the server does not answer, and gives up on it", async () => {
    signedInAtLaunch();
    server
      .onPost(`${SERVER}/Sessions/Logout`)
      .reply(() => new Promise(() => {}));
    const { logout } = await renderProvider();

    await act(() => logout());

    expect(storage.getString("token")).toBeUndefined();
    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(sessionEnds()[0].timeout).toBe(SIGN_OUT_SESSION_END_TIMEOUT_MS);
  });

  it.each([
    [
      "the server is unreachable",
      () => server.onPost(`${SERVER}/Sessions/Logout`).networkError(),
    ],
    [
      "the token was already revoked",
      () => server.onPost(`${SERVER}/Sessions/Logout`).reply(401),
    ],
  ])("signs out cleanly when %s", async (_case, answer) => {
    signedInAtLaunch();
    answer();
    const { logout } = await renderProvider();

    await expect(act(() => logout())).resolves.toBeUndefined();

    expect(storage.getString("token")).toBeUndefined();
    await waitFor(() =>
      expect(jest.mocked(writeErrorLog)).toHaveBeenCalledWith(
        expect.stringContaining("Failed to end the session on the server"),
      ),
    );
    // An axios error carries the request, and the request carries the token.
    expect(JSON.stringify(jest.mocked(writeErrorLog).mock.calls)).not.toContain(
      TOKEN,
    );
  });

  it("keeps the token of a saved account, which signs in again with it", async () => {
    signedInAtLaunch();
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "",
      token: TOKEN,
      userId: USER.Id,
      username: USER.Name,
      savedAt: Date.now(),
      securityType: "none",
    });
    const { logout } = await renderProvider();

    await act(() => logout());

    // The push registration goes either way; the token stays with the account.
    await waitFor(() => expect(server.history.delete).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sessionEnds()).toHaveLength(0);
  });

  it("ends a session whose account was saved with an older token", async () => {
    signedInAtLaunch();
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "",
      token: "fedcba9876543210fedcba9876543210",
      userId: USER.Id,
      username: USER.Name,
      savedAt: Date.now(),
      securityType: "none",
    });
    const { logout } = await renderProvider();

    await act(() => logout());

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
  });
});
