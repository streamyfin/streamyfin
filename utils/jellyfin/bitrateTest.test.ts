import { Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { makeApi } from "@/test-utils/jellyfinApi";

/** What the server does with one speed test, in the order the tests ask. */
type Answer =
  /**
   * Sends the body in `parts` equal parts over `ms`, after `wait` ms for the
   * headers: `bytes` of it, or the size asked for.
   */
  | { ms: number; wait?: number; parts?: number; bytes?: number }
  /** Answers with an error of its own. */
  | { status: number }
  /** Never answers. */
  | "hang"
  /** The request fails before any answer comes back. */
  | "fail";

const mockAnswers: Answer[] = [];
/** How many bodies were cancelled while they were still coming. */
let mockCanceledBodies = 0;
/** The abort signal of every request, in order. */
const mockSignals: AbortSignal[] = [];
/** What NetInfo calls when the device changes networks. */
const mockNetworkListeners: ((state: unknown) => void)[] = [];
/** The network the device is on. */
let mockNetworkState: unknown;
/** What the app stores, kept across a relaunch (`relaunch`). */
const mockStored = new Map<string, string>();

const canceled = () => new Error("fetch request has been canceled");

/** A body read the way a stream reads it, part after part. */
const streamedBody = (size: number, ms: number, parts: number) => {
  let sent = 0;
  let stopped = false;
  return {
    getReader: () => ({
      read: async () => {
        if (!stopped && sent < parts) {
          jest.advanceTimersByTime(ms / parts);
          // The deadline came while this part was on its way: it never does.
          if (!stopped) {
            sent += 1;
            return { done: false, value: new Uint8Array(size / parts) };
          }
        }
        return { done: true, value: undefined };
      },
      cancel: async () => {
        if (!stopped && sent < parts) mockCanceledBodies += 1;
        stopped = true;
      },
    }),
  };
};

const mockFetch = jest.fn(async (url: string, init: RequestInit) => {
  const answer = mockAnswers.shift() ?? "fail";
  const signal = init.signal as AbortSignal;
  mockSignals.push(signal);
  if (answer === "fail") {
    throw new Error("fetch failed: java.net.SocketException: Connection reset");
  }
  if (answer === "hang") {
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(canceled())),
    );
  }
  if ("status" in answer) {
    return { ok: false, status: answer.status, body: null };
  }
  jest.advanceTimersByTime(answer.wait ?? 0);
  if (signal.aborted) throw canceled();
  const size = answer.bytes ?? Number(/[?&]Size=(\d+)/.exec(url)?.[1]);
  return {
    ok: true,
    status: 200,
    body: streamedBody(size, answer.ms, answer.parts ?? 1),
  };
});

jest.mock("expo/fetch", () => ({
  fetch: (url: string, init: RequestInit) => mockFetch(url, init),
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/mmkv", () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => mockStored.set(key, value),
    remove: (key: string) => mockStored.delete(key),
  },
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    // NetInfo calls a new listener with the current state soon after it
    // subscribes, then with every change.
    addEventListener: (listener: (state: unknown) => void) => {
      mockNetworkListeners.push(listener);
      if (mockNetworkState !== undefined) listener(mockNetworkState);
      return () => {};
    },
    fetch: async () => mockNetworkState,
  },
}));

/** The device on a network, as NetInfo tells it. */
const joinNetwork = (type: "wifi" | "cellular", ipAddress?: string) => {
  mockNetworkState = {
    type,
    isConnected: true,
    details: ipAddress ? { ipAddress } : {},
  };
  for (const listener of mockNetworkListeners) listener(mockNetworkState);
};

const SERVER = "https://jellyfin.example.com";
const TEST_SIZES = [500_000, 1_000_000, 3_000_000];

/** The body of each test in turn, sent at the rate given in Mb/s. */
const bodiesAt = (...rates: number[]): { ms: number }[] =>
  rates.map((rate, index) => ({
    ms: (TEST_SIZES[index] * 8) / (rate * 1_000),
  }));

const requestedSizes = () =>
  mockFetch.mock.calls.map(([url]) => Number(/[?&]Size=(\d+)/.exec(url)?.[1]));

let detectBitrate: typeof import("./bitrateTest").detectBitrate;
let AppState: typeof import("react-native").AppState;
let setJellyfinHeaders: typeof import("@/test-utils/customHeaders").setJellyfinHeaders;
let api: ReturnType<typeof makeApi>;

