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
import * as endSession from "@/utils/jellyfin/endSession";
import { sessionEndsSettled } from "@/utils/jellyfin/endSession";
import * as legacyServerAddress from "@/utils/jellyfin/legacyServerAddress";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  addServerToList,
  getAccountCredential,
  getPreviousServers,
  saveAccountCredential,
  updateServerLocalConfig,
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
const OTHER_SERVER = "https://other.example.com";
// The same server under the prefix older versions served it on.
const LEGACY_SERVER = `${SERVER}/emby`;

// Every api the provider creates gets an axios instance of its own, made from
// the global defaults, so the adapter installed there answers all of them.
let server: MockAdapter;

type Sent = AxiosRequestConfig;
const tokenOf = (config: Sent) =>
  /Token="([^"]+)"/.exec(String(config.headers?.Authorization))?.[1];
const requests = (match: (request: Sent) => boolean) =>
  [...server.history.get, ...server.history.post].filter(match);
const sentTo = (path: string) => (request: Sent) =>
  request.url?.endsWith(path) === true;
// The server ends a session on a POST only.
const sessionEnds = () =>
  server.history.post.filter(sentTo("/Sessions/Logout"));
// The two ways a sign-in opens the session of OTHER_USER.
const withSavedToken = (request: Sent) => tokenOf(request) === OTHER_TOKEN;
const byPassword = sentTo("/Users/AuthenticateByName");

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
    // Picked apart from the sign-in, as on the login screen: an act opened
    // while another one runs breaks every test after this one.
    selectServer: (address: string) =>
      act(() => provider().setServer({ address })),
    signIn: (username: string, password: string) =>
      provider().login(username, password),
    initiateQuickConnect: () => provider().initiateQuickConnect(),
    stopQuickConnectPolling: () => provider().stopQuickConnectPolling(),
  };
};

type Provider = Awaited<ReturnType<typeof renderProvider>>;

// Bounded: a call that waits where it should not fails its own test here,
// instead of holding an act open that breaks every test after it.
async function within<T>(promise: Promise<T>, failure: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(failure)), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const signOut = (logout: () => Promise<void>) =>
  act(() => within(logout(), "the sign-out waited for the server"));

// A reply held until the test answers it, made before its request. Answered
// after every test as well, failed or not: one left held stalls every later
// request to its address.
const releases: Array<() => void> = [];
function held<T>(reply: T) {
  const { promise: answered, resolve } = Promise.withResolvers<T>();
  const answer = () => resolve(reply);
  releases.push(answer);
  return { answer, answered };
}

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

afterEach(async () => {
  try {
    await act(async () => {
      for (const release of releases.splice(0)) release();
      // So the next test holds only its own ends.
      await within(
        Promise.all(
          [SERVER, LOCAL_SERVER, LEGACY_SERVER].map(sessionEndsSettled),
        ),
        "an end was still on its way after the test",
      );
    });
  } finally {
    jest.restoreAllMocks();
    server.restore();
  }
});

