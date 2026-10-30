import { Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { makeApi } from "@/test-utils/jellyfinApi";

/** What the server does with one speed test, in the order the tests ask. */
type Answer =
  /** Sends the body over `ms`, after `wait` ms for the headers. */
  | { ms: number; wait?: number }
  /** Answers with an error of its own. */
  | { status: number }
  /** Never answers. */
  | "hang"
  /** The request fails before any answer comes back. */
  | "fail";

const mockAnswers: Answer[] = [];

const canceled = () => new Error("fetch request has been canceled");

const mockFetch = jest.fn(async (_url: string, init: RequestInit) => {
  const answer = mockAnswers.shift() ?? "fail";
  const signal = init.signal as AbortSignal;
  if (answer === "fail") {
    throw new Error("fetch failed: java.net.SocketException: Connection reset");
  }
  if (answer === "hang") {
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(canceled())),
    );
  }
  if ("status" in answer) {
    return { ok: false, status: answer.status, arrayBuffer: async () => null };
  }
  jest.advanceTimersByTime(answer.wait ?? 0);
  if (signal.aborted) throw canceled();
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => {
      jest.advanceTimersByTime(answer.ms);
      // expo/fetch cancels the body too when the request is aborted.
      if (signal.aborted) throw canceled();
      return new ArrayBuffer(0);
    },
  };
});

jest.mock("expo/fetch", () => ({
  fetch: (url: string, init: RequestInit) => mockFetch(url, init),
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);

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
  ({ setJellyfinHeaders } =
    require("@/test-utils/customHeaders") as typeof import("@/test-utils/customHeaders"));
  mockFetch.mockClear();
  mockAnswers.length = 0;
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

  // The first test stops under 500 kb/s, but 500 kB that take more than its
  // 5 s fail instead: one that finishes always measured 800 kb/s or more.
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

  test("is one that takes more than 5 s", async () => {
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

  test("whose body takes more than 5 s fails as well", async () => {
    answerEndpoint(false);
    mockAnswers.push(...bodiesAt(100), { ms: 5_001 });

    await expect(detectBitrate(api)).resolves.toBe(70_000_000);
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
