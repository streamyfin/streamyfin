import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import {
  ADAPTIVE_END_MARGIN_SECONDS,
  ADAPTIVE_FULL_CACHE_SHARE,
  ADAPTIVE_GRACE_MS,
  ADAPTIVE_LOW_CACHE_MS,
  ADAPTIVE_LOW_CACHE_SECONDS,
  ADAPTIVE_MIN_BITRATE,
  ADAPTIVE_MIN_STEP,
  ADAPTIVE_PROBE_AFTER_MS,
  ADAPTIVE_PROBE_CACHE_SHARE,
  ADAPTIVE_PROBE_MAX_DELAY_MS,
  ADAPTIVE_RETRY_AFTER_FAILURE_MS,
  ADAPTIVE_STALL_BUDGET_MS,
  ADAPTIVE_STALL_WINDOW_MS,
  ADAPTIVE_STEP_DOWN_FACTOR,
  ADAPTIVE_STEP_UP_MARGIN,
  ADAPTIVE_THROUGHPUT_MIN_SPAN_MS,
  ADAPTIVE_THROUGHPUT_WINDOW_MS,
} from "@/constants/Bitrate";
import { BITRATES } from "@/constants/Playback";
import type { PlayMethod } from "@/utils/jellyfin/playMethod";

/**
 * What a stream carries, in bits/s: the transcode's video and audio
 * bitrates, no more than the file's; the file's own when it plays as is or
 * remuxed, as a remux copies the file whatever cap its address carries.
 */
export const streamBitrateOf = (
  playMethod: PlayMethod,
  mediaSource: Pick<MediaSourceInfo, "Bitrate" | "TranscodingUrl">,
): number | undefined => {
  const file = mediaSource.Bitrate ?? undefined;
  if (playMethod !== "Transcode") return file;
  const query = new URLSearchParams(
    mediaSource.TranscodingUrl?.split("?")[1] ?? "",
  );
  const transcode =
    Number(query.get("VideoBitrate") ?? 0) +
    Number(query.get("AudioBitrate") ?? 0);
  if (!Number.isFinite(transcode) || transcode <= 0) return file;
  return file === undefined ? transcode : Math.min(transcode, file);
};

/** The stream a playback plays now, as Auto asked for it. */
export type AdaptiveStream = {
  now: number;
  /** The cap the stream was asked at; none sets no cap. */
  cap: number | undefined;
  /** What the stream carries, in bits/s: the transcode's bitrate, or the file's. */
  streamBitrate: number | undefined;
  /** The file's own bitrate: a stream at it plays the file itself. */
  mediaBitrate: number | undefined;
  /** How many seconds of media the player reads ahead. */
  cacheTarget: number;
};

/** A progress tick, in seconds of media. */
export type AdaptiveTick = {
  now: number;
  position: number;
  duration: number;
  cacheSeconds: number;
};

export type AdaptiveAction =
  /** Ask for the stream again at `cap`; `throughput` is what the link carried. */
  | { kind: "stepDown"; cap: number; throughput?: number }
  /** Measure the link, then hand the bitrate to `probeResult`. */
  | { kind: "probe" }
  /** Ask for the stream again at `cap`, which the link `measured` allows. */
  | { kind: "stepUp"; cap: number; measured: number };

type Sample = { at: number; position: number; cache: number };
type Stall = { from: number; to?: number };

const CAPS = BITRATES.map((bitrate) => bitrate.value)
  .filter((value): value is number => value !== undefined)
  .sort((a, b) => b - a);

/** The highest cap at or under `bitrate`, the lowest cap at least. */
const capUnder = (bitrate: number) =>
  CAPS.find((cap) => cap <= bitrate) ?? ADAPTIVE_MIN_BITRATE;

/**
 * Auto during a playback: asks for a lower stream when the one playing stalls
 * or empties its cache, at the share of what the link carried, read from how
 * the cache grew; and measures the link again once a lowered stream plays
 * steadily, to step back up, never above the bitrate Auto started at.
 *
 * Fed the player's events with their time; it holds no timer. One action at a
 * time: nothing more is asked until the next stream starts, or the measure
 * it asked for comes back.
 */
export class AdaptiveAuto {
  private readonly ceiling: number;
  private readonly ratio: number;
  private stream: AdaptiveStream = {
    now: 0,
    cap: undefined,
    streamBitrate: undefined,
    mediaBitrate: undefined,
    cacheTarget: 0,
  };
  private samples: Sample[] = [];
  private stalls: Stall[] = [];
  private started = false;
  private playing = false;
  private loading = false;
  private loadingSince: number | undefined;
  private lowSince: number | undefined;
  /** In the last seconds of a file, where the cache empties by itself. */
  private nearEnd = false;
  private graceUntil = 0;
  private busy = false;
  private probing = false;
  private probeDelay = ADAPTIVE_PROBE_AFTER_MS;
  private nextProbeAt: number | undefined;
  private lastStepUpAt: number | undefined;

