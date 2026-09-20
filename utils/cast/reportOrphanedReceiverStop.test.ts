import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import {
  setJellyfinHeaders,
  stubCustomHeaders,
} from "@/test-utils/customHeaders";

stubCustomHeaders();

// The real waits are 3 s and 15 s; the connection-loss path is about what is
// compared between the two reads, not how long it waits. Kept above zero so a
// wait sneaking into the stopped-casting path still shows as a delayed timer.
mock.module("@/constants/Cast", () => ({
  JELLYFIN_RECEIVER_CLIENT: "Chromecast",
  RECEIVER_ERROR_WINDOW_MS: 5,
  RECEIVER_MAX_QUEUE_ITEMS: 100,
  RECEIVER_STOP_GRACE_MS: 5,
  RECEIVER_LIVENESS_WINDOW_MS: 5,
}));

const { reportOrphanedReceiverStop, toReceiverDeviceName } = await import(
  "./reportOrphanedReceiverStop"
);
const { makeApi } = await import("@/test-utils/jellyfinApi");

const receiverSession = (overrides: Record<string, unknown> = {}) => ({
  Id: "session-tv",
  Client: "Chromecast",
  UserId: "user-1",
  DeviceName: "Living Room TV",
  DeviceId: "TGl2aW5nIFJvb20gVFY=",
  ApplicationVersion: "1.3.0",
  NowPlayingItem: { Id: "item-festen" },
  PlayState: { PositionTicks: 540_380_000, MediaSourceId: "source-1" },
  LastPlaybackCheckIn: "2026-09-16T19:00:12.000Z",
  ...overrides,
});

const phoneSession = {
  Id: "session-phone",
  Client: "Streamyfin",
  UserId: "user-1",
  DeviceName: "Android",
  DeviceId: "phone-1",
};

let fetchMock: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
  fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
});

afterEach(() => {
  mock.restore();
});

const ended = (
  api: ReturnType<typeof makeApi>,
  overrides: Partial<Parameters<typeof reportOrphanedReceiverStop>[0]> = {},
) => ({
  api,
  userId: "user-1",
  deviceName: "Living Room TV",
  receiverClosed: true,
  itemId: "item-festen",
  playSessionId: "play-1",
  ...overrides,
});

const sentRequest = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  };
};

describe("reportOrphanedReceiverStop", () => {
  test("reports the stop as the receiver once casting was stopped", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [phoneSession, receiverSession()]);

    expect(await reportOrphanedReceiverStop(ended(api))).toBe(true);

    const { url, headers, body } = sentRequest();
    expect(url).toBe("https://jellyfin.example.com/Sessions/Playing/Stopped");
    expect(headers.Authorization).toBe(
      'MediaBrowser Client="Chromecast", Device="Living%20Room%20TV", DeviceId="TGl2aW5nIFJvb20gVFY%3D", Version="1.3.0", Token="SECRET_TOKEN"',
    );
    expect(body).toEqual({
      ItemId: "item-festen",
      MediaSourceId: "source-1",
      PositionTicks: 540_380_000,
      PlaySessionId: "play-1",
    });
  });

  test("does not wait on a timer once casting was stopped", async () => {
    // Android does not fire delayed timers while the app is in the background,
    // and stopping a cast is usually followed by leaving the app: a delayed
    // timer on this path froze the report until the app was reopened.
    const setTimeoutSpy = spyOn(globalThis, "setTimeout");
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [receiverSession()]);

    await reportOrphanedReceiverStop(ended(api));

    const delayed = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === "number" && delay > 0,
    );
    expect(delayed).toHaveLength(0);
    expect(api.mock.history.get).toHaveLength(1);
  });

  test("leaves a session alone when the receiver reported its own stop", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Sessions/)
      .reply(200, [receiverSession({ NowPlayingItem: undefined })]);

    expect(await reportOrphanedReceiverStop(ended(api))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("only stops the session of this user on this TV", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Sessions/)
      .reply(200, [
        receiverSession({ UserId: "user-2" }),
        receiverSession({ DeviceName: "Chambre" }),
      ]);

    expect(await reportOrphanedReceiverStop(ended(api))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("leaves the receiver alone once it plays another item", async () => {
    // Someone cast something else to the TV since: that playback is live.
    const api = makeApi();
    api.mock
      .onGet(/\/Sessions/)
      .reply(200, [receiverSession({ NowPlayingItem: { Id: "item-other" } })]);

    expect(await reportOrphanedReceiverStop(ended(api))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("forwards gateway headers but never their Authorization", async () => {
    setJellyfinHeaders({
      "CF-Access-Client-Id": "gateway",
      authorization: "Basic x",
    });
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [receiverSession()]);

    await reportOrphanedReceiverStop(ended(api));

    const { headers } = sentRequest();
    expect(headers["CF-Access-Client-Id"]).toBe("gateway");
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toStartWith(
      'MediaBrowser Client="Chromecast"',
    );
  });

  test("after a connection loss, leaves a receiver that still checks in", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Sessions/)
      .replyOnce(200, [receiverSession()])
      .onGet(/\/Sessions/)
      .replyOnce(200, [
        receiverSession({ LastPlaybackCheckIn: "2026-09-16T19:00:17.000Z" }),
      ]);

    expect(
      await reportOrphanedReceiverStop(ended(api, { receiverClosed: false })),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("after a connection loss, stops a receiver that stopped checking in", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [receiverSession()]);

    expect(
      await reportOrphanedReceiverStop(ended(api, { receiverClosed: false })),
    ).toBe(true);
    expect(api.mock.history.get).toHaveLength(2);
  });

  test("after a connection loss, leaves a paused receiver alone", async () => {
    // Paused, it stops reporting progress whether it is alive or not.
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [
      receiverSession({
        PlayState: {
          PositionTicks: 1,
          MediaSourceId: "source-1",
          IsPaused: true,
        },
      }),
    ]);

    expect(
      await reportOrphanedReceiverStop(ended(api, { receiverClosed: false })),
    ).toBe(false);
    expect(api.mock.history.get).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("after a connection loss, leaves a session without a check-in time alone", async () => {
    const api = makeApi();
    api.mock
      .onGet(/\/Sessions/)
      .reply(200, [receiverSession({ LastPlaybackCheckIn: undefined })]);

    expect(
      await reportOrphanedReceiverStop(ended(api, { receiverClosed: false })),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("gives up after a connection loss once it is cancelled", async () => {
    const controller = new AbortController();
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(() => {
      // A new cast starts while the check waits for the receiver.
      controller.abort();
      return [200, [receiverSession()]];
    });

    expect(
      await reportOrphanedReceiverStop(
        ended(api, { receiverClosed: false, signal: controller.signal }),
      ),
    ).toBe(false);
    expect(api.mock.history.get).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects when the server refuses the report", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const api = makeApi();
    api.mock.onGet(/\/Sessions/).reply(200, [receiverSession()]);

    await expect(reportOrphanedReceiverStop(ended(api))).rejects.toThrow("401");
  });
});

describe("toReceiverDeviceName", () => {
  test("applies the receiver's own cleanup of the Cast device name", () => {
    expect(toReceiverDeviceName('Salon (TV) — 55"')).toBe("Salon TV  55");
  });
});
