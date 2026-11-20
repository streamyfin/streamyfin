import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { createStore } from "jotai";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast";
import type { RemoteLoadResult } from "@/modules/mpv-player/src/cast/Cast.types";
import { CastNative } from "@/modules/mpv-player/src/cast/CastModule";
import {
  type CastDoubleState,
  createCastDoubleState,
  setCastSession,
} from "@/test-utils/cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  createNativePlayerDoubleState,
  type NativePlayerDoubleState,
} from "@/test-utils/nativePlayer";
import { stubReactNative } from "@/test-utils/reactNative";
import { remoteForeignAtom, remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { settingsAtom } from "@/utils/atoms/settings";
import { extractImageColor } from "@/utils/imageColors";
import {
  followOnRemote,
  playOnRemote,
  showForeignOnRemote,
  showRemoteItem,
} from "./playOnRemote";
import { remoteTint } from "./remoteTint";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
let mockPlayer: NativePlayerDoubleState = createNativePlayerDoubleState();
jest.mock("@/modules/mpv-player/src/NativePlayerModule", () => ({
  __esModule: true,
  NativePlayerNativeModule:
    require("@/test-utils/nativePlayer").nativePlayerDoubleModule(
      () => mockPlayer,
    ),
}));
// Auto measures the link with a download: here it measures 30 Mb/s, and a fixed quality stays itself.
jest.mock("@/utils/jellyfin/maxStreamingBitrate", () => ({
  resolveMaxStreamingBitrate: jest.fn(
    async (_api: unknown, quality: unknown) =>
      typeof quality === "number" ? quality : 30_000_000,
  ),
}));
jest.mock("@/utils/imageColors", () => ({
  extractImageColor: jest.fn(async () => null),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const t = ((key: string) => key) as unknown as TFunction;

const episode: BaseItemDto = {
  Id: "episode-1",
  Name: "Pilot",
  Type: "Episode",
  MediaType: "Video",
  IsFolder: false,
  MediaSources: [{ Id: "source-1", MediaStreams: [] }],
};

const livingRoom: RemoteTarget = {
  kind: "cast",
  id: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  name: "Living Room TV",
  capabilities: { volume: true },
};

const play = {
  item: episode,
  positionTicks: 600_000_000,
  mediaSourceId: "source-1",
  audioIndex: 1,
  subtitleIndex: 2,
};

const SEGMENTS = /\/MediaSegments\//;
const anIntro = () =>
  api.mock.onGet(SEGMENTS).reply(200, {
    Items: [{ Type: "Intro", StartTicks: 50_000_000, EndTicks: 650_000_000 }],
  });
const INTRO = { type: "Intro", startSec: 5, endSec: 65, skipMode: "ask" };
type Shown = { metadata: { itemId: string }; segments: unknown[] };

let api = makeApi();
let store = createStore();
const deps = () => ({ api, userId: "user-1", store, t });
const fresh = () => false;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockCast = createCastDoubleState();
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  // No remote screen up: the first send presents one.
  mockPlayer.remoteUpdateAnswer = false;
  api = makeApi();
  // No segments unless a test gives some: they are read for every item shown.
  api.mock.onGet(SEGMENTS).reply(200, { Items: [] });
  store = createStore();
  stubReactNative({ OS: "android" });
  jest.mocked(extractImageColor).mockResolvedValue(null);
});

test("the player opens before the load answers", async () => {
  let answer: (result: RemoteLoadResult) => void = () => {};
  jest.mocked(CastNative!.loadOnReceiver).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );

  const sent = playOnRemote(deps(), play, livingRoom, fresh);
  await flush();

  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(mockPlayer.remotePresented[0]).toMatchObject({
    targetName: "Living Room TV",
    tint: null,
  });
  answer({ outcome: "loaded" });
  await expect(sent).resolves.toEqual({ status: "loaded" });
});

const seriesOf = (count: number): BaseItemDto[] =>
  Array.from({ length: count }, (_, index) => ({
    Id: `s1e${index}`,
    Name: `Episode ${index}`,
    Type: "Episode",
    SeriesId: "series-1",
    IndexNumber: index + 1,
    RunTimeTicks: 22 * 600_000_000,
  }));

const seriesPlay = {
  ...play,
  item: { ...episode, Id: "s1e1", Name: "Episode 1", SeriesId: "series-1" },
  positionTicks: 0,
};

test("an episode is sent with its bounded list", async () => {
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
    Items: seriesOf(10),
  });

  await playOnRemote(deps(), seriesPlay, livingRoom, fresh);

  // The default preset asks after five 22 minute episodes (boundedEpisodeQueue), autoplay being on.
  const { items } = mockCast.loadCalls[0].request;
  expect(items.map((item) => item.id)).toEqual([
    "s1e1",
    "s1e2",
    "s1e3",
    "s1e4",
    "s1e5",
  ]);
  expect(items.every((item) => item.type === "Episode")).toBe(true);
  // The screen opened before the list was read: the list and what comes after it arrive in place.
  const shown = mockPlayer.remoteUpdates.at(-1) as {
    episodeList: { itemId: string; isCurrent: boolean }[];
    nextEpisode: { itemId: string; title: string } | null;
  };
  expect(shown.episodeList.map((entry) => entry.itemId)).toEqual(
    seriesOf(10).map((entry) => entry.Id),
  );
  expect(shown.episodeList.find((entry) => entry.isCurrent)?.itemId).toBe(
    "s1e1",
  );
  expect(shown.nextEpisode).toMatchObject({
    itemId: "s1e6",
    title: "Episode 6",
  });
});

