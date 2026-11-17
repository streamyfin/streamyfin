import type { CastMediaStatus } from "@/modules/mpv-player/src/cast";
import { playRequestFromReceiver } from "./playRequestFromReceiver";

const status = (
  customData: Record<string, unknown> | null,
  streamPosition = 125.5,
  playerState: CastMediaStatus["playerState"] = "playing",
): CastMediaStatus => ({
  playerState,
  currentItemId: 1,
  streamPosition,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: customData
    ? { contentId: null, customData, metadata: null }
    : null,
  customData: null,
});

test("a receiver's item plays here at its position with its streams", () => {
  expect(
    playRequestFromReceiver(
      status({
        itemId: "item-1",
        mediaSourceId: "source-1",
        audioStreamIndex: 2,
        subtitleStreamIndex: 3,
        canClientSeek: true,
      }),
    ),
  ).toEqual({
    itemId: "item-1",
    mediaSourceId: "source-1",
    audioIndex: 2,
    subtitleIndex: 3,
    playbackPositionTicks: 1_255_000_000,
  });
});

// The receiver reports its position on events only (a seek, a pause): while it plays on, the last report falls
// behind, and the SDK's estimate says where it is now (bench, 05/11: 112 s reported, 169.7 s on the TV).
test("a playing receiver goes on from where it is now, not from its last report", () => {
  expect(
    playRequestFromReceiver({
      ...status({ itemId: "item-1", canClientSeek: true }, 112),
      approximateStreamPosition: 169.7,
    })?.playbackPositionTicks,
  ).toBe(1_697_000_000);
});

// Transcoded music or live TV: the receiver's clock starts where the stream was loaded.
test("a stream the receiver cannot seek in counts from where it was loaded", () => {
  expect(
    playRequestFromReceiver(
      status(
        {
          itemId: "item-1",
          canClientSeek: false,
          startPositionTicks: 600_000_000,
        },
        10,
      ),
    )?.playbackPositionTicks,
  ).toBe(700_000_000);
});

test("foreign or live media gives nothing", () => {
  expect(playRequestFromReceiver(null)).toBeNull();
  expect(playRequestFromReceiver(status(null))).toBeNull();
  expect(
    playRequestFromReceiver(status({ contentId: "elsewhere" })),
  ).toBeNull();
  expect(
    playRequestFromReceiver(
      status({ itemId: "channel-1", liveStreamId: "live-1" }),
    ),
  ).toBeNull();
});

// Stopped from the TV, the session keeps an idle status with its media at 0: that is no position to go on from.
test("a receiver that stopped gives nothing", () => {
  expect(
    playRequestFromReceiver(status({ itemId: "item-1" }, 0, "idle")),
  ).toBeNull();
});

// Subtitles picked on the receiver (the Cast controls' captions) switch its text track and leave the custom data at
// the index it was loaded with; the Jellyfin receiver names each text track by its stream index (bench, 05/11:
// tracks 3 and 4, 4 active, custom data still 3).
const withTracks = (
  activeTrackIds: number[],
  textTrackIds: number[],
  subtitleStreamIndex = 3,
) => {
  const loaded = status({ itemId: "item-1", subtitleStreamIndex });
  return {
    ...loaded,
    activeTrackIds,
    mediaInfo: loaded.mediaInfo && { ...loaded.mediaInfo, textTrackIds },
  };
};

test("subtitles picked on the receiver go on here, not the ones it was loaded with", () => {
  expect(playRequestFromReceiver(withTracks([4], [3, 4]))?.subtitleIndex).toBe(
    4,
  );
});

test("subtitles turned off on the receiver stay off here", () => {
  expect(playRequestFromReceiver(withTracks([], [3, 4]))?.subtitleIndex).toBe(
    -1,
  );
});

// Without text tracks the receiver burned the subtitles in at the load, which the custom data names.
test("burned-in subtitles go on as the receiver was loaded with them", () => {
  expect(playRequestFromReceiver(withTracks([], []))?.subtitleIndex).toBe(3);
});

// The server hands the receiver every text subtitle as a track, so an image subtitle picked at the load (PGS, burned
// in) has none: with no track active, a loaded index outside the text tracks is that burned-in subtitle.
test("a burned-in subtitle beside text tracks goes on as the receiver was loaded with it", () => {
  expect(playRequestFromReceiver(withTracks([], [3], 5))?.subtitleIndex).toBe(
    5,
  );
});

// Loaded without subtitles, the receiver shows none: none here either, whatever this device would pick.
test("a receiver loaded without subtitles gives none here", () => {
  expect(
    playRequestFromReceiver(
      status({ itemId: "item-1", subtitleStreamIndex: null }),
    )?.subtitleIndex,
  ).toBe(-1);
});

// The iOS SDK estimates 0 once the channel is gone: that is no estimate, and the last report stands.
test("an estimate of 0 leaves the last report", () => {
  expect(
    playRequestFromReceiver({
      ...status({ itemId: "item-1", canClientSeek: true }, 2700),
      approximateStreamPosition: 0,
    })?.playbackPositionTicks,
  ).toBe(27_000_000_000);
});