/** What /System/Endpoint says, or that it fails. */
const answerEndpoint = (
  isInNetwork: boolean | "fail",
  target: { mock: MockAdapter; basePath: string } = api,
) => {
  const route = target.mock.onGet(`${target.basePath}/System/Endpoint`);
  if (isInNetwork === "fail") route.networkError();
  else route.reply(200, { IsInNetwork: isInNetwork, IsLocal: isInNetwork });
};

beforeEach(() => {
  jest.useFakeTimers();
  // What was detected is kept for the session: every test starts without it.
  jest.resetModules();
  ({ detectBitrate } =
    require("./bitrateTest") as typeof import("./bitrateTest"));
  ({ AppState } = require("react-native") as typeof import("react-native"));
  Object.defineProperty(AppState, "currentState", {
    value: "active",
    configurable: true,
    writable: true,
  });
  ({ setJellyfinHeaders } =
    require("@/test-utils/customHeaders") as typeof import("@/test-utils/customHeaders"));
  mockFetch.mockClear();
  mockAnswers.length = 0;
  mockCanceledBodies = 0;
  mockSignals.length = 0;
  mockNetworkListeners.length = 0;
  mockStored.clear();
  // The home Wi-Fi, unless a test moves the device.
  mockNetworkState = {
    type: "wifi",
    isConnected: true,
    details: { ipAddress: "192.168.1.10" },
  };
  api = makeApi();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the speed tests", () => {
  test("ask for 500 kB, then 1 MB, then 3 MB while the link keeps up", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });

  test("stop after the 1 MB test under 20 Mb/s", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 16));

    await expect(detectBitrate(api)).resolves.toBe(11_200_000);

    expect(requestedSizes()).toEqual([500_000, 1_000_000]);
  });

  test("go on to the 3 MB test at 20 Mb/s", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 20, 30));

    await expect(detectBitrate(api)).resolves.toBe(21_000_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });

  // 500 kB that arrive within the 5 s of the first test came at 800 kb/s or
  // more, over its 500 kb/s floor.
  test("go on after a first test that finishes, even at the slowest", async () => {
    answerEndpoint(false);
    mockAnswers.push({ ms: 4_999 }, ...bodiesAt(100, 100, 100).slice(1));

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });

  // Under 50 Mb/s the 3 MB test stops the detection, and so does any rate:
  // there is no test after it.
  test("end with the 3 MB test, whatever it measures", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 48));

    await expect(detectBitrate(api)).resolves.toBe(33_600_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });

  // The wait for the headers is the server's latency, not its bandwidth:
  // counted in, 1 MB at 100 Mb/s behind 2 s of it would read as 3.8 Mb/s.
  test("time the body from the moment its headers arrive", async () => {
    answerEndpoint(false);
    mockAnswers.push(
      ...bodiesAt(100, 100, 100).map((body) => ({ ...body, wait: 2_000 })),
    );

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });

  test("send the user's custom headers with every test", async () => {
    // A gateway in front of the server turns away whatever lacks them.
    setJellyfinHeaders({ "CF-Access-Client-Id": "client-id" }, SERVER);
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await detectBitrate(api);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    for (const [url, init] of mockFetch.mock.calls) {
      expect(url).toMatch(`${SERVER}/Playback/BitrateTest?Size=`);
      expect(init.headers).toEqual({
        Authorization: api.authorizationHeader,
        "Cache-Control": "no-cache, no-store",
        "CF-Access-Client-Id": "client-id",
      });
    }
  });
});

describe("the detected bitrate", () => {
  test("is 70 % of the rate measured", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 40));

    await expect(detectBitrate(api)).resolves.toBe(28_000_000);
  });

  test("never goes past what the server reads as an Int32", async () => {
    answerEndpoint(false);
    // 3 MB in a millisecond is 24 Gb/s.
    mockAnswers.push({ ms: 1 }, { ms: 1 }, { ms: 1 });

    await expect(detectBitrate(api)).resolves.toBe(2_147_483_647);
  });

  test("is at least 140 Mb/s in the server's network", async () => {
    answerEndpoint(true);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api)).resolves.toBe(140_000_000);
  });

  test("keeps more than 140 Mb/s when the server's network carries it", async () => {
    answerEndpoint(true);
    mockAnswers.push(...bodiesAt(400, 400, 400));

    await expect(detectBitrate(api)).resolves.toBe(280_000_000);
  });

  test("gets no floor outside the server's network", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
  });

  test("is measured without the network information when /System/Endpoint fails", async () => {
    answerEndpoint("fail");
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual(TEST_SIZES);
  });
});