test("an episode whose series cannot be read goes alone, without its type", async () => {
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(500);

  await expect(
    playOnRemote(deps(), seriesPlay, livingRoom, fresh),
  ).resolves.toEqual({ status: "loaded" });

  // Typed, a lone episode would play the whole series on the TV.
  expect(mockCast.loadCalls[0].request.items).toEqual([
    { id: "s1e1", name: "Episode 1", mediaType: "Video", isFolder: false },
  ]);
});

test("a loaded outcome leaves the player as it is", async () => {
  await expect(playOnRemote(deps(), play, livingRoom, fresh)).resolves.toEqual({
    status: "loaded",
  });

  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(store.get(remotePlayAtom)).toEqual({
    play,
    loaded: true,
    list: { itemIds: ["episode-1"], nextUpId: null },
  });
  expect(mockCast.loadCalls[0].request).toEqual({
    // An episode alone goes without its type: the receiver would unfold a typed one into its series.
    items: [
      {
        id: "episode-1",
        name: "Pilot",
        mediaType: "Video",
        isFolder: false,
      },
    ],
    startPositionTicks: 600_000_000,
    mediaSourceId: "source-1",
    audioStreamIndex: 1,
    subtitleStreamIndex: 2,
  });
});

// Two presses close together: the first is replaced, and says nothing (Review Focus 3).
test("a superseded load says nothing and keeps the player open", async () => {
  mockCast.loadAnswer = { outcome: "superseded" };

  await expect(playOnRemote(deps(), play, livingRoom, fresh)).resolves.toEqual({
    status: "superseded",
  });

  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(mockPlayer.remotePresented).toHaveLength(1);
});

test("a timed out load shows the failure with Play here", async () => {
  mockCast.loadAnswer = { outcome: "timedOut" };

  const result = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(result).toEqual({
    status: "notStarted",
    message: "player.chromecast_did_not_start",
  });
  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_did_not_start", canPlayHere: true },
  ]);
  expect(store.get(remotePlayAtom)).toEqual({ play, loaded: false });
});

test("a refused send shows the failure", async () => {
  mockCast.loadAnswer = { outcome: "failed", error: "playback_failed" };
  await playOnRemote(deps(), play, livingRoom, fresh);

  mockCast.loadAnswer = { outcome: "notSent", error: "No remote engine" };
  const notSent = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_playback_failed", canPlayHere: true },
    { message: "cast.output.failed", canPlayHere: true },
  ]);
  expect(notSent).toEqual({
    status: "notStarted",
    message: "cast.output.failed",
  });
});

