import {
  AdaptiveAuto,
  type AdaptiveStream,
  streamBitrateOf,
} from "./adaptiveAuto";

const MB = 1_000_000;

describe("what a stream carries", () => {
  test("is the file's bitrate when the file plays as is", () => {
    expect(streamBitrateOf("DirectPlay", { Bitrate: 10 * MB })).toBe(10 * MB);
  });

  test("is the file's bitrate for a remux, whatever cap its address carries", () => {
    expect(
      streamBitrateOf("DirectStream", {
        Bitrate: 10 * MB,
        TranscodingUrl:
          "/videos/1/master.m3u8?VideoBitrate=48000000&AudioBitrate=384000",
      }),
    ).toBe(10 * MB);
  });

  test("is the transcode's video and audio bitrates", () => {
    expect(
      streamBitrateOf("Transcode", {
        Bitrate: 60 * MB,
        TranscodingUrl:
          "/videos/1/master.m3u8?VideoBitrate=3116000&AudioBitrate=384000",
      }),
    ).toBe(3.5 * MB);
  });

  test("is unknown when neither says", () => {
    expect(
      streamBitrateOf("Transcode", { TranscodingUrl: "/videos/1/master.m3u8" }),
    ).toBeUndefined();
  });
});

/** A file streamed as is at 10 Mb/s, under the 48.5 Mb/s Auto started at. */
const direct = (now: number): AdaptiveStream => ({
  now,
  cap: 48.5 * MB,
  streamBitrate: 10 * MB,
  mediaBitrate: 10 * MB,
  cacheTarget: 10,
});

const started = (stream: AdaptiveStream = direct(0)) => {
  const auto = new AdaptiveAuto({ ceiling: 48.5 * MB, ratio: 0.7 });
  auto.startStream(stream);
  auto.state(stream.now + 1_000, true, false);
  return auto;
};

/** Progress ticks, one a second from `from`, each playing a second of media. */
const ticks = (
  auto: AdaptiveAuto,
  from: number,
  caches: number[],
  firstPosition = 0,
  duration = 3_600,
) =>
  caches.map((cacheSeconds, i) =>
    auto.tick({
      now: from + i * 1_000,
      position: firstPosition + i,
      duration,
      cacheSeconds,
    }),
  );

describe("stepping down", () => {
  test("ask for the share of what the link carried when the stream stalls", () => {
    const auto = started();
    // The cache loses half a second a second: the link carries half the stream.
    ticks(auto, 7_000, [8, 7.5, 7, 6.5, 6, 5.5]);
    expect(auto.state(12_500, true, true)).toBeNull();

    expect(auto.check(14_600)).toEqual({
      kind: "stepDown",
      cap: 3.5 * MB,
      throughput: 5 * MB,
    });
  });

  test("step down when the cache stays low, before the stream stalls", () => {
    const auto = started();
    const actions = ticks(auto, 7_000, [5, 4, 3, 2.5, 1.5, 1.2, 1, 0.8]);

    expect(actions.slice(0, -1).every((action) => action === null)).toBe(true);
    expect(actions.at(-1)).toMatchObject({ kind: "stepDown" });
  });

  test("take the cap under three quarters of the bitrate when it cannot read the link", () => {
    const auto = started({
      ...direct(0),
      streamBitrate: undefined,
      cap: 10 * MB,
    });
    auto.state(7_000, true, true);

    expect(auto.check(9_100)).toEqual({ kind: "stepDown", cap: 4 * MB });
  });

  test("follow the caps when the cache held, as the link is not what stalled", () => {
    const auto = started();
    // The cache held: whatever stalled, the link is not the reading to follow.
    ticks(auto, 7_000, [9, 9, 9, 9, 9, 9]);
    auto.state(12_500, true, true);

    expect(auto.check(14_600)).toEqual({ kind: "stepDown", cap: 4 * MB });
  });

  test("count nothing during the grace that follows a start", () => {
    const auto = started();
    auto.state(2_000, true, true);
    auto.state(5_900, true, false);

    expect(auto.check(7_000)).toBeNull();
  });

  test("count nothing during the grace that follows a seek", () => {
    const auto = started();
    auto.seeked(20_000);
    auto.state(20_500, true, true);

    expect(auto.check(24_000)).toBeNull();
  });

  test("leave the end of a file alone, where the cache empties by itself", () => {
    const auto = started();
    const actions = ticks(auto, 7_000, [1, 0.8, 0.5, 0.2, 0, 0], 3_590, 3_600);

    expect(actions.every((action) => action === null)).toBe(true);
  });

  test("not count a stall the user paused through", () => {
    const auto = started();
    auto.state(7_000, true, true);
    auto.state(7_500, false, true);

    expect(auto.check(12_000)).toBeNull();
  });

  test("never go under the lowest cap", () => {
    const auto = started({
      ...direct(0),
      cap: 250_000,
      streamBitrate: 250_000,
    });
    auto.state(7_000, true, true);

    expect(auto.check(10_000)).toBeNull();
  });

  test("ask once, until the next stream starts", () => {
    const auto = started();
    auto.state(7_000, true, true);
    expect(auto.check(9_100)).toMatchObject({ kind: "stepDown" });

    expect(auto.check(12_000)).toBeNull();
  });
});

