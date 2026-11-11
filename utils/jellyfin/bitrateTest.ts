import type { Api } from "@jellyfin/sdk";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { fetch } from "expo/fetch";
import { AppState } from "react-native";
import {
  AUTO_BITRATE_MEASURES_STORAGE_KEY,
  AUTO_BITRATE_TTL_CHOICES,
  BITRATE_DETECTION_RETRY_MS,
  BITRATE_REQUEST_TIMEOUT_MS,
  BITRATE_TEST_CACHE_CONTROL,
  BITRATE_TEST_PATH,
  BITRATE_TESTS,
  MAX_DETECTED_BITRATE,
} from "@/constants/Bitrate";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { isPlainObject } from "@/utils/errors";
import { storage } from "@/utils/mmkv";
import {
  type AutoBitrateOptions,
  autoBitrateOptions,
} from "./autoBitrateOptions";

const DEFAULT_AUTO_BITRATE_OPTIONS = autoBitrateOptions(undefined);

/**
 * What a detection found: the rate measured, raw, so a new share or floor
 * from the settings applies to it without measuring again, and whether the
 * client was in the server's network.
 */
type Measure = { rate?: number; inNetwork: boolean; at: number };

/** A detection that measured nothing: why, and what it handed back. */
/**
 * A detection that measured nothing: why, and the measure that stood in for
 * it, which the settings of the moment turn into a bitrate.
 */
type Failure = {
  at: number;
  cause: string;
  fallback: Pick<Measure, "rate" | "inNetwork">;
};

/**
 * What the Auto quality streams at, measured the way jellyfin-web's bitrate
 * test does, kept per server address and per network: the app moves between
 * the server's local and remote address as the Wi-Fi changes, and one address
 * is reached at home and over cellular alike, so what one link carries says
 * nothing of another. Stored, so a launch on a network measured within the
 * settings' time does not measure it again, and a device back on a network it
 * left finds that network's measure.
 */
type Measures = Record<string, Record<string, Measure>>;
let measures: Measures = {};
let measuresLoaded = false;
const failed = new Map<string, Failure>();
const inProgress = new Map<string, Promise<number>>();

const failureKey = (basePath: string, net: string) => `${basePath}\n${net}`;

/** A measure is dropped once no setting can use it any more. */
const MEASURE_MAX_AGE_MS = Math.max(...AUTO_BITRATE_TTL_CHOICES) * 60_000;

const isMeasure = (value: unknown): value is Measure =>
  isPlainObject(value) &&
  typeof value.at === "number" &&
  typeof value.inNetwork === "boolean" &&
  (value.rate === undefined || typeof value.rate === "number");

const putMeasure = (
  target: Measures,
  server: string,
  net: string,
  measure: Measure,
) => {
  const byNetwork = target[server] ?? {};
  byNetwork[net] = measure;
  target[server] = byNetwork;
};

const loadMeasures = () => {
  if (measuresLoaded) return;
  measuresLoaded = true;
  try {
    const stored: unknown = JSON.parse(
      storage.getString(AUTO_BITRATE_MEASURES_STORAGE_KEY) ?? "{}",
    );
    if (!isPlainObject(stored)) return;
    for (const [server, byNetwork] of Object.entries(stored)) {
      if (!isPlainObject(byNetwork)) continue;
      for (const [net, measure] of Object.entries(byNetwork)) {
        if (isMeasure(measure)) putMeasure(measures, server, net, measure);
      }
    }
  } catch {
    // Unreadable, it is measured again, as Auto did before it was stored.
  }
};

const measureOn = (basePath: string, net: string): Measure | undefined => {
  loadMeasures();
  return measures[basePath]?.[net];
};

/** Keeps a measure, and drops the ones no setting can use any more. */
const keepMeasure = (basePath: string, net: string, measure: Measure) => {
  loadMeasures();
  putMeasure(measures, basePath, net, measure);
  const now = Date.now();
  const kept: Measures = {};
  for (const [server, byNetwork] of Object.entries(measures)) {
    for (const [key, value] of Object.entries(byNetwork)) {
      if (now - value.at <= MEASURE_MAX_AGE_MS) {
        putMeasure(kept, server, key, value);
      }
    }
  }
  measures = kept;
  storage.set(AUTO_BITRATE_MEASURES_STORAGE_KEY, JSON.stringify(kept));
};