test("the envelope carries the bitrate cap of the remote quality setting", async () => {
  store.set(settingsAtom, {
    remotePlaybackQuality: {
      byKind: { cast: "8 Mb/s" },
      byTarget: {},
      known: [],
    },
  });

  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockCast.loadCalls[0].server).toEqual({
    serverAddress: "https://jellyfin.example.com",
    accessToken: "SECRET_TOKEN",
    userId: "user-1",
    receiverName: "Living Room TV",
    maxBitrate: 8_000_000,
  });
});

// The receiver reports the playback to the server itself; a report from the phone would be a second session.
test("no playback report is sent for a remote play", async () => {
  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(api.mock.history.post).toEqual([]);
  // The segments are the only read, for the intro button.
  expect(
    api.mock.history.get.filter(({ url }) => !SEGMENTS.test(url ?? "")),
  ).toEqual([]);
});

test("a stale send presents nothing", async () => {
  const result = await playOnRemote(deps(), play, livingRoom, () => true);

  expect(result).toEqual({ status: "superseded" });
  expect(mockPlayer.remotePresented).toEqual([]);
  expect(mockPlayer.remoteUpdates).toEqual([]);
  expect(mockCast.loadCalls).toEqual([]);
});

// A switch to another TV records no play choice: only the session read at the press may get the send.
test("a TV switched while Auto measures gets nothing", async () => {
  const { resolveMaxStreamingBitrate } = jest.requireMock(
    "@/utils/jellyfin/maxStreamingBitrate",
  );
  jest.mocked(resolveMaxStreamingBitrate).mockImplementationOnce(async () => {
    setCastSession(mockCast, "session-2");
    return 30_000_000;
  });

  const result = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(result).toEqual({ status: "superseded" });
  expect(mockCast.loadCalls).toEqual([]);
});

// The series is read and shown after Auto's measure: a TV switched meanwhile got the load all the same.
test.each([
  ["while its series is read", "read"],
  ["while its list is shown", "shown"],
] as const)("a TV switched %s gets nothing", async (_when, at) => {
  const switchTv = () => setCastSession(mockCast, "session-2");
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(async () => {
    // Answered past the check made once Auto has measured.
    await flush();
    if (at === "read") switchTv();
    return [200, { Items: seriesOf(10) }];
  });
  // The double's own answer, put back after: implementations outlive a test.
  const { NativePlayerNativeModule } = jest.requireMock(
    "@/modules/mpv-player/src/NativePlayerModule",
  );
  const update = jest.mocked(NativePlayerNativeModule.updateRemotePlayer);
  const double = update.getMockImplementation();
  update.mockImplementation(async (config: { episodeList: unknown[] }) => {
    if (at === "shown" && config.episodeList.length > 0) switchTv();
    return (await double?.(config)) ?? false;
  });

  const result = await playOnRemote(
    deps(),
    seriesPlay,
    livingRoom,
    fresh,
  ).finally(() => update.mockImplementation(double));

  expect(result).toEqual({ status: "superseded" });
  expect(mockCast.loadCalls).toEqual([]);
});

test("a send while the player is up updates it in place", async () => {
  mockPlayer.remoteUpdateAnswer = true;

  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockPlayer.remoteUpdates).toHaveLength(1);
  expect(mockPlayer.remotePresented).toEqual([]);
});

// The screen opens on the neutral background; the artwork's color fades in once known, never waited for.
test("the tint follows once the artwork's color is known", async () => {
  jest.mocked(extractImageColor).mockResolvedValue("#1F6F8B");

  await playOnRemote(deps(), play, livingRoom, fresh);
  await flush();

  expect(mockPlayer.remoteTints).toEqual([remoteTint("#1F6F8B")]);
});