describe("stepping up", () => {
  /** The 3.5 Mb/s transcode a step down asked for. */
  const lowered = (now: number): AdaptiveStream => ({
    now,
    cap: 3.5 * MB,
    streamBitrate: 3.5 * MB,
    mediaBitrate: 10 * MB,
    cacheTarget: 10,
  });

  test("measure again after two minutes without a stall, the cache full", () => {
    const auto = started(lowered(0));
    const early = ticks(auto, 100_000, [9, 9, 9]);
    const due = auto.tick({
      now: 121_000,
      position: 121,
      duration: 3_600,
      cacheSeconds: 9,
    });

    expect(early.every((action) => action === null)).toBe(true);
    expect(due).toEqual({ kind: "probe" });
  });

  test("not measure while the cache is low", () => {
    const auto = started(lowered(0));

    expect(
      auto.tick({
        now: 121_000,
        position: 121,
        duration: 3_600,
        cacheSeconds: 5,
      }),
    ).toBeNull();
  });

  test("step up to the measure, no higher than where Auto started", () => {
    const auto = started(lowered(0));
    auto.tick({
      now: 121_000,
      position: 121,
      duration: 3_600,
      cacheSeconds: 9,
    });

    expect(auto.probeResult(130_000, 60 * MB)).toEqual({
      kind: "stepUp",
      cap: 48.5 * MB,
      measured: 60 * MB,
    });
  });

  test("step up to the measure when Auto started without a cap", () => {
    const auto = new AdaptiveAuto({ ceiling: undefined, ratio: 0.7 });
    auto.startStream(lowered(0));
    auto.state(1_000, true, false);
    auto.tick({
      now: 121_000,
      position: 121,
      duration: 3_600,
      cacheSeconds: 9,
    });

    expect(auto.probeResult(130_000, 60 * MB)).toEqual({
      kind: "stepUp",
      cap: 60 * MB,
      measured: 60 * MB,
    });
  });

  test("wait twice as long after a measure that allows no step up", () => {
    const auto = started(lowered(0));
    auto.tick({
      now: 121_000,
      position: 121,
      duration: 3_600,
      cacheSeconds: 9,
    });
    expect(auto.probeResult(130_000, 5 * MB)).toBeNull();

    const tick = (now: number) =>
      auto.tick({
        now,
        position: now / 1_000,
        duration: 3_600,
        cacheSeconds: 9,
      });
    expect(tick(130_000 + 4 * 60_000 - 1_000)).toBeNull();
    expect(tick(130_000 + 4 * 60_000)).toEqual({ kind: "probe" });
  });

  test("never measure a stream that plays the file itself", () => {
    const auto = started();

    expect(
      auto.tick({
        now: 200_000,
        position: 200,
        duration: 3_600,
        cacheSeconds: 9,
      }),
    ).toBeNull();
  });

  test("never measure a stream at the bitrate Auto started at", () => {
    const auto = started({
      ...lowered(0),
      cap: 48.5 * MB,
      streamBitrate: 20 * MB,
      mediaBitrate: 60 * MB,
    });

    expect(
      auto.tick({
        now: 200_000,
        position: 200,
        duration: 3_600,
        cacheSeconds: 9,
      }),
    ).toBeNull();
  });

  test("wait twice as long after a step up the link did not hold", () => {
    const auto = started(lowered(0));
    auto.tick({
      now: 121_000,
      position: 121,
      duration: 3_600,
      cacheSeconds: 9,
    });
    auto.probeResult(130_000, 60 * MB);
    // The stream at 48.5 Mb/s stalls a minute later and steps down again.
    auto.startStream({
      ...lowered(131_000),
      cap: 48.5 * MB,
      streamBitrate: 10 * MB,
    });
    auto.state(132_000, true, false);
    auto.state(190_000, true, true);
    expect(auto.check(192_100)).toMatchObject({ kind: "stepDown" });
    auto.startStream(lowered(193_000));
    auto.state(194_000, true, false);

    const tick = (now: number) =>
      auto.tick({
        now,
        position: now / 1_000,
        duration: 3_600,
        cacheSeconds: 9,
      });
    expect(tick(192_100 + 4 * 60_000 - 1_000)).toBeNull();
    expect(tick(192_100 + 4 * 60_000)).toEqual({ kind: "probe" });
  });
});