/**
 * The network the device is on, as NetInfo reports it. A detection that
 * outlives it is not kept: part of it ran on the next one.
 */
let network: string | undefined;
let networkChanges = 0;
let watchingNetwork = false;

/**
 * What tells a network from another: mobile data has no address, so its
 * generation and carrier stand in for one, and a Wi-Fi's name needs the
 * location permission, so its address and subnet do without it.
 */
const networkKey = (state: NetInfoState | null | undefined) => {
  const details = state?.details as {
    ipAddress?: string;
    subnet?: string;
    ssid?: string;
    cellularGeneration?: string | null;
    carrier?: string | null;
  } | null;
  return [
    state?.type ?? "unknown",
    state?.isConnected,
    details?.ipAddress ?? "",
    details?.subnet ?? "",
    details?.ssid ?? "",
    details?.cellularGeneration ?? "",
    details?.carrier ?? "",
  ].join("|");
};

const watchNetwork = () => {
  if (watchingNetwork) return;
  watchingNetwork = true;
  NetInfo.addEventListener((state) => {
    const key = networkKey(state);
    if (network !== undefined && key !== network) networkChanges += 1;
    network = key;
  });
  // iOS may not tell a network change made while the app was away: back in
  // the foreground, the network is asked again before a measure is reused.
  AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    network = undefined;
    networkChanges += 1;
  });
};

/** The network the device is on now, asked of NetInfo when it has not said yet. */
const currentNetwork = async (): Promise<string> => {
  watchNetwork();
  if (network !== undefined) return network;
  const key = networkKey(await NetInfo.fetch());
  network ??= key;
  return network;
};

/** Before the settings read `lastDetection`: it shows this network's measure. */
export const ensureNetworkKnown = async (): Promise<void> => {
  await currentNetwork();
};

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
 * The rate at which the server sends a test body, timed from the moment the
 * headers arrive to the end of the body: the wait before them is the server's
 * latency, not the link's bandwidth. Hence expo/fetch, which resolves on the
 * headers and streams the body after them, where the SDK's axios and React
 * Native's own fetch only hand the response over once all of it is in.
 *
 * The body is read as it comes and its bytes counted: Jellyfin sends more than
 * it is asked for, a pooled buffer rounded up to a power of two (4 MiB for
 * 3 MB). One still coming at the deadline is cut off there and measured on
 * what has arrived of it: on a slow link that is the only measure there is.
 * Headers that have not come by then fail the test. Either way the request is
 * aborted at the end: cancelling the body only stops reading it, and iOS would
 * go on downloading the rest behind the next test and the stream.
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
    // A rate of nothing would ask the server for a stream at no bitrate.
    if (received === 0) {
      throw new Error("The bitrate test sent nothing before its deadline");
    }
    return toBitsPerSecond(received, (cut.at ?? performance.now()) - start);
  } finally {
    clearTimeout(deadline);
    abort.abort();
  }
};

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** What the last test measured, if one did, and why the next one failed. */
const runTests = async (
  api: Api,
): Promise<{ rate?: number; cause?: string }> => {
  let rate: number | undefined;
  for (const test of BITRATE_TESTS) {
    try {
      rate = await measureRate(api, test.bytes);
    } catch (error) {
      return { rate, cause: describeError(error) };
    }
    if (rate < test.stopBelow) break;
  }
  return { rate };
};

const toBitrate = (
  measure: Pick<Measure, "rate" | "inNetwork">,
  options: AutoBitrateOptions,
): number | undefined => {
  let bitrate =
    measure.rate === undefined
      ? undefined
      : Math.round(measure.rate * options.ratio);
  if (measure.inNetwork && options.inNetworkMinBitrate > 0) {
    bitrate = Math.max(bitrate ?? 0, options.inNetworkMinBitrate);
  }
  return bitrate === undefined
    ? undefined
    : Math.min(bitrate, MAX_DETECTED_BITRATE);
};

const failure = (cause: string) =>
  new Error(`The bitrate test could not measure the server: ${cause}`);