// The TV went on in its list: the screen keeps the tint it shows until the new episode's is read, rather than going
// back to the neutral.
test("following the TV keeps the tint shown", async () => {
  jest.mocked(extractImageColor).mockResolvedValue("#1F6F8B");
  await playOnRemote(deps(), play, livingRoom, fresh);
  await flush();
  jest.mocked(extractImageColor).mockResolvedValue(null);
  api.mock
    .onGet(/\/Items\/episode-2/)
    .reply(200, { Id: "episode-2", Name: "Second", Type: "Episode" });
  mockPlayer.remoteUpdateAnswer = true;

  await followOnRemote(deps(), "episode-2", livingRoom, {
    ...mockCast.remotePlayback,
    itemId: "episode-2",
    phase: "playing",
  });

  const shown = mockPlayer.remoteUpdates.at(-1) as {
    metadata: { itemId: string };
    tint: unknown;
  };
  expect(shown.metadata.itemId).toBe("episode-2");
  expect(shown.tint).toEqual(remoteTint("#1F6F8B"));
});

// Refused natively (no remote engine for the session): no screen says it, so the caller does, and nothing loads.
test("a remote player that does not open leaves the failure to the caller", async () => {
  mockPlayer.remoteRefusal = new Error("No remote engine");

  const result = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(result).toEqual({ status: "failed", message: "cast.output.failed" });
  expect(mockCast.loadCalls).toEqual([]);
  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(store.get(remotePlayAtom)).toBeNull();
});

const foreignFilm = {
  itemId: "other-server-item",
  title: "Foreign Film",
  imageUrl: "https://other.example/poster.jpg",
};

test("a send takes the screen from the foreign media it showed", async () => {
  store.set(remoteForeignAtom, foreignFilm);

  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(store.get(remoteForeignAtom)).toBeNull();
});

// Opened on what the TV plays: the TV's list when it holds one, what comes after its last item, the TV's tracks.
test("an episode the TV plays opens the full player with its series", async () => {
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
    Items: seriesOf(10),
  });
  store.set(remoteForeignAtom, foreignFilm);
  const item = { ...seriesOf(10)[2], MediaSources: [{ Id: "source-1" }] };

  await showRemoteItem(deps(), item, livingRoom, {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    itemId: "s1e2",
    queueItemIds: ["s1e2", "s1e3"],
    positionSec: 60,
    audioIndex: 1,
    subtitleIndex: 3,
  });

  expect(mockPlayer.remotePresented).toHaveLength(1);
  const shown = mockPlayer.remotePresented[0] as {
    metadata: { itemId: string };
    episodeList: { itemId: string; isCurrent: boolean }[];
    nextEpisode: { itemId: string } | null;
    reduced?: boolean;
  };
  expect(shown.metadata.itemId).toBe("s1e2");
  expect(shown.reduced).toBeUndefined();
  expect(shown.episodeList.find((entry) => entry.isCurrent)?.itemId).toBe(
    "s1e2",
  );
  expect(shown.nextEpisode).toMatchObject({ itemId: "s1e4" });
  expect(store.get(remotePlayAtom)).toEqual({
    play: {
      item,
      positionTicks: 600_000_000,
      mediaSourceId: "source-1",
      audioIndex: 1,
      subtitleIndex: 3,
    },
    loaded: true,
    list: { itemIds: ["s1e2", "s1e3"], nextUpId: "s1e4" },
  });
  expect(store.get(remoteForeignAtom)).toBeNull();
});

test("a film the TV plays outside its list is the list alone, shown in place", async () => {
  mockPlayer.remoteUpdateAnswer = true;
  const film: BaseItemDto = { Id: "film-1", Name: "Film", Type: "Movie" };

  await showRemoteItem(deps(), film, livingRoom, {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    itemId: "film-1",
    queueItemIds: ["s1e2", "s1e3"],
  });

  expect(mockPlayer.remotePresented).toEqual([]);
  const shown = mockPlayer.remoteUpdates.at(-1) as {
    episodeList: unknown[];
    nextEpisode: unknown;
    tracks: unknown;
  };
  expect(shown.episodeList).toEqual([]);
  expect(shown.nextEpisode).toBeNull();
  expect(shown.tracks).toBeNull();
  expect(store.get(remotePlayAtom)?.list).toEqual({
    itemIds: ["film-1"],
    nextUpId: null,
  });
});