// On a slow link a test runs out of time before its body is in: what arrived
// by then is the only measure there is.
describe("a test still running at its 5 s", () => {
  // 500 kB at 500 kb/s take 8 s. By the 5 s, 49 parts of 6.25 kB are in: the
  // 50th was due at the deadline.
  test("is measured on what arrived, and under 500 kb/s ends at the first test", async () => {
    answerEndpoint(false);
    mockAnswers.push({ ms: 8_000, parts: 80 });

    await expect(detectBitrate(api)).resolves.toBe(343_000);

    expect(requestedSizes()).toEqual([500_000]);
    expect(mockCanceledBodies).toBe(1);
  });

  // The 1 MB test starts 40 ms in, once the first one is done: 49 parts of
  // 12.5 kB arrive in its 5 s, 980 kb/s.
  test("is measured on what arrived, and under 20 Mb/s ends at the second test", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), { ms: 8_000, parts: 80 });

    await expect(detectBitrate(api)).resolves.toBe(686_000);

    expect(requestedSizes()).toEqual([500_000, 1_000_000]);
    expect(mockCanceledBodies).toBe(1);
  });

  // Headers 4 s late leave the body 1 s: 9 parts of 50 kB, 3.6 Mb/s.
  test("is measured over the time since its headers came", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), { wait: 4_000, ms: 2_000, parts: 20 });

    await expect(detectBitrate(api)).resolves.toBe(2_520_000);
  });

  // A rate of nothing would ask the server for a stream at no bitrate at all.
  test("has failed when nothing of its body arrived", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), { wait: 4_950, ms: 2_000 });

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual([500_000, 1_000_000]);
  });
});

describe("a failed test", () => {
  test("hands back the rate measured before it", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), "fail");

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    expect(requestedSizes()).toEqual([500_000, 1_000_000]);
  });

  test("is one the server answers with an error status", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), { status: 401 });

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
  });

  test("is one whose headers do not come within 5 s", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), "hang");

    let detected: number | undefined;
    void detectBitrate(api).then((bitrate) => {
      detected = bitrate;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4_999);
    expect(detected).toBeUndefined();

    await jest.advanceTimersByTimeAsync(1);
    expect(detected).toBe(70_000_000);
  });

  test("hands back the bitrate detected before when it is the first", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), "fail");
    await detectBitrate(api);

    // Reused as it was found: it already is 70 % of what was measured.
    await expect(detectBitrate(api, true)).resolves.toBe(70_000_000);
  });

  test("leaves nothing to detect when nothing was ever measured", async () => {
    answerEndpoint(false);
    mockAnswers.push("fail");

    await expect(detectBitrate(api)).rejects.toThrow();
  });

  test("still gives 140 Mb/s in the server's network", async () => {
    answerEndpoint(true);
    mockAnswers.push("fail");

    await expect(detectBitrate(api)).resolves.toBe(140_000_000);
  });
});