const detect = async (
  api: Api,
  net: string,
  options: AutoBitrateOptions,
): Promise<number> => {
  const changesAtStart = networkChanges;
  // Together: asked first, the network check put a round trip, up to its
  // timeout, before the first test.
  const [inNetwork, { rate, cause }] = await Promise.all([
    isInServerNetwork(api),
    runTests(api),
  ]);
  const sameNetwork = changesAtStart === networkChanges && network === net;
  if (rate !== undefined) {
    const measure = { rate, inNetwork, at: Date.now() };
    if (sameNetwork) {
      keepMeasure(api.basePath, net, measure);
      failed.delete(failureKey(api.basePath, net));
    }
    return toBitrate(measure, options) as number;
  }
  // With nothing measured, the rate measured before stands, with its own
  // time: stamped as new, a stale one would stand for another detection's
  // worth. The failure is remembered for a while, so the plays after it do
  // not each wait on the same tests.
  const before = sameNetwork ? measureOn(api.basePath, net) : undefined;
  const fallback = {
    rate: before?.rate,
    inNetwork: inNetwork || !!before?.inNetwork,
  };
  const bitrate = toBitrate(fallback, options);
  const why = cause ?? "no test ran";
  if (sameNetwork) {
    failed.set(failureKey(api.basePath, net), {
      at: Date.now(),
      cause: why,
      fallback,
    });
  }
  if (bitrate === undefined) throw failure(why);
  return bitrate;
};

/**
 * What the settings show of Auto for `api`'s server on the network the device
 * is on: the bitrate it streams at now from its last detection, with the
 * options of now, and when that was measured; or why the last detection
 * measured nothing, when it came after. Nothing before the network is known
 * (`ensureNetworkKnown`).
 */
export const lastDetection = (
  api: Api,
  options: AutoBitrateOptions = DEFAULT_AUTO_BITRATE_OPTIONS,
): { bitrate?: number; at?: number; failure?: string } => {
  if (network === undefined) return {};
  const measure = measureOn(api.basePath, network);
  const lastFailure = failed.get(failureKey(api.basePath, network));
  return {
    ...(measure && { bitrate: toBitrate(measure, options), at: measure.at }),
    ...(lastFailure &&
      (!measure || lastFailure.at >= measure.at) && {
        failure: lastFailure.cause,
      }),
  };
};

const resolveDetection = async (
  api: Api,
  force: boolean,
  options: AutoBitrateOptions,
): Promise<number> => {
  const net = await currentNetwork();
  const now = Date.now();
  const last = measureOn(api.basePath, net);
  if (!force && last && now - last.at <= options.ttlMs) {
    return toBitrate(last, options) as number;
  }
  const lastFailure = failed.get(failureKey(api.basePath, net));
  if (
    !force &&
    lastFailure &&
    now - lastFailure.at <= BITRATE_DETECTION_RETRY_MS
  ) {
    // With the settings of now, as the settings show it.
    const bitrate = toBitrate(lastFailure.fallback, options);
    if (bitrate === undefined) throw failure(lastFailure.cause);
    return bitrate;
  }
  if (
    AppState.currentState === "background" ||
    AppState.currentState === "inactive"
  ) {
    const before = last && toBitrate(last, options);
    if (before === undefined) {
      throw failure("the app is not in the foreground");
    }
    return before;
  }
  return detect(api, net, options);
};

/**
 * The bitrate to stream at from `api`'s server on the network the device is
 * on, measured again once that network's last detection is older than the
 * settings allow, or when `force`d. Callers asking while one runs get that
 * one. Rejects when the server could never be measured, or not lately.
 *
 * Out of the foreground nothing is measured: Android holds JS timers while
 * the app is paused, the deadline of a test with them, and a test that stalled
 * there held every Auto playback until the app came back. The detection before
 * stands there, however old.
 */
export const detectBitrate = (
  api: Api,
  force = false,
  options: AutoBitrateOptions = DEFAULT_AUTO_BITRATE_OPTIONS,
): Promise<number> => {
  const running = inProgress.get(api.basePath);
  if (running) return running;

  const detection = resolveDetection(api, force, options).finally(() => {
    inProgress.delete(api.basePath);
  });
  inProgress.set(api.basePath, detection);
  return detection;
};
