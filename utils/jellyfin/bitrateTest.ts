import type { Api } from "@jellyfin/sdk";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { fetch } from "expo/fetch";
import {
  BITRATE_DETECTION_TTL_MS,
  BITRATE_REQUEST_TIMEOUT_MS,
  BITRATE_TEST_CACHE_CONTROL,
  BITRATE_TEST_PATH,
  BITRATE_TESTS,
  DETECTED_BITRATE_RATIO,
  IN_NETWORK_MIN_BITRATE,
  MAX_DETECTED_BITRATE,
} from "@/constants/Bitrate";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";

/**
 * What the Auto quality streams at, measured the way jellyfin-web's bitrate
 * test does.
 *
 * Kept per server address rather than once: the app moves between the
 * server's local and remote address as the Wi-Fi changes, and what one link
 * carries says nothing of the other.
 */
const detected = new Map<string, { bitrate: number; at: number }>();
const inProgress = new Map<string, Promise<number>>();

const isInServerNetwork = async (api: Api): Promise<boolean> => {
  try {
    const { data } = await getSystemApi(api).getEndpointInfo({
      timeout: BITRATE_REQUEST_TIMEOUT_MS,
    });
    return data.IsInNetwork === true;
  } catch {
    // The tests run without it, short of the floor of the server's network.
    return false;
  }
};

/** 8 bits a byte, 1000 ms a second. */
const toBitsPerSecond = (bytes: number, ms: number) =>
  Math.round((bytes * 8 * 1000) / ms);

/**
 * The rate at which the server sends `bytes`, timed from the moment the
 * headers arrive to the end of the body: the wait before them is the server's
 * latency, not the link's bandwidth. Hence expo/fetch, which resolves on the
 * headers and streams the body after them, where the SDK's axios and React
 * Native's own fetch only hand the response over once all of it is in.
 *
 * The body is read as it comes, so one still coming at the deadline is cut off
 * there and measured on what has arrived of it: on a slow link that is the
 * only measure there is. Headers that have not come by then fail the test.
 *
 * Sent with the headers of every request to the server, the user's custom
 * ones included: a gateway in front of it turns away what lacks them.
 */
const measureRate = async (api: Api, bytes: number): Promise<number> => {
  const url = api.getUri(BITRATE_TEST_PATH, { Size: bytes });
  const abort = new AbortController();
  let atDeadline = () => abort.abort();
  const deadline = setTimeout(() => atDeadline(), BITRATE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: abort.signal,
      headers: {
        Authorization: api.authorizationHeader,
        "Cache-Control": BITRATE_TEST_CACHE_CONTROL,
        ...getJellyfinHeadersForUrl(url, api.basePath),
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`The bitrate test answered ${response.status}`);
    }
    const start = performance.now();
    const reader = response.body.getReader();
    const cut: { at?: number } = {};
    atDeadline = () => {
      cut.at = performance.now();
      reader.cancel().catch(() => {});
    };
    let received = 0;
    while (cut.at === undefined) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    if (cut.at === undefined) {
      return toBitsPerSecond(bytes, performance.now() - start);
    }
    // A rate of nothing would ask the server for a stream at no bitrate.
    if (received === 0) {
      throw new Error("The bitrate test sent nothing before its deadline");
    }
    return toBitsPerSecond(received, cut.at - start);
  } finally {
    clearTimeout(deadline);
  }
};

/** What the last test measured, if one did. */
const runTests = async (api: Api): Promise<number | undefined> => {
  let rate: number | undefined;
  for (const test of BITRATE_TESTS) {
    try {
      rate = await measureRate(api, test.bytes);
    } catch {
      return rate;
    }
    if (rate < test.stopBelow) break;
  }
  return rate;
};

const detect = async (api: Api): Promise<number> => {
  const inNetwork = await isInServerNetwork(api);
  const rate = await runTests(api);
  // With nothing measured, the bitrate detected before stands as it was: it
  // already is a share of a rate.
  let bitrate =
    rate === undefined
      ? detected.get(api.basePath)?.bitrate
      : Math.round(rate * DETECTED_BITRATE_RATIO);
  if (inNetwork) bitrate = Math.max(bitrate ?? 0, IN_NETWORK_MIN_BITRATE);
  if (bitrate === undefined) {
    throw new Error("The bitrate test could not measure the server");
  }
  bitrate = Math.min(bitrate, MAX_DETECTED_BITRATE);
  detected.set(api.basePath, { bitrate, at: Date.now() });
  return bitrate;
};

/**
 * The bitrate to stream at from `api`'s server, measured again once the last
 * detection is an hour old, or when `force`d. Callers asking while one runs
 * get that one. Rejects when the server could never be measured.
 */
export const detectBitrate = (api: Api, force = false): Promise<number> => {
  const last = detected.get(api.basePath);
  if (!force && last && Date.now() - last.at <= BITRATE_DETECTION_TTL_MS) {
    return Promise.resolve(last.bitrate);
  }
  const running = inProgress.get(api.basePath);
  if (running) return running;

  const detection = detect(api).finally(() => {
    inProgress.delete(api.basePath);
  });
  inProgress.set(api.basePath, detection);
  return detection;
};
