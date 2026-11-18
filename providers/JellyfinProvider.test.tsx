import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import MockAdapter from "axios-mock-adapter";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { SIGN_OUT_SESSION_END_TIMEOUT_MS } from "@/constants/Jellyfin";
import { PUSH_DEVICE_PATH } from "@/constants/Notifications";
import { clearMmkv } from "@/test-utils/mmkv";
import { clearSecureStore } from "@/test-utils/secureStore";
import { sessionEndsSettled } from "@/utils/jellyfin/endSession";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  getAccountCredential,
  getPreviousServers,
  saveAccountCredential,
} from "@/utils/secureCredentials";
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
// The same server, reached on the home network.
const LOCAL_SERVER = "http://192.168.1.10:8096";
const OTHER_TOKEN = "fedcba9876543210fedcba9876543210";
const OTHER_USER = { Id: "user-2", Name: "bob", ServerId: "server-1" };

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
  const provider = () => {
    if (!handle.current) throw new Error("provider not mounted");
    return handle.current;
  };
  return {
    logout: () => provider().logout(),
    loginWithSavedCredential: (serverUrl: string, userId: string) =>
      provider().loginWithSavedCredential(serverUrl, userId),
    switchServerUrl: (url: string) => provider().switchServerUrl(url),
    loginWithPassword: (
      serverUrl: string,
      username: string,
      password: string,
    ) => provider().loginWithPassword(serverUrl, username, password),
    // The form signs in on the server picked first, as on the login screen.
    login: async (username: string, password: string) => {
      await act(() => provider().setServer({ address: SERVER }));
      return provider().login(username, password);
    },
    initiateQuickConnect: async () => {
      await act(() => provider().setServer({ address: SERVER }));
      return provider().initiateQuickConnect();
    },
    stopQuickConnectPolling: () => provider().stopQuickConnectPolling(),
  };
};

type Provider = Awaited<ReturnType<typeof renderProvider>>;

const saveAccount = (
  overrides: Partial<Parameters<typeof saveAccountCredential>[0]> = {},
) =>
  saveAccountCredential({
    serverUrl: SERVER,
    serverName: "",
    token: TOKEN,
    userId: USER.Id,
    username: USER.Name,
    savedAt: Date.now(),
    securityType: "none",
    ...overrides,
  });

