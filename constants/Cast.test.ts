import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RECEIVER_LOAD_TIMEOUT_MS,
  RECEIVER_MAX_QUEUE_ITEMS,
  RECEIVER_NEXT_ITEM_WAIT_MS,
  RECEIVER_UNCAPPED_BITRATE,
} from "./Cast";

const ANDROID =
  "modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast";
const IOS = "modules/mpv-player/ios/Cast";

const read = (path: string) =>
  readFileSync(join(__dirname, "..", path), "utf8");

/** The number a native declaration holds, its digit separators dropped. */
const declared = (path: string, pattern: RegExp): number => {
  const match = read(path).match(pattern);
  if (!match) throw new Error(`${pattern} not found in ${path}`);
  return Number(match[1].replaceAll("_", ""));
};

// The native Cast engines and receiver readers speak to the same receiver as
// the TypeScript sender, so they wait as long, page a queue the same way and
// state the same cap. Nothing but this test keeps the native copies in step.
describe("native mirrors of constants/Cast.ts", () => {
  test("the Android engine waits RECEIVER_LOAD_TIMEOUT_MS for a load", () => {
    expect(
      declared(
        `${ANDROID}/engine/CastEngineConstants.kt`,
        /LOAD_TIMEOUT_MS: Long = ([\d_]+)L/,
      ),
    ).toBe(RECEIVER_LOAD_TIMEOUT_MS);
  });

  test("the iOS engine waits RECEIVER_LOAD_TIMEOUT_MS for a load", () => {
    expect(
      declared(
        `${IOS}/CastEngineConstants.swift`,
        /loadTimeoutMs: Double = ([\d_]+)/,
      ),
    ).toBe(RECEIVER_LOAD_TIMEOUT_MS);
  });

  test("both engines append RECEIVER_MAX_QUEUE_ITEMS items per PlayLast", () => {
    expect([
      declared(
        `${ANDROID}/engine/CastEngineConstants.kt`,
        /MAX_QUEUE_ITEMS: Int = (\d+)/,
      ),
      declared(`${IOS}/CastEngineConstants.swift`, /maxQueueItems = (\d+)/),
    ]).toEqual([RECEIVER_MAX_QUEUE_ITEMS, RECEIVER_MAX_QUEUE_ITEMS]);
  });

  // The music player reads a receiver between two tracks as the engines do.
  test("both engines wait RECEIVER_NEXT_ITEM_WAIT_MS for the next item", () => {
    expect([
      declared(
        `${ANDROID}/engine/CastEngineConstants.kt`,
        /NEXT_ITEM_WAIT_MS: Long = ([\d_]+)L/,
      ),
      declared(
        `${IOS}/CastEngineConstants.swift`,
        /nextItemWaitMs: Double = ([\d_]+)/,
      ),
    ]).toEqual([RECEIVER_NEXT_ITEM_WAIT_MS, RECEIVER_NEXT_ITEM_WAIT_MS]);
  });

  // Native only, with no TypeScript twin: the two engines still tick alike.
  test("both engines tick at the same pace", () => {
    expect(
      declared(
        `${ANDROID}/engine/CastEngineConstants.kt`,
        /PROGRESS_INTERVAL_MS: Long = ([\d_]+)L/,
      ),
    ).toBe(
      declared(
        `${IOS}/CastEngineConstants.swift`,
        /progressIntervalMs: Double = ([\d_]+)/,
      ),
    );
  });

  test("both receiver readers send RECEIVER_UNCAPPED_BITRATE", () => {
    expect([
      declared(
        `${ANDROID}/receiver/ReceiverProtocol.kt`,
        /UNCAPPED_BITRATE = ([\d_]+)L/,
      ),
      declared(
        `${IOS}/ReceiverProtocol.swift`,
        /uncappedBitrate: Int64 = ([\d_]+)/,
      ),
    ]).toEqual([RECEIVER_UNCAPPED_BITRATE, RECEIVER_UNCAPPED_BITRATE]);
  });
});