describe("a detection", () => {
  test("is reused for an hour", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api);

    jest.advanceTimersByTime(59 * 60_000);

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("is measured again once the hour is over", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api);

    jest.advanceTimersByTime(61 * 60_000);

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });

  test("is measured again within the hour when forced", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api);

    await expect(detectBitrate(api, true)).resolves.toBe(7_000_000);
  });

  test("in progress is shared by every caller", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));

    const detections = await Promise.all([
      detectBitrate(api),
      detectBitrate(api),
      // A forced one gets the detection under way: it is a fresh one.
      detectBitrate(api, true),
    ]);

    expect(detections).toEqual([70_000_000, 70_000_000, 70_000_000]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(api.mock.history.get).toHaveLength(1);
  });

  // The app moves between the server's local and remote address as the Wi-Fi
  // changes, and what one link carries says nothing of the other.
  test("belongs to the address it was measured at", async () => {
    const axiosInstance = axios.create();
    const lan = Object.assign(
      new Jellyfin({
        clientInfo: { name: "streamyfin-tests", version: "0.0.0" },
        deviceInfo: { name: "test-device", id: "device-1" },
      }).createApi("http://192.168.1.20:8096", "SECRET_TOKEN", axiosInstance),
      { mock: new MockAdapter(axiosInstance) },
    );
    answerEndpoint(false);
    answerEndpoint(false, lan);
    mockAnswers.push(...bodiesAt(10, 10), ...bodiesAt(400, 400, 400));

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
    await expect(detectBitrate(lan)).resolves.toBe(280_000_000);
    await expect(detectBitrate(api)).resolves.toBe(7_000_000);

    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

describe("a test's size", () => {
  // Jellyfin answers from a pooled buffer, a power of two: 4 MiB for the
  // 3 MB test. Timed against the 3 MB asked for, 100 Mb/s read as 71.5.
  test("is the bytes the server sent, not the ones asked for", async () => {
    answerEndpoint(false);
    mockAnswers.push(
      ...[524_288, 1_048_576, 4_194_304].map((bytes) => ({
        bytes,
        ms: (bytes * 8) / (100 * 1_000),
      })),
    );

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
  });
});

describe("a test's request", () => {
  // Cancelling the body only stops reading it: iOS goes on downloading the
  // rest of the test behind the next one, and behind the stream.
  test("is aborted when its deadline cuts the body", async () => {
    answerEndpoint(false);
    mockAnswers.push({ ms: 10_000, parts: 10 });

    await detectBitrate(api);

    expect(mockSignals).toHaveLength(1);
    expect(mockSignals[0].aborted).toBe(true);
  });

  test("is aborted when the server answers with an error", async () => {
    answerEndpoint(false);
    mockAnswers.push({ status: 403 });

    await expect(detectBitrate(api)).rejects.toThrow();

    expect(mockSignals[0].aborted).toBe(true);
  });
});

describe("a detection that measures nothing", () => {
  // It came back with the earlier detection stamped as new, so a stale one,
  // even a floor from another network, stood for another hour.
  test("leaves the earlier detection its own time", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), "fail", ...bodiesAt(10, 10));
    await detectBitrate(api);
    jest.advanceTimersByTime(61 * 60_000);
    await expect(detectBitrate(api)).resolves.toBe(70_000_000);

    jest.advanceTimersByTime(3 * 60_000);

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  // Every play repeated the endpoint and the first test, with their timeouts,
  // before playing at Max anyway.
  test("is remembered for two minutes, with its cause", async () => {
    answerEndpoint(false);
    mockAnswers.push({ status: 403 }, ...bodiesAt(10, 10));

    await expect(detectBitrate(api)).rejects.toThrow("403");
    jest.advanceTimersByTime(119_000);
    await expect(detectBitrate(api)).rejects.toThrow("403");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_000);

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });
});

describe("a detection on another network", () => {
  // One server address at home and on 4G: the home measure, or the floor of
  // the server's network, played over cellular for up to an hour.
  test("is measured again once the device changes networks", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    joinNetwork("wifi", "192.168.1.10");
    await detectBitrate(api);

    joinNetwork("cellular");

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });

  test("is kept when the network NetInfo first reports is the one it ran on", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    joinNetwork("wifi", "192.168.1.10");

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("that ends after the change is not kept for the new one", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    joinNetwork("wifi", "192.168.1.10");
    const first = detectBitrate(api);
    joinNetwork("cellular");
    await first;

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });
});