beforeEach(() => {
  clearMmkv();
  clearSecureStore();
  server = new MockAdapter(axios);
  // The launch check of the restored session.
  server.onGet(`${SERVER}/Users/Me`).reply(200, USER);
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
    // The mock adapter does not enforce the timeout: the reply gives up as
    // axios would once it runs out.
    let giveUp = () => {};
    server.onPost(`${SERVER}/Sessions/Logout`).reply(
      () =>
        new Promise((_resolve, reject) => {
          giveUp = () =>
            reject(new AxiosError("timeout exceeded", "ECONNABORTED"));
        }),
    );
    const { logout } = await renderProvider();

    try {
      await act(() => logout());

      expect(storage.getString("token")).toBeUndefined();
      await waitFor(() => expect(sessionEnds()).toHaveLength(1));
      expect(sessionEnds()[0].timeout).toBe(SIGN_OUT_SESSION_END_TIMEOUT_MS);
      let settled = false;
      void sessionEndsSettled().then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
    } finally {
      giveUp();
    }

    await act(() => sessionEndsSettled());
    expect(jest.mocked(writeErrorLog)).toHaveBeenCalledWith(
      "Failed to end the session on the server: ECONNABORTED",
    );
  });

  it("signs out cleanly when the server is unreachable", async () => {
    signedInAtLaunch();
    server.onPost(`${SERVER}/Sessions/Logout`).networkError();
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

  // An admin who removed the device, or the server itself on a new sign-in of
  // the same user, already ended it: nothing failed.
  it("takes a token the server already revoked as a session already ended", async () => {
    signedInAtLaunch();
    server.onPost(`${SERVER}/Sessions/Logout`).reply(401);
    const { logout } = await renderProvider();

    await expect(act(() => logout())).resolves.toBeUndefined();

    expect(storage.getString("token")).toBeUndefined();
    await waitFor(() =>
      expect(jest.mocked(writeInfoLog)).toHaveBeenCalledWith(
        expect.stringContaining("already ended"),
      ),
    );
    expect(jest.mocked(writeErrorLog)).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to end the session on the server"),
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
    await act(() => sessionEndsSettled());
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

  // At home the session runs on the local address, while the account was
  // saved under the address the user signed in on.
  it("keeps the token of a saved account while the session runs on the local address", async () => {
    signedInAtLaunch();
    await saveAccount();
    const { logout, switchServerUrl } = await renderProvider();
    await act(async () => switchServerUrl(LOCAL_SERVER));

    await act(() => logout());

    await waitFor(() => expect(server.history.delete).toHaveLength(1));
    expect(server.history.delete[0].url).toContain(LOCAL_SERVER);
    await act(() => sessionEndsSettled());
    expect(sessionEnds()).toHaveLength(0);
  });

  it("ends a session it signed out of on the local address there", async () => {
    signedInAtLaunch();
    server.onPost(`${LOCAL_SERVER}/Sessions/Logout`).reply(204);
    const { logout, switchServerUrl } = await renderProvider();
    await act(async () => switchServerUrl(LOCAL_SERVER));

    await act(() => logout());

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(sessionEnds()[0].url).toBe(`${LOCAL_SERVER}/Sessions/Logout`);
  });

  // Signing in to it again asks for the password and gets a new token, so the
  // one it was saved with would only stay valid for nothing.
  it("ends the session of an account saved with a password", async () => {
    signedInAtLaunch();
    await saveAccount({ securityType: "password" });
    const { logout } = await renderProvider();

    await act(() => logout());

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
  });

  // The server ends every session of the device when it ends one, so an end
  // still on its way would also end the session of the next sign-in.
  const opensWithSavedToken = (request: AxiosRequestConfig) =>
    tokenOf(request) === OTHER_TOKEN;
  const opensWithPassword = (request: AxiosRequestConfig) =>
    request.url?.endsWith("/Users/AuthenticateByName") === true;
  it.each([
    [
      "a saved account",
      (p: Provider) => p.loginWithSavedCredential(SERVER, OTHER_USER.Id),
      opensWithSavedToken,
    ],
    [
      "a password asked from the account list",
      (p: Provider) => p.loginWithPassword(SERVER, OTHER_USER.Name, "secret"),
      opensWithPassword,
    ],
    [
      "the sign-in form",
      (p: Provider) => p.login(OTHER_USER.Name, "secret"),
      opensWithPassword,
    ],
  ])(
    "lets a sign-in to %s wait for the session end still on its way",
    async (_case, signIn, opensSession) => {
      signedInAtLaunch();
      await saveAccount({
        token: OTHER_TOKEN,
        userId: OTHER_USER.Id,
        username: OTHER_USER.Name,
      });
      server
        .onGet(`${SERVER}/Users/Me`)
        .reply((config) => [
          200,
          tokenOf(config) === OTHER_TOKEN ? OTHER_USER : USER,
        ]);
      server
        .onPost(`${SERVER}/Users/AuthenticateByName`)
        .reply(200, { AccessToken: OTHER_TOKEN, User: OTHER_USER });
      let answerEnd = () => {};
      server.onPost(`${SERVER}/Sessions/Logout`).reply(
        () =>
          new Promise((resolve) => {
            answerEnd = () => resolve([204]);
          }),
      );
      const sessionOpenings = () =>
        [...server.history.get, ...server.history.post].filter(opensSession);
      const provider = await renderProvider();
      await act(() => provider.logout());
      await waitFor(() => expect(sessionEnds()).toHaveLength(1));

      const signedIn = signIn(provider);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(sessionOpenings()).toHaveLength(0);

      answerEnd();
      await act(() => signedIn);
      expect(sessionOpenings().length).toBeGreaterThan(0);
      expect(storage.getString("token")).toBe(OTHER_TOKEN);
    },
  );

  it("lets Quick Connect wait for the session end still on its way", async () => {
    signedInAtLaunch();
    server
      .onPost(`${SERVER}/QuickConnect/Initiate`)
      .reply(200, { Code: "123456", Secret: "secret" });
    let answerEnd = () => {};
    server.onPost(`${SERVER}/Sessions/Logout`).reply(
      () =>
        new Promise((resolve) => {
          answerEnd = () => resolve([204]);
        }),
    );
    const initiations = () =>
      server.history.post.filter((request) =>
        request.url?.endsWith("/QuickConnect/Initiate"),
      );
    const provider = await renderProvider();
    await act(() => provider.logout());
    await waitFor(() => expect(sessionEnds()).toHaveLength(1));

    try {
      const started = provider.initiateQuickConnect();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(initiations()).toHaveLength(0);

      answerEnd();
      await act(async () => {
        await started;
      });
      expect(initiations()).toHaveLength(1);
    } finally {
      answerEnd();
      await act(async () => provider.stopQuickConnectPolling());
    }
  });
});

describe("JellyfinProvider launch", () => {
  const launchChecked = async () => {
    await waitFor(() =>
      expect(
        server.history.get.some((request) =>
          request.url?.endsWith("/Users/Me"),
        ),
      ).toBe(true),
    );
    // The answer is handled over a few promise turns.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };

  // A restored session used to be saved as an account at every launch, with
  // no protection, whether or not the user had asked for it at sign-in.
  it("does not save a restored session the user did not save", async () => {
    signedInAtLaunch();
    await renderProvider();

    await launchChecked();

    expect(await getAccountCredential(SERVER, USER.Id)).toBeNull();
    expect(getPreviousServers()).toEqual([]);
  });

  it("ends a restored session at sign-out, the user never having saved it", async () => {
    signedInAtLaunch();
    const { logout } = await renderProvider();
    await launchChecked();

    await act(() => logout());

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
  });

  it("still refreshes the picture of a saved account", async () => {
    signedInAtLaunch();
    await saveAccountCredential({
      serverUrl: SERVER,
      serverName: "",
      token: TOKEN,
      userId: USER.Id,
      username: USER.Name,
      savedAt: Date.now(),
      securityType: "none",
      primaryImageTag: "old-picture",
    });
    server
      .onGet(`${SERVER}/Users/Me`)
      .reply(200, { ...USER, PrimaryImageTag: "new-picture" });
    await renderProvider();

    await launchChecked();

    expect(getPreviousServers()[0]?.accounts).toEqual([
      expect.objectContaining({
        userId: USER.Id,
        primaryImageTag: "new-picture",
      }),
    ]);
  });
});