  constructor(options: { ceiling: number | undefined; ratio: number }) {
    this.ceiling = options.ceiling ?? Number.POSITIVE_INFINITY;
    this.ratio = options.ratio;
  }

  /** A stream starts: the first one, or one asked for since. */
  startStream(stream: AdaptiveStream): void {
    this.stream = stream;
    this.samples = [];
    this.stalls = [];
    this.started = false;
    this.playing = false;
    this.loading = false;
    this.loadingSince = undefined;
    this.lowSince = undefined;
    this.nearEnd = false;
    this.busy = false;
    this.probing = false;
    this.graceUntil = stream.now + ADAPTIVE_GRACE_MS;
    this.nextProbeAt ??= stream.now + this.probeDelay;
  }

  /** The player sought: what it loads next says nothing of the link. */
  seeked(now: number): void {
    this.closeStall(now);
    this.graceUntil = now + ADAPTIVE_GRACE_MS;
    this.samples = [];
    this.lowSince = undefined;
    this.nearEnd = false;
    this.loadingSince = this.playing && this.loading ? now : undefined;
  }

  /**
   * The stream it asked for could not start: the one playing plays on, and
   * is looked at again after a while, not hammered with new requests.
   */
  swapFailed(now: number): void {
    this.busy = false;
    // A measure still out then has nobody left to take its result.
    this.probing = false;
    this.stalls = [];
    this.samples = [];
    this.lowSince = undefined;
    this.loadingSince = this.playing && this.loading ? now : undefined;
    this.graceUntil = now + ADAPTIVE_RETRY_AFTER_FAILURE_MS;
  }

  /** The player's state: playing (or meant to be), and loading. */
  state(
    now: number,
    playing: boolean,
    loading: boolean,
  ): AdaptiveAction | null {
    if (!this.started && playing && !loading) {
      this.started = true;
      this.graceUntil = Math.max(this.graceUntil, now + ADAPTIVE_GRACE_MS);
    }
    this.playing = playing;
    this.loading = loading;
    if (this.started && playing && loading) {
      this.loadingSince ??= now;
    } else {
      this.closeStall(now);
      this.loadingSince = undefined;
    }
    return this.evaluate(now);
  }

  tick(tick: AdaptiveTick): AdaptiveAction | null {
    if (this.started && this.playing) {
      this.samples.push({
        at: tick.now,
        position: tick.position,
        cache: tick.cacheSeconds,
      });
      this.samples = this.samples.filter(
        (sample) => sample.at >= tick.now - ADAPTIVE_THROUGHPUT_WINDOW_MS,
      );
      const nearEnd =
        tick.duration > 0 &&
        tick.position >= tick.duration - ADAPTIVE_END_MARGIN_SECONDS;
      this.nearEnd = nearEnd;
      if (
        !this.loading &&
        !nearEnd &&
        tick.now >= this.graceUntil &&
        tick.cacheSeconds < ADAPTIVE_LOW_CACHE_SECONDS
      ) {
        this.lowSince ??= tick.now;
      } else {
        this.lowSince = undefined;
      }
    }
    return this.evaluate(tick.now);
  }

  /** Looks again with no new event: a stall sends none while it lasts. */
  check(now: number): AdaptiveAction | null {
    return this.evaluate(now);
  }

  /** The bitrate the measure asked for allows, or none when it failed. */
  probeResult(now: number, bitrate: number | undefined): AdaptiveAction | null {
    if (!this.probing) return null;
    this.probing = false;
    if (this.busy) return null;
    // Paused meanwhile: a new stream would start playing on its own. Sought,
    // loading or at the end of the file: what the stream does now is not
    // steady play, the measure is taken again later.
    if (
      !this.playing ||
      this.loading ||
      this.nearEnd ||
      now < this.graceUntil
    ) {
      this.nextProbeAt = now + this.probeDelay;
      return null;
    }
    const { cap } = this.stream;
    if (
      bitrate !== undefined &&
      cap !== undefined &&
      bitrate >= cap * ADAPTIVE_STEP_UP_MARGIN
    ) {
      const target = Math.min(bitrate, this.ceiling);
      if (target > cap) {
        this.busy = true;
        this.lastStepUpAt = now;
        this.nextProbeAt = now + this.probeDelay;
        return {
          kind: "stepUp",
          cap: Math.round(target),
          measured: Math.round(bitrate),
        };
      }
    }
    this.waitLonger(now);
    return null;
  }

