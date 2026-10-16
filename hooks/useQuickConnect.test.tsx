import { act, cleanup, renderHook } from "@testing-library/react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useQuickConnect } from "./useQuickConnect";

const INITIATE = /\/QuickConnect\/Initiate$/;
const CONNECT = /\/QuickConnect\/Connect(?:\?|$)/;
const AUTHENTICATE = /\/Users\/AuthenticateWithQuickConnect$/;
const headers = { authorization: "MediaBrowser test-device" };
const authentication = {
  AccessToken: "new-token",
  User: { Id: "user-1", Name: "Alice" },
};
const code = { Code: "123456", Secret: "secret-1" };
const replacement = { Code: "654321", Secret: "secret-2" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makeQuickConnectApi() {
  const api = makeApi();
  api.mock.onPost(INITIATE).reply(200, code);
  api.mock.onGet(CONNECT).reply(200, { Authenticated: false });
  api.mock.onPost(AUTHENTICATE).reply(200, authentication);
  return api;
}

const renderQuickConnect = async (api = makeQuickConnectApi()) => {
  const onAuthenticated = jest.fn();
  const view = await renderHook(
    ({ sourceApi }: { sourceApi: typeof api | null }) =>
      useQuickConnect({ api: sourceApi, headers, onAuthenticated }),
    { initialProps: { sourceApi: api } },
  );
  return { ...view, api, onAuthenticated };
};

type HookResult = Awaited<ReturnType<typeof renderQuickConnect>>["result"];

async function initiate(result: HookResult) {
  let issuedCode: string | undefined;
  await act(async () => {
    issuedCode = await result.current.initiateQuickConnect();
  });
  return issuedCode;
}

const advance = async (milliseconds = 1000) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(milliseconds);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("useQuickConnect", () => {
  test("waits for a server-issued code before polling", async () => {
    const { result, api, onAuthenticated } = await renderQuickConnect();
    expect(result.current.quickConnectStatus).toBe("idle");
    await advance(3000);
    expect(api.mock.history.get).toHaveLength(0);

    expect(await initiate(result)).toBe("123456");
    expect(result.current.quickConnectStatus).toBe("waiting");
    expect(api.mock.history.post[0].headers?.authorization).toBe(
      headers.authorization,
    );
    await advance();

    expect(api.mock.history.get).toHaveLength(1);
    expect(api.mock.history.get[0].url).toContain("Secret=secret-1");
    expect(result.current.quickConnectStatus).toBe("waiting");
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test("does nothing without an API", async () => {
    const { result, rerender, api } = await renderQuickConnect();
    await rerender({ sourceApi: null });

    expect(await initiate(result)).toBeUndefined();
    await advance(3000);
    expect(result.current.quickConnectStatus).toBe("idle");
    expect(api.mock.history.post).toHaveLength(0);
    expect(api.mock.history.get).toHaveLength(0);
  });

  test.each([
    [400, "expired"],
    [404, "expired"],
    [401, "disabled"],
  ] as const)(
    "reports polling HTTP %i as %s and stops polling",
    async (status, expected) => {
      const { result, api, onAuthenticated } = await renderQuickConnect();
      api.mock.onGet(CONNECT).reply(status);
      await initiate(result);

      await advance();
      expect(result.current.quickConnectStatus).toBe(expected);
      await advance(5000);

      expect(api.mock.history.get).toHaveLength(1);
      expect(onAuthenticated).not.toHaveBeenCalled();
    },
  );

  test.each([
    [400, "expired"],
    [404, "expired"],
    [401, "disabled"],
  ] as const)(
    "reports authentication HTTP %i as %s and stops polling",
    async (status, expected) => {
      const { result, api, onAuthenticated } = await renderQuickConnect();
      api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
      api.mock.onPost(AUTHENTICATE).reply(status);
      await initiate(result);

      await advance();
      expect(result.current.quickConnectStatus).toBe(expected);
      await advance(5000);

      expect(api.mock.history.get).toHaveLength(1);
      expect(api.mock.history.post).toHaveLength(2);
      expect(onAuthenticated).not.toHaveBeenCalled();
    },
  );

  test("authenticates one approved request exactly once", async () => {
    const pending = deferred<[number, typeof authentication]>();
    const { result, api, onAuthenticated } = await renderQuickConnect();
    api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
    api.mock.onPost(AUTHENTICATE).reply(() => pending.promise);
    await initiate(result);

    await advance();
    expect(result.current.quickConnectStatus).toBe("authenticating");
    await advance(3000);
    expect(api.mock.history.get).toHaveLength(1);
    expect(api.mock.history.post).toHaveLength(2);
    expect(onAuthenticated).not.toHaveBeenCalled();

    await act(async () => pending.resolve([200, authentication]));
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledWith(authentication, api);
    expect(JSON.parse(api.mock.history.post[1].data)).toEqual({
      secret: "secret-1",
    });
    expect(result.current.quickConnectStatus).toBe("signed-in");
    await advance(3000);
    expect(api.mock.history.get).toHaveLength(1);
  });

  test("keeps the successful outcome when sign-in replaces the API", async () => {
    const view = await renderQuickConnect();
    const { result, api, onAuthenticated } = view;
    const authenticatedApi = makeQuickConnectApi();
    api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
    onAuthenticated.mockImplementation(async () => {
      await view.rerender({ sourceApi: authenticatedApi });
    });
    await initiate(result);

    await advance();
    expect(result.current.quickConnectStatus).toBe("signed-in");
    await advance(3000);

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(api.mock.history.get).toHaveLength(1);
    expect(authenticatedApi.mock.history.get).toHaveLength(0);
  });

  test("does not authenticate again if applying the session fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { result, api, onAuthenticated } = await renderQuickConnect();
    api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
    onAuthenticated.mockRejectedValue(new Error("settings refresh failed"));
    await initiate(result);

    await advance();
    await advance(5000);

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(api.mock.history.get).toHaveLength(1);
    expect(api.mock.history.post).toHaveLength(2);
  });

  test("retries a transient polling failure with the same code", async () => {
    const { result, api } = await renderQuickConnect();
    api.mock.resetHandlers();
    api.mock.onPost(INITIATE).reply(200, code);
    api.mock.onGet(CONNECT).networkErrorOnce();
    api.mock.onGet(CONNECT).reply(200, { Authenticated: false });
    await initiate(result);

    await advance();
    expect(result.current.quickConnectStatus).toBe("waiting");
    await advance();

    expect(api.mock.history.get).toHaveLength(2);
    expect(api.mock.history.get[1].url).toContain("Secret=secret-1");
    expect(result.current.quickConnectStatus).toBe("waiting");
    expect(api.mock.history.post).toHaveLength(1);
  });

  test("retries authentication after a transient failure", async () => {
    const { result, api, onAuthenticated } = await renderQuickConnect();
    api.mock.resetHandlers();
    api.mock.onPost(INITIATE).reply(200, code);
    api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
    api.mock.onPost(AUTHENTICATE).networkErrorOnce();
    api.mock.onPost(AUTHENTICATE).reply(200, authentication);
    await initiate(result);

    await advance();
    expect(result.current.quickConnectStatus).toBe("waiting");
    await advance();

    expect(result.current.quickConnectStatus).toBe("signed-in");
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(api.mock.history.post).toHaveLength(3);
  });

  test("does not overlap polls while a server response is slow", async () => {
    const pending = deferred<[number, { Authenticated: boolean }]>();
    const { result, api } = await renderQuickConnect();
    api.mock.resetHandlers();
    api.mock.onPost(INITIATE).reply(200, code);
    api.mock.onGet(CONNECT).replyOnce(() => pending.promise);
    api.mock.onGet(CONNECT).reply(200, { Authenticated: false });
    await initiate(result);

    await advance(5000);
    expect(api.mock.history.get).toHaveLength(1);
    await act(async () => pending.resolve([200, { Authenticated: false }]));
    await advance();

    expect(api.mock.history.get).toHaveLength(2);
  });

  test("stops a waiting request when the code screen closes", async () => {
    const { result, api } = await renderQuickConnect();
    await initiate(result);
    await advance();

    await act(async () => result.current.stopQuickConnectPolling());
    expect(result.current.quickConnectStatus).toBe("idle");
    await advance(5000);

    expect(api.mock.history.get).toHaveLength(1);
  });
});

// Each network stage can finish after the code screen closes, another code
// replaces it, or another server is selected. Old successes must never sign
// someone in, and old errors must not disable the replacement attempt.
describe.each(["initiate", "poll", "authenticate"] as const)(
  "late %s responses",
  (stage) => {
    test.each(
      (["cancel", "replace", "change API", "unmount"] as const).flatMap(
        (action) =>
          (["success", "error"] as const).map((outcome) => ({
            action,
            outcome,
          })),
      ),
    )("ignores $outcome after $action", async ({ action, outcome }) => {
      const pending = deferred<[number, unknown]>();
      const view = await renderQuickConnect();
      const { result, api, onAuthenticated } = view;
      let oldInitiation: Promise<string | undefined> | undefined;

      if (stage === "initiate") {
        api.mock.onPost(INITIATE).reply(() => pending.promise);
        await act(async () => {
          oldInitiation = result.current.initiateQuickConnect();
        });
      } else {
        if (stage === "poll") {
          api.mock.onGet(CONNECT).reply(() => pending.promise);
        } else {
          api.mock.onGet(CONNECT).reply(200, { Authenticated: true });
          api.mock.onPost(AUTHENTICATE).reply(() => pending.promise);
        }
        await initiate(result);
        await advance();
      }

      if (action === "cancel") {
        await act(async () => result.current.stopQuickConnectPolling());
      } else if (action === "replace") {
        api.mock.onPost(INITIATE).reply(200, replacement);
        api.mock.onGet(CONNECT).reply(200, { Authenticated: false });
        expect(await initiate(result)).toBe(replacement.Code);
      } else if (action === "change API") {
        await view.rerender({ sourceApi: makeQuickConnectApi() });
      } else {
        await view.unmount();
      }

      const postsBeforeAnswer = api.mock.history.post.length;
      const getsBeforeAnswer = api.mock.history.get.length;
      await act(async () => {
        pending.resolve(
          outcome === "error"
            ? [401, {}]
            : [
                200,
                stage === "initiate"
                  ? code
                  : stage === "poll"
                    ? { Authenticated: true }
                    : authentication,
              ],
        );
        if (oldInitiation) expect(await oldInitiation).toBeUndefined();
      });

      expect(onAuthenticated).not.toHaveBeenCalled();
      expect(api.mock.history.post).toHaveLength(postsBeforeAnswer);
      if (action !== "unmount") {
        expect(result.current.quickConnectStatus).toBe(
          action === "replace" ? "waiting" : "idle",
        );
      }
      await advance(3000);

      if (action === "replace") {
        const newPolls = api.mock.history.get.slice(getsBeforeAnswer);
        expect(newPolls.length).toBeGreaterThan(0);
        expect(
          newPolls.every((request) => request.url?.includes("secret-2")),
        ).toBe(true);
      } else {
        expect(api.mock.history.get).toHaveLength(getsBeforeAnswer);
      }
      expect(onAuthenticated).not.toHaveBeenCalled();
    });
  },
);