test("foreign media opens the reduced player and drops the play shown", async () => {
  store.set(remotePlayAtom, { play, loaded: true });

  await showForeignOnRemote(deps(), foreignFilm, livingRoom);

  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(mockPlayer.remotePresented[0]).toMatchObject({
    reduced: true,
    targetName: "Living Room TV",
    metadata: { title: "Foreign Film", artworkUri: foreignFilm.imageUrl },
  });
  expect(store.get(remotePlayAtom)).toBeNull();
  expect(store.get(remoteForeignAtom)).toEqual(foreignFilm);
});

test("the item the TV plays comes with its intro to skip", async () => {
  anIntro();
  const film: BaseItemDto = { Id: "film-1", Name: "Film", Type: "Movie" };

  await showRemoteItem(deps(), film, livingRoom, {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    itemId: "film-1",
  });
  await flush();

  // In place once read, on the screen it opened.
  expect((mockPlayer.remotePresented[0] as Shown).metadata.itemId).toBe(
    "film-1",
  );
  expect((mockPlayer.remoteUpdates.at(-1) as Shown).segments).toEqual([INTRO]);
});

test("a send gives the screen the item's segments once read", async () => {
  anIntro();
  mockPlayer.remoteUpdateAnswer = true;

  await playOnRemote(deps(), play, livingRoom, fresh);
  await flush();

  expect((mockPlayer.remoteUpdates.at(-1) as Shown).segments).toEqual([INTRO]);
});

// The segments are never waited for: a reply that lands after the load must not undo what the screen shows then.
const lateSegments = () => {
  let answer: (reply: [number, unknown]) => void = () => {};
  api.mock.onGet(SEGMENTS).reply(
    () =>
      new Promise<[number, unknown]>((resolve) => {
        answer = resolve;
      }),
  );
  return () =>
    answer([
      200,
      {
        Items: [
          { Type: "Intro", StartTicks: 50_000_000, EndTicks: 650_000_000 },
        ],
      },
    ]);
};

test("segments read after a failed load leave the failure on screen", async () => {
  const land = lateSegments();
  mockCast.loadAnswer = { outcome: "timedOut" };
  mockPlayer.remoteUpdateAnswer = true;
  await playOnRemote(deps(), play, livingRoom, fresh);
  const updates = mockPlayer.remoteUpdates.length;

  land();
  await flush();
  await flush();

  expect(mockPlayer.remoteUpdates).toHaveLength(updates);
});

test("segments read after a track change keep the track the TV took", async () => {
  const land = lateSegments();
  mockPlayer.remoteUpdateAnswer = true;
  const withTracks = {
    ...play,
    item: {
      ...episode,
      MediaSources: [
        {
          Id: "source-1",
          MediaStreams: [
            { Type: "Subtitle" as const, Index: 2 },
            { Type: "Subtitle" as const, Index: 3 },
          ],
        },
      ],
    },
  };
  await playOnRemote(deps(), withTracks, livingRoom, fresh);
  const held = store.get(remotePlayAtom);
  if (!held) throw new Error("no play held");
  store.set(remotePlayAtom, {
    ...held,
    play: { ...held.play, subtitleIndex: 3 },
  });

  land();
  await flush();
  await flush();

  const shown = mockPlayer.remoteUpdates.at(-1) as {
    segments: unknown[];
    tracks: { subtitles: { jellyfinIndex: number; selected?: boolean }[] };
  };
  expect(shown.segments).toEqual([INTRO]);
  expect(
    shown.tracks.subtitles
      .filter((row) => row.selected)
      .map((row) => row.jellyfinIndex),
  ).toEqual([3]);
});

test("the next item the TV plays brings its own segments", async () => {
  await playOnRemote(deps(), play, livingRoom, fresh);
  anIntro();
  api.mock
    .onGet(/\/Items\/episode-2/)
    .reply(200, { Id: "episode-2", Name: "Second", Type: "Episode" });
  mockPlayer.remoteUpdateAnswer = true;

  await followOnRemote(deps(), "episode-2", livingRoom, {
    ...mockCast.remotePlayback,
    itemId: "episode-2",
    phase: "playing",
  });
  await flush();

  const shown = mockPlayer.remoteUpdates.at(-1) as Shown;
  expect(shown.metadata.itemId).toBe("episode-2");
  expect(shown.segments).toEqual([INTRO]);
});