describe("a detection out of the foreground", () => {
  afterEach(() => {
    Object.defineProperty(AppState, "currentState", { value: "active" });
  });

  // Android holds JS timers while the app is paused, the 5 s deadline with
  // them: a stalled test held every Auto playback until the app came back.
  test("does not measure, and the detection before stands", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);
    jest.advanceTimersByTime(61 * 60_000);
    Object.defineProperty(AppState, "currentState", { value: "background" });

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("does not measure when none was made before", async () => {
    Object.defineProperty(AppState, "currentState", { value: "background" });

    await expect(detectBitrate(api)).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("the network check", () => {
  // Asked first, it put a round trip, up to its 5 s timeout, before the tests.
  test("runs alongside the first test", async () => {
    let answer: (value: [number, unknown]) => void = () => {};
    api.mock
      .onGet(`${api.basePath}/System/Endpoint`)
      .reply(() => new Promise((resolve) => (answer = resolve)));
    mockAnswers.push(...bodiesAt(100, 100, 100));

    const detection = detectBitrate(api);
    await jest.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalled();
    answer([200, { IsInNetwork: false }]);
    await expect(detection).resolves.toBe(70_000_000);
  });
});

describe("the Auto settings", () => {
  const settings = {
    ratio: 0.5,
    ttlMs: 15 * 60_000,
    inNetworkMinBitrate: 80_000_000,
  };

  test("give the share of the rate a stream takes", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api, false, settings)).resolves.toBe(50_000_000);
  });

  test("give the floor of the server's network", async () => {
    answerEndpoint(true);
    mockAnswers.push(...bodiesAt(100, 100, 100));

    await expect(detectBitrate(api, false, settings)).resolves.toBe(80_000_000);
  });

  test("set no floor with a floor of nothing", async () => {
    answerEndpoint(true);
    mockAnswers.push(...bodiesAt(100, 10));

    await expect(
      detectBitrate(api, false, { ...settings, inNetworkMinBitrate: 0 }),
    ).resolves.toBe(5_000_000);
  });

  // The rate is kept, not the bitrate made of it: a new share needs no test.
  test("apply to a detection already made", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    await expect(detectBitrate(api, false, settings)).resolves.toBe(50_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("give how long a detection is used", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api, false, settings);

    jest.advanceTimersByTime(16 * 60_000);

    await expect(detectBitrate(api, false, settings)).resolves.toBe(5_000_000);
  });
});

describe("the last detection", () => {
  let lastDetection: typeof import("./bitrateTest").lastDetection;
  beforeEach(() => {
    ({ lastDetection } =
      require("./bitrateTest") as typeof import("./bitrateTest"));
  });

  test("is nothing before the first", () => {
    expect(lastDetection(api)).toEqual({});
  });

  // What the settings show: the bitrate Auto streams at now, which a new
  // share gives without measuring again.
  test("gives the bitrate Auto streams at, with the settings of now, and when it was measured", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    expect(lastDetection(api)).toEqual({
      bitrate: 70_000_000,
      at: Date.now(),
    });
    expect(
      lastDetection(api, {
        ratio: 0.5,
        ttlMs: 60_000,
        inNetworkMinBitrate: 0,
      }).bitrate,
    ).toBe(50_000_000);
  });

  test("gives why the last one measured nothing", async () => {
    answerEndpoint(false);
    mockAnswers.push({ status: 403 });
    await detectBitrate(api).catch(() => {});

    expect(lastDetection(api).failure).toContain("403");
  });
});

/** The app quit and opened again: the module starts over, what it stored stays. */
const relaunch = () => {
  jest.resetModules();
  mockNetworkListeners.length = 0;
  ({ detectBitrate } =
    require("./bitrateTest") as typeof import("./bitrateTest"));
  ({ AppState } = require("react-native") as typeof import("react-native"));
};

describe("a detection across launches", () => {
  // It lived in memory only: every launch measured again at the first play.
  test("is kept on the same network while its time lasts", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    relaunch();

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("is measured again on another network", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api);

    relaunch();
    joinNetwork("cellular");

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });

  test("is measured again once its time is over", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    await detectBitrate(api);
    jest.advanceTimersByTime(61 * 60_000);

    relaunch();

    await expect(detectBitrate(api)).resolves.toBe(7_000_000);
  });

  // Out to 4G and home again within the hour: the home measure still holds.
  test("is found again on a network the device comes back to", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100), ...bodiesAt(10, 10));
    joinNetwork("wifi", "192.168.1.10");
    await detectBitrate(api);
    joinNetwork("cellular");
    await detectBitrate(api);

    joinNetwork("wifi", "192.168.1.10");

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  test("shows in the settings after a launch", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    relaunch();
    const bitrateTest =
      require("./bitrateTest") as typeof import("./bitrateTest");
    await bitrateTest.ensureNetworkKnown();

    expect(bitrateTest.lastDetection(api).bitrate).toBe(70_000_000);
  });
});

describe("a rate a playback showed", () => {
  let bitrateTest: typeof import("./bitrateTest");
  beforeEach(() => {
    bitrateTest = require("./bitrateTest") as typeof import("./bitrateTest");
  });

  // A stream that stalled carried less than the speed test said: the next
  // playback on that network starts from what the stream showed.
  test("is what the next playback on the network starts from", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    bitrateTest.keepPlaybackRate(api, 5_000_000);

    await expect(detectBitrate(api)).resolves.toBe(3_500_000);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("is kept across launches", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);
    bitrateTest.keepPlaybackRate(api, 5_000_000);

    relaunch();

    await expect(detectBitrate(api)).resolves.toBe(3_500_000);
  });

  test("leaves the minimum of the server's network in place", async () => {
    answerEndpoint(true);
    mockAnswers.push(...bodiesAt(100, 100, 100));
    await detectBitrate(api);

    bitrateTest.keepPlaybackRate(api, 5_000_000);

    await expect(detectBitrate(api)).resolves.toBe(140_000_000);
  });

  test("is not kept before the network is known", async () => {
    bitrateTest.keepPlaybackRate(api, 5_000_000);
    await bitrateTest.ensureNetworkKnown();

    expect(bitrateTest.lastDetection(api)).toEqual({});
  });
});