describe("JellyfinProvider sign-out", () => {
  // A saved account signs in again with its token, the only one kept.
  it.each([
    ["no account was saved", async () => {}],
    [
      "its account was saved with an older token",
      () => saveAccount({ token: OTHER_TOKEN }),
    ],
    // Signing in to it again asks for the password and gets a new token, so
    // the one it was saved with would only stay valid for nothing.
    [
      "its account was saved with a password",
      () => saveAccount({ securityType: "password" }),
    ],
  ])(
    "ends the session on the server when %s, so the token stops working",
    async (_case, save) => {
      signedInAtLaunch();
      await save();
      const { logout } = await renderProvider();

      await signOut(logout);

      await waitFor(() => expect(sessionEnds()).toHaveLength(1));
      expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
    },
  );

  it("waits for the push registration to go, as its delete is sent with the token", async () => {
    signedInAtLaunch();
    const pushDelete = held<[number]>([204]);
    server
      .onDelete(new RegExp(`${PUSH_DEVICE_PATH}/`))
      .reply(() => pushDelete.answered);
    const { logout } = await renderProvider();

    await signOut(logout);

    await waitFor(() => expect(server.history.delete).toHaveLength(1));
    expect(sessionEnds()).toHaveLength(0);
    pushDelete.answer();
    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
  });

  it("signs out at once while the server does not answer, and gives up on it", async () => {
    signedInAtLaunch();
    // The mock adapter does not enforce the timeout: the reply gives up as
    // axios would once it runs out.
    let giveUp = () => {};
    releases.push(() => giveUp());
    server.onPost(`${SERVER}/Sessions/Logout`).reply(
      () =>
        new Promise((_resolve, reject) => {
          giveUp = () =>
            reject(new AxiosError("timeout exceeded", "ECONNABORTED"));
        }),
    );
    const { logout } = await renderProvider();

    await signOut(logout);

    expect(storage.getString("token")).toBeUndefined();
    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(sessionEnds()[0].timeout).toBe(SIGN_OUT_SESSION_END_TIMEOUT_MS);
    let settled = false;
    void sessionEndsSettled(SERVER).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    giveUp();
    await act(() => sessionEndsSettled(SERVER));
    expect(jest.mocked(writeErrorLog)).toHaveBeenCalledWith(
      "Failed to end the session on the server: ECONNABORTED",
    );
  });

  it("signs out cleanly when the server is unreachable", async () => {
    signedInAtLaunch();
    server.onPost(`${SERVER}/Sessions/Logout`).networkError();
    const { logout } = await renderProvider();

    await expect(signOut(logout)).resolves.toBeUndefined();

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

    await expect(signOut(logout)).resolves.toBeUndefined();

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

  // It signs in again with it. At home the session runs on the local address,
  // while the account was saved under the address the user signed in on.
  it.each([
    ["on the address it was saved under", SERVER],
    ["on the local address", LOCAL_SERVER],
  ])(
    "keeps the token of a saved account while the session runs %s",
    async (_case, address) => {
      signedInAtLaunch();
      await saveAccount();
      const { logout, switchServerUrl } = await renderProvider();
      if (address !== SERVER) await act(async () => switchServerUrl(address));

      await signOut(logout);

      // The push registration goes either way; the token stays with the account.
      await waitFor(() => expect(server.history.delete).toHaveLength(1));
      expect(server.history.delete[0].url).toMatch(
        new RegExp(`^${address}${PUSH_DEVICE_PATH}/`),
      );
      await act(() => sessionEndsSettled(address));
      expect(sessionEnds()).toHaveLength(0);
    },
  );

  it("ends a session it signed out of on the local address there", async () => {
    signedInAtLaunch();
    server.onPost(`${LOCAL_SERVER}/Sessions/Logout`).reply(204);
    const { logout, switchServerUrl } = await renderProvider();
    await act(async () => switchServerUrl(LOCAL_SERVER));

    await signOut(logout);

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(sessionEnds()[0].url).toBe(`${LOCAL_SERVER}/Sessions/Logout`);
  });

  // The server ends every session of the device when it ends one, so an end
  // still on its way would also end the session of the next sign-in. Signed
  // in at launch on `savedOn`, at home on its local address, and signed out
  // with that end held; the next sign-in opens the session of OTHER_USER.
  const holdingTheEnd = async ({
    savedOn = SERVER,
    atHome = false,
    signOutFirst = true,
  } = {}) => {
    signedInAtLaunch();
    storage.set("serverUrl", savedOn);
    await saveAccount({
      token: OTHER_TOKEN,
      userId: OTHER_USER.Id,
      username: OTHER_USER.Name,
    });
    for (const address of [SERVER, LEGACY_SERVER, OTHER_SERVER]) {
      server
        .onGet(`${address}/Users/Me`)
        .reply((config) => [
          200,
          tokenOf(config) === OTHER_TOKEN ? OTHER_USER : USER,
        ]);
      server
        .onPost(`${address}/Users/AuthenticateByName`)
        .reply(200, { AccessToken: OTHER_TOKEN, User: OTHER_USER });
    }
    const endedOn = atHome ? LOCAL_SERVER : savedOn;
    if (atHome) {
      addServerToList(SERVER);
      updateServerLocalConfig(SERVER, {
        localUrl: LOCAL_SERVER,
        homeWifiSSIDs: [],
        enabled: true,
      });
    }
    const end = held<[number]>([204]);
    server.onPost(`${endedOn}/Sessions/Logout`).reply(() => end.answered);
    const provider = await renderProvider();
    if (atHome) await act(async () => provider.switchServerUrl(LOCAL_SERVER));
    if (signOutFirst) {
      await signOut(provider.logout);
      await waitFor(() => expect(sessionEnds()).toHaveLength(1));
      expect(sessionEnds()[0].url).toBe(`${endedOn}/Sessions/Logout`);
    }
    const waitsAt = jest.spyOn(endSession, "sessionEndsSettled");

    // Seen waiting at `at` first, so a slow step before the wait cannot pass
    // for it; nothing opens until the end is answered.
    const signInWaits = async (
      signedIn: Promise<unknown>,
      at: string,
      opens: (request: Sent) => boolean,
      whileHeld = () => {},
    ) => {
      // Observed at once: a sign-in failing early fails here, not the run.
      signedIn.catch(() => {});
      await waitFor(() => expect(waitsAt).toHaveBeenCalledWith(at));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(requests(opens)).toHaveLength(0);
      whileHeld();

      end.answer();
      await act(() =>
        within(signedIn, "the sign-in did not go on once the end settled"),
      );
      expect(requests(opens).length).toBeGreaterThan(0);
    };
    return { provider, answerEnd: end.answer, waitsAt, signInWaits };
  };

  it.each([
    [
      "a saved account",
      (p: Provider) => p.loginWithSavedCredential(SERVER, OTHER_USER.Id),
      withSavedToken,
    ],
    [
      "a password asked from the account list",
      (p: Provider) => p.loginWithPassword(SERVER, OTHER_USER.Name, "secret"),
      byPassword,
    ],
    [
      "the sign-in form",
      (p: Provider) => p.signIn(OTHER_USER.Name, "secret"),
      byPassword,
    ],
  ])(
    "lets a sign-in to %s wait for the session end still on its way",
    async (_case, signIn, opens) => {
      const { provider, signInWaits } = await holdingTheEnd();
      await provider.selectServer(SERVER);

      await signInWaits(signIn(provider), SERVER, opens);
      expect(storage.getString("token")).toBe(OTHER_TOKEN);
    },
  );

  it("lets a sign-in wait for an end on the local address of its server", async () => {
    const { provider, signInWaits } = await holdingTheEnd({ atHome: true });
    await provider.selectServer(SERVER);

    await signInWaits(
      provider.signIn(OTHER_USER.Name, "secret"),
      SERVER,
      byPassword,
    );
    expect(requests(byPassword)).toHaveLength(1);
  });

  it("lets Quick Connect wait for the session end still on its way", async () => {
    const { provider, signInWaits } = await holdingTheEnd();
    server
      .onPost(`${SERVER}/QuickConnect/Initiate`)
      .reply(200, { Code: "123456", Secret: "secret" });
    releases.push(() => provider.stopQuickConnectPolling());
    await provider.selectServer(SERVER);

    await signInWaits(
      provider.initiateQuickConnect(),
      SERVER,
      sentTo("/QuickConnect/Initiate"),
    );
    expect(requests(sentTo("/QuickConnect/Initiate"))).toHaveLength(1);
  });

  // A server only ends the sessions it holds itself.
  it("lets a sign-in to another server go while this one's end is on its way", async () => {
    const { provider } = await holdingTheEnd();
    await provider.selectServer(OTHER_SERVER);

    await act(() =>
      within(
        provider.signIn(OTHER_USER.Name, "secret"),
        "the sign-in waited for another server's end",
      ),
    );
    expect(requests(byPassword).map((request) => request.url)).toEqual([
      `${OTHER_SERVER}/Users/AuthenticateByName`,
    ]);
    expect(storage.getString("token")).toBe(OTHER_TOKEN);
  });

  // The user can pick another server while a sign-in from the form is on its
  // way. Signed in anyway, its token would be saved beside that other
  // server's address.
  const leaveTheServerWhile = async (
    provider: Provider,
    reached: () => void,
    release: () => void,
  ) => {
    await provider.selectServer(SERVER);
    const outcome = provider.signIn(OTHER_USER.Name, "secret").then(
      () => "signed in",
      () => "dropped",
    );
    await waitFor(reached);
    await provider.selectServer(OTHER_SERVER);

    release();
    expect(await act(() => within(outcome, "the sign-in did not settle"))).toBe(
      "dropped",
    );
    expect(storage.getString("token")).toBeUndefined();
    expect(storage.getString("serverUrl")).toBe(OTHER_SERVER);
  };

  it("drops a sign-in from the form once the user picked another server", async () => {
    const { provider, answerEnd, waitsAt } = await holdingTheEnd();

    await leaveTheServerWhile(
      provider,
      () => expect(waitsAt).toHaveBeenCalledWith(SERVER),
      answerEnd,
    );
    expect(requests(byPassword)).toHaveLength(0);
  });

  // Or while the server checks the password: the session it then opens is
  // held by no one, so it is ended there.
  it("drops a sign-in from the form whose server the user left during the password check", async () => {
    const { provider, answerEnd } = await holdingTheEnd();
    answerEnd();
    await act(() => sessionEndsSettled(SERVER));
    // A new token: the one saved for the account would be kept.
    const newToken = "00112233445566778899aabbccddeeff";
    const authentication = held<[number, unknown]>([
      200,
      { AccessToken: newToken, User: OTHER_USER },
    ]);
    server
      .onPost(`${SERVER}/Users/AuthenticateByName`)
      .reply(() => authentication.answered);

    await leaveTheServerWhile(
      provider,
      () => expect(requests(byPassword)).toHaveLength(1),
      authentication.answer,
    );
    await waitFor(() => expect(sessionEnds()).toHaveLength(2));
    expect(sessionEnds()[1].url).toBe(`${SERVER}/Sessions/Logout`);
    expect(tokenOf(sessionEnds()[1])).toBe(newToken);
  });

  // Moving a saved server off a legacy prefix changes its address between the
  // sign-out and the next sign-in.
  describe.each([
    [
      "a saved account",
      (p: Provider) => p.loginWithSavedCredential(LEGACY_SERVER, OTHER_USER.Id),
      withSavedToken,
    ],
    [
      "a password asked from the account list",
      (p: Provider) =>
        p.loginWithPassword(LEGACY_SERVER, OTHER_USER.Name, "secret"),
      byPassword,
    ],
  ])("lets a sign-in by %s, moving the server,", (_case, signIn, opens) => {
    const moves = () =>
      jest.spyOn(legacyServerAddress, "migrateLegacyServerAddress");

    // A sign-out while the move is on its way files its end under the
    // address as saved, which the address moved to does not reach.
    it("wait for an end filed during the move", async () => {
      const { provider, signInWaits } = await holdingTheEnd({
        savedOn: LEGACY_SERVER,
        signOutFirst: false,
      });
      const move = held(SERVER);
      const migrated = moves().mockReturnValue(move.answered);
      const signedIn = signIn(provider);
      await waitFor(() => expect(migrated).toHaveBeenCalled());
      await signOut(provider.logout);
      await waitFor(() => expect(sessionEnds()).toHaveLength(1));
      expect(sessionEnds()[0].url).toBe(`${LEGACY_SERVER}/Sessions/Logout`);

      move.answer();
      await signInWaits(signedIn, SERVER, opens);
    });

    it("wait for an end on the address it was saved on, before moving it", async () => {
      const { provider, signInWaits } = await holdingTheEnd({
        savedOn: LEGACY_SERVER,
      });
      const migrated = moves().mockResolvedValue(SERVER);

      // Moving takes the custom headers the end goes out with to the new
      // address: a gateway would turn the end away without them.
      await signInWaits(signIn(provider), LEGACY_SERVER, opens, () =>
        expect(migrated).not.toHaveBeenCalled(),
      );
      expect(migrated).toHaveBeenCalled();
    });

    it("wait for an end on the address it moves to", async () => {
      const { provider, signInWaits } = await holdingTheEnd();
      const migrated = moves().mockResolvedValue(SERVER);

      await signInWaits(signIn(provider), SERVER, opens);
      expect(migrated).toHaveBeenCalled();
    });
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

    await signOut(logout);

    await waitFor(() => expect(sessionEnds()).toHaveLength(1));
    expect(tokenOf(sessionEnds()[0])).toBe(TOKEN);
  });

  it("still refreshes the picture of a saved account", async () => {
    signedInAtLaunch();
    await saveAccount({ primaryImageTag: "old-picture" });
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