// Never waited for, as a send does not: on a server before 10.11 they are two reads, the intro plugin's after the
// segments endpoint, and the screen would keep the item before until both answer.
test("the screen follows the TV before the next item's segments are read", async () => {
  await playOnRemote(deps(), play, livingRoom, fresh);
  const land = lateSegments();
  api.mock
    .onGet(/\/Items\/episode-2/)
    .reply(200, { Id: "episode-2", Name: "Second", Type: "Episode" });
  mockPlayer.remoteUpdateAnswer = true;

  const following = followOnRemote(deps(), "episode-2", livingRoom, {
    ...mockCast.remotePlayback,
    itemId: "episode-2",
    phase: "playing",
  });
  for (let i = 0; i < 5; i++) await flush();
  expect((mockPlayer.remoteUpdates.at(-1) as Shown).metadata.itemId).toBe(
    "episode-2",
  );

  land();
  await following;
  for (let i = 0; i < 3; i++) await flush();
  const shown = mockPlayer.remoteUpdates.at(-1) as Shown;
  expect(shown.metadata.itemId).toBe("episode-2");
  expect(shown.segments).toEqual([INTRO]);
});

test("segments of an item the TV has left are not shown", async () => {
  await playOnRemote(deps(), play, livingRoom, fresh);
  const land = lateSegments();
  api.mock
    .onGet(/\/Items\/episode-2/)
    .reply(200, { Id: "episode-2", Name: "Second", Type: "Episode" });
  api.mock
    .onGet(/\/Items\/episode-3/)
    .reply(200, { Id: "episode-3", Name: "Third", Type: "Episode" });
  mockPlayer.remoteUpdateAnswer = true;
  const state = { ...mockCast.remotePlayback, phase: "playing" as const };

  await followOnRemote(deps(), "episode-2", livingRoom, {
    ...state,
    itemId: "episode-2",
  });
  // Its segments asked for, still unanswered, before the third episode's read answers at once.
  await flush();
  api.mock.onGet(SEGMENTS).reply(200, { Items: [] });
  await followOnRemote(deps(), "episode-3", livingRoom, {
    ...state,
    itemId: "episode-3",
  });
  // The second episode's land once the screen shows the third.
  land();
  for (let i = 0; i < 3; i++) await flush();

  const shown = mockPlayer.remoteUpdates.at(-1) as Shown;
  expect(shown.metadata.itemId).toBe("episode-3");
  expect(shown.segments).toEqual([]);
});

test("an item shown from the TV does not wait for its segments", async () => {
  mockPlayer.remoteUpdateAnswer = true;
  const land = lateSegments();
  const film: BaseItemDto = { Id: "film-1", Name: "Film", Type: "Movie" };

  const showing = showRemoteItem(deps(), film, livingRoom, {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    itemId: "film-1",
    queueItemIds: [],
  });
  for (let i = 0; i < 5; i++) await flush();
  expect(
    (mockPlayer.remoteUpdates.at(-1) as Shown | undefined)?.metadata.itemId,
  ).toBe("film-1");

  land();
  await showing;
  for (let i = 0; i < 3; i++) await flush();
  expect((mockPlayer.remoteUpdates.at(-1) as Shown).segments).toEqual([INTRO]);
});

// A segment the user set to none is never shown, as in the local player.
test("the segments follow the user's skip modes", async () => {
  anIntro();
  store.set(settingsAtom, { skipIntro: "none" } as never);
  const film: BaseItemDto = { Id: "film-1", Name: "Film", Type: "Movie" };

  await showRemoteItem(deps(), film, livingRoom, {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    itemId: "film-1",
  });

  expect((mockPlayer.remotePresented[0] as Shown).segments).toEqual([]);
});