  private evaluate(now: number): AdaptiveAction | null {
    // Nothing to replace while paused, nor while the end of the file drains
    // the cache by itself.
    if (this.busy || !this.started || !this.playing || this.nearEnd) {
      return null;
    }
    // A load that outlasts the grace counts from its end.
    if (
      this.loadingSince !== undefined &&
      now >= this.graceUntil &&
      !this.stalls.some((stall) => stall.to === undefined)
    ) {
      this.stalls.push({ from: Math.max(this.loadingSince, this.graceUntil) });
    }
    if (now < this.graceUntil) return null;
    const dry =
      this.lowSince !== undefined &&
      now - this.lowSince >= ADAPTIVE_LOW_CACHE_MS;
    if (this.stalledMs(now) >= ADAPTIVE_STALL_BUDGET_MS || dry) {
      return this.stepDown(now);
    }
    if (!this.probing && this.canProbe(now)) {
      this.probing = true;
      return { kind: "probe" };
    }
    return null;
  }

  private stepDown(now: number): AdaptiveAction | null {
    const effective = this.stream.streamBitrate ?? this.stream.cap;
    if (effective !== undefined && effective <= ADAPTIVE_MIN_BITRATE)
      return null;
    const throughput = this.throughput(now);
    const reading =
      throughput !== undefined &&
      effective !== undefined &&
      throughput < effective * ADAPTIVE_MIN_STEP
        ? throughput
        : undefined;
    let cap =
      reading !== undefined
        ? reading * this.ratio
        : capUnder(
            (effective ?? Number.POSITIVE_INFINITY) * ADAPTIVE_STEP_DOWN_FACTOR,
          );
    if (effective !== undefined)
      cap = Math.min(cap, effective * ADAPTIVE_MIN_STEP);
    cap = Math.round(Math.max(cap, ADAPTIVE_MIN_BITRATE));
    this.busy = true;
    // Down again soon after a step up: the link did not hold it.
    if (
      this.lastStepUpAt !== undefined &&
      now - this.lastStepUpAt < this.probeDelay
    ) {
      this.waitLonger(now);
    } else {
      this.nextProbeAt = now + this.probeDelay;
    }
    return reading !== undefined
      ? { kind: "stepDown", cap, throughput: Math.round(reading) }
      : { kind: "stepDown", cap };
  }

  /**
   * What the link carried, in bits/s: the media the cache gained and the
   * playback used, over the window since the cache was last full.
   */
  private throughput(now: number): number | undefined {
    const { streamBitrate, cacheTarget } = this.stream;
    if (streamBitrate === undefined) return undefined;
    const recent = this.samples.filter(
      (sample) => sample.at >= now - ADAPTIVE_THROUGHPUT_WINDOW_MS,
    );
    let from = 0;
    recent.forEach((sample, i) => {
      if (sample.cache >= ADAPTIVE_FULL_CACHE_SHARE * cacheTarget) from = i;
    });
    const window = recent.slice(from);
    const first = window[0];
    const last = window.at(-1);
    if (!first || !last) return undefined;
    const span = last.at - first.at;
    if (span < ADAPTIVE_THROUGHPUT_MIN_SPAN_MS) return undefined;
    const media = last.cache - first.cache + (last.position - first.position);
    return Math.max(0, (streamBitrate * media) / (span / 1_000));
  }

  private canProbe(now: number): boolean {
    const { cap, streamBitrate, mediaBitrate, cacheTarget } = this.stream;
    if (cap === undefined || cap >= this.ceiling) return false;
    if (
      streamBitrate !== undefined &&
      mediaBitrate !== undefined &&
      streamBitrate >= mediaBitrate
    ) {
      return false;
    }
    if (this.nextProbeAt === undefined || now < this.nextProbeAt) return false;
    if (this.loading || this.stalls.length > 0) return false;
    const last = this.samples.at(-1);
    return (
      last !== undefined &&
      now - last.at <= 2_000 &&
      last.cache >= ADAPTIVE_PROBE_CACHE_SHARE * cacheTarget
    );
  }

  private stalledMs(now: number): number {
    const since = now - ADAPTIVE_STALL_WINDOW_MS;
    this.stalls = this.stalls.filter(
      (stall) => stall.to === undefined || stall.to >= since,
    );
    return this.stalls.reduce(
      (total, stall) =>
        total + Math.max(0, (stall.to ?? now) - Math.max(stall.from, since)),
      0,
    );
  }

  private closeStall(now: number) {
    const open = this.stalls.find((stall) => stall.to === undefined);
    if (open) open.to = now;
  }

  private waitLonger(now: number) {
    this.probeDelay = Math.min(
      this.probeDelay * 2,
      ADAPTIVE_PROBE_MAX_DELAY_MS,
    );
    this.nextProbeAt = now + this.probeDelay;
  }
}
