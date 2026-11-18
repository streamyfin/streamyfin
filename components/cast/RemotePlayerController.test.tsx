import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { act, render, waitFor } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { NATIVE_AUTO_QUALITY_INDEX } from "@/constants/Bitrate";
import {
  REMOTE_SUBTITLE_POLL_ATTEMPTS,
  REMOTE_SUBTITLE_POLL_MS,
  REMOTE_TECHNICAL_INFO_REFRESH_MS,
} from "@/constants/RemotePlayer";
import {
  NO_REMOTE_PLAYBACK,
  type RemotePlaybackState,
  type RemoteTargetState,
} from "@/modules/mpv-player/src/cast/Cast.types";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
  emitRemoteTarget,
  setCastSession,
} from "@/test-utils/cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  createNativePlayerDoubleState,
  emitNativePlayerEvent,
  type NativePlayerDoubleState,
} from "@/test-utils/nativePlayer";
import { stubReactNative } from "@/test-utils/reactNative";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remoteForeignAtom, remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { pluginSettingsAtom, settingsAtom } from "@/utils/atoms/settings";
import { NO_REMOTE_QUALITY } from "@/utils/cast/remoteQuality";
import { writeErrorLog } from "@/utils/log";
import {
  getSeriesTrackMemory,
  rememberSeriesTrack,
} from "@/utils/seriesTrackMemory";
import { RemotePlayerController } from "./RemotePlayerController";

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
let mockRouted = true;
jest.mock("@/utils/cast/remotePlayerGate", () => ({
  remotePlayerRouted: () => mockRouted,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: false }),
}));
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
// Auto measures the link with a download: here it measures 30 Mb/s.
jest.mock("@/utils/jellyfin/maxStreamingBitrate", () => ({
  // A quality picked by hand is its own cap, as the real one answers.
  resolveMaxStreamingBitrate: jest.fn(
    async (_api: unknown, request: unknown) =>
      typeof request === "number" ? request : 30_000_000,
  ),
}));
jest.mock("@/utils/imageColors", () => ({
  extractImageColor: jest.fn(async () => null),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const livingRoom = {
  kind: "cast" as const,
  id: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  name: "Living Room TV",
  capabilities: { volume: true },
};
const connected: RemoteTargetState = {
  state: "connected",
  target: livingRoom,
  reconnecting: false,
  error: null,
  volume: 1,
  muted: false,
  errorCode: null,
  failedTarget: null,
};

const episode: BaseItemDto = {
  Id: "episode-1",
  Name: "Pilot",
  Type: "Episode",
  MediaType: "Video",
};
const play = {
  item: episode,
  positionTicks: 600_000_000,
  mediaSourceId: "source-1",
  audioIndex: 1,
  subtitleIndex: 2,
};

const store = getDefaultStore();
const signIn = () => {
  store.set(apiAtom, {
    basePath: "https://jellyfin.example.test",
    accessToken: "tok-123",
  } as Api);
  store.set(userAtom, { Id: "user-1" });
};
const envelope = {
  serverAddress: "https://jellyfin.example.test",
  accessToken: "tok-123",
  userId: "user-1",
  receiverName: "Living Room TV",
};

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockCast.remoteTarget = connected;
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  mockRouted = true;
  mockPlayMedia.mockClear();
  stubReactNative({ OS: "android" });
  store.set(remotePlayAtom, null);
  signIn();
});

test("the controller gives native the server when the gate is open", async () => {
  await render(<RemotePlayerController />);
  expect(mockCast.remoteServerCalls).toEqual([envelope]);
});

test("it gives nothing in a release build", async () => {
  mockRouted = false;
  await render(<RemotePlayerController />);
  expect(mockCast.remoteServerCalls).toEqual([]);
});

test("it clears the server on sign out", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    store.set(apiAtom, null);
    store.set(userAtom, null);
  });
  expect(mockCast.remoteServerCalls.at(-1)).toBeNull();
});

// The receiver names its Jellyfin device from the envelope of every message: a new TV gets its own name.
test("another receiver gets the server again under its name", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    emitRemoteTarget(mockCast, {
      ...connected,
      target: { ...livingRoom, id: "9a8b7c6d", name: "Bedroom TV" },
    });
  });
  expect(mockCast.remoteServerCalls.at(-1)).toMatchObject({
    receiverName: "Bedroom TV",
  });
});

// A suspended session (the app in the background on iOS) has no session in JS, while the hub keeps its target
// reconnecting: the server must not change, or native drops the engine the open screen holds.
test("a suspended session keeps the server it had", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    emitRemoteTarget(mockCast, {
      ...connected,
      state: "connecting",
      reconnecting: true,
    });
  });
  expect(mockCast.remoteServerCalls).toEqual([envelope]);
});

// Play here, under a failure: the screen closes, the TV is let go, and the phone plays from where the TV was.
test("Play here continues on the phone from the TV's position", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onPlayHereRequested", {
      positionSec: 42,
      remote: true,
    });
  });

  expect(mockPlayer.dismissals).toBe(1);
  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      itemId: "episode-1",
      mediaSourceId: "source-1",
      audioIndex: 1,
      subtitleIndex: 2,
      playbackPositionTicks: 420_000_000,
      offline: false,
    }),
    { item: episode, itemIsComplete: true },
  );
  expect(store.get(remotePlayAtom)).toBeNull();
});

// A send the TV never started has no TV position: the phone starts where the send asked.
test("Play here after a failed send starts where the send asked", async () => {
  store.set(remotePlayAtom, { play, loaded: false });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onPlayHereRequested", {
      positionSec: 0,
      remote: true,
    });
  });

  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ playbackPositionTicks: 600_000_000 }),
    expect.anything(),
  );
});

// The receiver's error once the item plays (a transcode that fails ten minutes in): said on the screen.
test("an error after the load shows the failure", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onError", {
      error: "playback_info_failed",
      remote: true,
    });
    emitNativePlayerEvent(mockPlayer, "onError", {
      error: "The receiver stopped on a playback error",
      remote: true,
    });
  });

  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_playback_request_failed", canPlayHere: true },
    { message: "player.chromecast_playback_failed", canPlayHere: true },
  ]);
});

test("closing the player sends nothing to the TV", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  store.set(remoteForeignAtom, { itemId: null, title: "Clip", imageUrl: null });
  await render(<RemotePlayerController />);
  const sentBefore = mockCast.loadCalls.length;

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      positionSec: 42,
      durationSec: 120,
      reason: "closeButton",
      remote: true,
    });
  });

  expect(store.get(remotePlayAtom)).toBeNull();
  expect(store.get(remoteForeignAtom)).toBeNull();
  expect(mockCast.loadCalls).toHaveLength(sentBefore);
  expect(mockCast.reloadCalls).toEqual([]);
  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

describe("moving between episodes from the remote player", () => {
  const series: BaseItemDto[] = Array.from({ length: 6 }, (_, index) => ({
    Id: `s1e${index}`,
    Name: `Episode ${index}`,
    Type: "Episode",
    MediaType: "Video",
    SeriesId: "series-1",
    IndexNumber: index + 1,
    RunTimeTicks: 22 * 600_000_000,
  }));
  // Each episode in English by default and in French: the language memory picks among them.
  const fullItem = (id: string) => ({
    ...series.find((entry) => entry.Id === id),
    MediaSources: [
      {
        Id: `source-${id}`,
        MediaStreams: [
          { Type: "Video", Index: 0 },
          { Type: "Audio", Index: 1, Language: "eng", IsDefault: true },
          { Type: "Audio", Index: 2, Language: "fra" },
        ],
      },
    ],
  });

  const serveSeries = () => {
    const api = makeApi();
    api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
      Items: series,
    });
    api.mock
      .onGet(/\/Items\/(s1e\d)/)
      .reply((config) => [
        200,
        fullItem(/\/Items\/(s1e\d)/.exec(config.url ?? "")?.[1] ?? ""),
      ]);
    store.set(apiAtom, api);
  };

  // The phone sent the first episode; the TV has since moved on to the third.
  const tvPlays = (itemId: string, queueItemIds = [itemId]) => {
    mockCast.remotePlayback = {
      ...NO_REMOTE_PLAYBACK,
      connected: true,
      phase: "playing",
      itemId,
      queueItemIds,
      playingIndex: queueItemIds.indexOf(itemId),
    };
  };

  beforeEach(() => {
    serveSeries();
    store.set(remotePlayAtom, {
      play: { item: series[0], positionTicks: 0 },
      loaded: true,
    });
    tvPlays("s1e2");
  });

  afterEach(() => store.set(settingsAtom, null as never));

  const sentIds = (index = 0) =>
    mockCast.loadCalls[index].request.items.map((item) => item.id);

  test("next sends the following episode with its own bounded list", async () => {
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 300,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    // From the TV's episode, not the one the phone sent: the list runs to the end of the series.
    expect(sentIds()).toEqual(["s1e3", "s1e4", "s1e5"]);
    expect(mockCast.loadCalls[0].request.startPositionTicks).toBe(0);
  });

  test("previous sends the episode before", async () => {
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onPreviousEpisodeRequested", {
        positionSec: 1,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    expect(sentIds()[0]).toBe("s1e1");
    expect(mockCast.loadCalls[0].request.startPositionTicks).toBe(0);
  });

  test("choosing an episode in the list sends it from the start", async () => {
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onEpisodeSelected", {
        itemId: "s1e4",
        positionSec: 300,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    expect(sentIds()).toEqual(["s1e4", "s1e5"]);
    expect(mockCast.loadCalls[0].request.startPositionTicks).toBe(0);
  });

  test("each send made by the phone carries the language remembered for the series", async () => {
    store.set(settingsAtom, { rememberAudioSelections: true } as never);
    rememberSeriesTrack("series-1", { audioLang: "fra" });
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 300,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    expect(mockCast.loadCalls[0].request).toMatchObject({
      mediaSourceId: "source-s1e3",
      audioStreamIndex: 2,
    });
  });

  // The phone sent the first three episodes; the fourth comes after them.
  const sentList = {
    play: { item: series[0], positionTicks: 0 },
    loaded: true,
    list: { itemIds: ["s1e0", "s1e1", "s1e2"], nextUpId: "s1e3" },
  };

  const tvMovesTo = async (itemId: string) => {
    tvPlays(itemId, sentList.list.itemIds);
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });
  };

  type Shown = {
    metadata: { itemId: string; title: string };
    nextEpisode: { itemId: string } | null;
    episodeList: { itemId: string; isCurrent: boolean }[];
  };
  const lastShown = () => mockPlayer.remoteUpdates.at(-1) as Shown;

  test("when the TV moves to the next episode the player shows it", async () => {
    store.set(remotePlayAtom, sentList);
    tvPlays("s1e0", sentList.list.itemIds);
    await render(<RemotePlayerController />);

    await tvMovesTo("s1e1");

    await waitFor(() => expect(mockPlayer.remoteUpdates).toHaveLength(1));
    expect(lastShown().metadata).toMatchObject({
      itemId: "s1e1",
      title: "Episode 1",
    });
    expect(
      lastShown().episodeList.find((entry) => entry.isCurrent)?.itemId,
    ).toBe("s1e1");
    // Nothing is sent: the TV goes on with its list.
    expect(mockCast.loadCalls).toEqual([]);
    expect(store.get(remotePlayAtom)?.play.item.Id).toBe("s1e1");
  });

  test("the next up stays what comes after the list", async () => {
    store.set(remotePlayAtom, sentList);
    tvPlays("s1e0", sentList.list.itemIds);
    await render(<RemotePlayerController />);

    await tvMovesTo("s1e1");

    await waitFor(() => expect(mockPlayer.remoteUpdates).toHaveLength(1));
    expect(lastShown().nextEpisode).toMatchObject({ itemId: "s1e3" });
  });

  test("Continue sends the next up with a new bounded list", async () => {
    store.set(remotePlayAtom, sentList);
    // The list played out: the TV holds no item any more.
    tvPlays("s1e2", sentList.list.itemIds);
    mockCast.remotePlayback = {
      ...mockCast.remotePlayback,
      phase: "ended",
      itemId: null,
      playingIndex: -1,
    };
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onNextEpisodeRequested", {
        reason: "nextUp",
        positionSec: 0,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    expect(sentIds()).toEqual(["s1e3", "s1e4", "s1e5"]);
    expect(mockCast.loadCalls[0].request.startPositionTicks).toBe(0);
  });

  test("next on the end card sends the episode after the one that ended", async () => {
    // The screen followed the TV to the last episode of the list, which then ended: the TV holds no item any more.
    store.set(remotePlayAtom, {
      ...sentList,
      play: { item: series[2], positionTicks: 0 },
    });
    tvPlays("s1e2", sentList.list.itemIds);
    mockCast.remotePlayback = {
      ...mockCast.remotePlayback,
      phase: "ended",
      itemId: null,
      playingIndex: -1,
    };
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 0,
        remote: true,
      });
    });

    await waitFor(() => expect(mockCast.loadCalls).toHaveLength(1));
    expect(sentIds()).toEqual(["s1e3", "s1e4", "s1e5"]);
  });

  test("the end of the series closes the player", async () => {
    // The last list ran to the end of the series: nothing comes after it, so the screen closes at its end.
    const toTheEnd = {
      ...sentList,
      play: { item: series[4], positionTicks: 0 },
      list: { itemIds: ["s1e4", "s1e5"], nextUpId: null },
    };
    store.set(remotePlayAtom, toTheEnd);
    tvPlays("s1e4", toTheEnd.list.itemIds);
    await render(<RemotePlayerController />);

    tvPlays("s1e5", toTheEnd.list.itemIds);
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });

    await waitFor(() => expect(mockPlayer.remoteUpdates).toHaveLength(1));
    expect(lastShown().metadata.itemId).toBe("s1e5");
    expect(lastShown().nextEpisode).toBeNull();
  });

  test("a playlist moves inside the receiver's queue", async () => {
    store.set(remotePlayAtom, {
      play: { item: { Id: "film-1", Type: "Movie" }, positionTicks: 0 },
      loaded: true,
    });
    tvPlays("film-1", ["film-1", "film-2"]);
    await render(<RemotePlayerController />);

    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 30,
        remote: true,
      });
      emitNativePlayerEvent(mockPlayer, "onPreviousEpisodeRequested", {
        positionSec: 1,
        remote: true,
      });
    });

    await waitFor(() =>
      expect(mockCast.skipCalls).toEqual(["next", "previous"]),
    );
    expect(mockCast.loadCalls).toEqual([]);
  });

  // Another sender, or the TV's own remote, changed what it plays: the screen asks the server again.
  describe("following what another sender plays", () => {
    const serve = (path: RegExp, status: number, body?: object) =>
      (store.get(apiAtom) as unknown as ReturnType<typeof makeApi>).mock
        .onGet(path)
        .reply(status, body);
    const tvChanges = async (state: Partial<RemotePlaybackState>) => {
      mockCast.remotePlayback = {
        ...NO_REMOTE_PLAYBACK,
        connected: true,
        phase: "playing",
        ...state,
      };
      await act(async () => {
        emitCastEvent(
          mockCast,
          "onRemotePlaybackChanged",
          mockCast.remotePlayback,
        );
      });
    };
    type Config = Shown & { reduced?: boolean; tracks: unknown };
    const lastConfig = () => mockPlayer.remoteUpdates.at(-1) as Config;
    const clip = {
      itemId: null,
      title: "Clip",
      imageUrl: "https://other.example/clip.jpg",
    };

    beforeEach(async () => {
      store.set(remotePlayAtom, sentList);
      tvPlays("s1e0", sentList.list.itemIds);
    });

    test("a change of item rebuilds the config from the server", async () => {
      serve(/\/Items\/film-1/, 200, {
        Id: "film-1",
        Name: "Film",
        Type: "Movie",
        MediaType: "Video",
      });
      await render(<RemotePlayerController />);

      await tvChanges({ itemId: "film-1", queueItemIds: ["film-1"] });

      await waitFor(() => expect(lastConfig()?.metadata.itemId).toBe("film-1"));
      // The episode list, what came next and the tracks of the episode are gone with it.
      expect(lastConfig().episodeList).toEqual([]);
      expect(lastConfig().nextEpisode).toBeNull();
      expect(lastConfig().tracks).toBeNull();
      expect(store.get(remotePlayAtom)?.list).toEqual({
        itemIds: ["film-1"],
        nextUpId: null,
      });
      expect(mockCast.loadCalls).toEqual([]);
    });

    test("a change to a foreign item reduces the open player", async () => {
      await render(<RemotePlayerController />);

      await tvChanges({ ...clip, foreign: true });

      await waitFor(() => expect(lastConfig()?.reduced).toBe(true));
      expect(lastConfig().metadata).toMatchObject({
        title: "Clip",
        artworkUri: clip.imageUrl,
      });
      expect(store.get(remotePlayAtom)).toBeNull();
      expect(store.get(remoteForeignAtom)).toEqual(clip);
    });

    test("the reduced player shows an item of this server the TV goes to", async () => {
      store.set(remotePlayAtom, null);
      store.set(remoteForeignAtom, clip);
      await render(<RemotePlayerController />);

      await tvChanges({ itemId: "s1e2", queueItemIds: ["s1e2"] });

      await waitFor(() => expect(lastConfig()?.metadata.itemId).toBe("s1e2"));
      expect(lastConfig().reduced).toBeUndefined();
      expect(store.get(remoteForeignAtom)).toBeNull();
      expect(store.get(remotePlayAtom)?.list).toEqual({
        itemIds: ["s1e2"],
        nextUpId: "s1e3",
      });
    });

    test("a send made while the server answers keeps the screen", async () => {
      let answer: (reply: [number, object]) => void = () => undefined;
      (store.get(apiAtom) as unknown as ReturnType<typeof makeApi>).mock
        .onGet(/\/Items\/film-1/)
        .reply(() => new Promise((resolve) => (answer = resolve)));
      await render(<RemotePlayerController />);

      await tvChanges({ itemId: "film-1", queueItemIds: ["film-1"] });
      // The phone sends meanwhile: its play owns the screen until the TV takes it.
      store.set(remotePlayAtom, { play, loaded: false });
      await act(async () => {
        answer([200, { Id: "film-1", Type: "Movie", MediaType: "Video" }]);
      });

      expect(mockPlayer.remoteUpdates).toEqual([]);
      expect(mockPlayer.remotePresented).toEqual([]);
      expect(store.get(remotePlayAtom)).toEqual({ play, loaded: false });
    });

    test("a change to music closes the remote player", async () => {
      serve(/\/Items\/track-1/, 200, {
        Id: "track-1",
        Type: "Audio",
        MediaType: "Audio",
      });
      await render(<RemotePlayerController />);

      await tvChanges({ itemId: "track-1", queueItemIds: ["track-1"] });

      await waitFor(() => expect(mockPlayer.dismissals).toBe(1));
      expect(store.get(remotePlayAtom)).toBeNull();
      expect(mockPlayer.remoteUpdates).toEqual([]);
    });
  });
});

describe("tracks and quality from the remote player", () => {
  const item: BaseItemDto = {
    Id: "t1e1",
    Name: "Pilot",
    Type: "Episode",
    MediaType: "Video",
    SeriesId: "series-9",
    MediaSources: [
      {
        Id: "source-t1",
        MediaStreams: [
          { Type: "Video", Index: 0 },
          { Type: "Audio", Index: 1, Language: "eng" },
          { Type: "Audio", Index: 2, Language: "fra" },
          { Type: "Subtitle", Index: 3, Language: "fra", Codec: "subrip" },
        ],
      },
    ],
  };
  const tvReports = (audioIndex: number, subtitleIndex: number) => {
    mockCast.remotePlayback = {
      ...NO_REMOTE_PLAYBACK,
      connected: true,
      phase: "playing",
      itemId: "t1e1",
      audioIndex,
      subtitleIndex,
    };
  };
  const choose = (kind: "audio" | "subtitle", jellyfinIndex: number) =>
    act(async () => {
      emitNativePlayerEvent(mockPlayer, "onTrackSelectionRequested", {
        kind,
        jellyfinIndex,
        positionSec: 30,
        remote: true,
      });
    });
  type Menus = {
    audio: { jellyfinIndex: number; selected?: boolean }[];
    subtitles: { jellyfinIndex: number; selected?: boolean }[];
    quality?: { jellyfinIndex: number; selected?: boolean }[];
  };
  const lastMenus = () => mockPlayer.trackMenuUpdates.at(-1) as Menus;
  const checked = (rows: { jellyfinIndex: number; selected?: boolean }[]) =>
    rows.filter((row) => row.selected).map((row) => row.jellyfinIndex);

  beforeEach(() => {
    store.set(remotePlayAtom, {
      play: {
        item,
        positionTicks: 0,
        mediaSourceId: "source-t1",
        audioIndex: 1,
        subtitleIndex: 3,
      },
      loaded: true,
    });
    tvReports(1, 3);
    store.set(settingsAtom, {
      rememberAudioSelections: true,
      rememberSubtitleSelections: true,
    } as never);
  });

  afterEach(() => store.set(settingsAtom, null as never));

  test("choosing an audio track sends its Jellyfin index to the TV", async () => {
    await render(<RemotePlayerController />);
    await choose("audio", 2);
    await waitFor(() =>
      expect(mockCast.trackCalls).toEqual([{ kind: "audio", index: 2 }]),
    );
  });

  test("the choice is remembered for the series", async () => {
    await render(<RemotePlayerController />);
    await choose("audio", 2);
    await waitFor(() =>
      expect(getSeriesTrackMemory("series-9")?.audioLang).toBe("fra"),
    );
  });

  // The rows wait for the TV: a choice it refused never shows checked.
  test("the menu follows what the TV reports", async () => {
    await render(<RemotePlayerController />);
    await choose("audio", 2);
    await waitFor(() => expect(mockCast.trackCalls).toHaveLength(1));
    expect(mockPlayer.trackMenuUpdates).toEqual([]);

    tvReports(2, 3);
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });

    await waitFor(() => expect(checked(lastMenus().audio)).toEqual([2]));
    expect(checked(lastMenus().subtitles)).toEqual([3]);
    expect(store.get(remotePlayAtom)?.play.audioIndex).toBe(2);
  });

  test("turning subtitles off sends minus one", async () => {
    await render(<RemotePlayerController />);
    await choose("subtitle", -1);
    await waitFor(() =>
      expect(mockCast.trackCalls).toEqual([{ kind: "subtitle", index: -1 }]),
    );
    expect(getSeriesTrackMemory("series-9")?.subtitleLang).toBe("off");
  });

  test("a quality change reloads the item under the new cap", async () => {
    await render(<RemotePlayerController />);
    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 30,
        remote: true,
      });
    });
    await waitFor(() =>
      expect(mockCast.reloadCalls).toEqual([
        { ...envelope, maxBitrate: 4_000_000 },
      ]),
    );
    expect(
      store.get(settingsAtom)?.remotePlaybackQuality?.byTarget[livingRoom.id],
    ).toBe("4 Mb/s");
    expect(checked(lastMenus().quality ?? [])).toEqual([4_000_000]);
  });

  const pickQuality = (bitrateValue: number) =>
    act(async () => {
      emitNativePlayerEvent(mockPlayer, "onQualitySelected", {
        bitrateValue,
        positionSec: 30,
        remote: true,
      });
    });
  // Auto measures the link first: the answer comes when the test says.
  const measureLater = () => {
    let finish: (bitrate: number) => void = () => {};
    (
      jest.requireMock("@/utils/jellyfin/maxStreamingBitrate")
        .resolveMaxStreamingBitrate as jest.Mock
    ).mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    return (bitrate: number) => act(async () => finish(bitrate));
  };

  test("a quality picked while Auto measures is the one the TV gets", async () => {
    const finish = measureLater();
    await render(<RemotePlayerController />);
    await pickQuality(NATIVE_AUTO_QUALITY_INDEX);
    await pickQuality(4_000_000);
    await waitFor(() =>
      expect(mockCast.reloadCalls).toEqual([
        { ...envelope, maxBitrate: 4_000_000 },
      ]),
    );
    await finish(30_000_000);
    expect(mockCast.reloadCalls).toEqual([
      { ...envelope, maxBitrate: 4_000_000 },
    ]);
    expect(checked(lastMenus().quality ?? [])).toEqual([4_000_000]);
  });

  test("closing the remote player while Auto measures sends nothing", async () => {
    const finish = measureLater();
    await render(<RemotePlayerController />);
    await pickQuality(NATIVE_AUTO_QUALITY_INDEX);
    const menus = mockPlayer.trackMenuUpdates.length;
    await act(async () => store.set(remotePlayAtom, null));
    await finish(30_000_000);
    expect(mockCast.reloadCalls).toEqual([]);
    expect(mockPlayer.trackMenuUpdates).toHaveLength(menus);
  });

  test("a quality the admin locked is not changed from the remote player", async () => {
    store.set(pluginSettingsAtom, {
      remotePlaybackQuality: { locked: true, value: NO_REMOTE_QUALITY },
    } as never);
    try {
      await render(<RemotePlayerController />);
      await pickQuality(4_000_000);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockCast.reloadCalls).toEqual([]);
      expect(
        store.get(settingsAtom)?.remotePlaybackQuality?.byTarget[livingRoom.id],
      ).toBeUndefined();
    } finally {
      store.set(pluginSettingsAtom, undefined);
    }
  });

  test("a play without a media source id still remembers the series language", async () => {
    store.set(remotePlayAtom, {
      play: {
        item: { ...item, SeriesId: "series-no-source" },
        positionTicks: 0,
        audioIndex: 1,
        subtitleIndex: 3,
      },
      loaded: true,
    });
    await render(<RemotePlayerController />);
    await choose("audio", 2);
    await waitFor(() =>
      expect(getSeriesTrackMemory("series-no-source")?.audioLang).toBe("fra"),
    );
  });

  // The TV reports what it turned on while the play is on its way; nothing reports it again once it took it.
  test("the tracks the TV reported during the send show once it took the play", async () => {
    const sent = {
      item,
      positionTicks: 0,
      mediaSourceId: "source-t1",
      audioIndex: 1,
      subtitleIndex: -1,
    };
    store.set(remotePlayAtom, { play: sent, loaded: false });
    await render(<RemotePlayerController />);
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });
    await act(async () =>
      store.set(remotePlayAtom, { play: sent, loaded: true }),
    );
    await waitFor(() =>
      expect(store.get(remotePlayAtom)?.play.subtitleIndex).toBe(3),
    );
    expect(checked(lastMenus().subtitles)).toEqual([3]);
  });
});

describe("subtitles while the TV is muted", () => {
  const episode = (id: string, streams: object[]): BaseItemDto => ({
    Id: id,
    Name: id,
    Type: "Episode",
    MediaType: "Video",
    SeriesId: "series-m",
    MediaSources: [
      {
        Id: `source-${id}`,
        MediaStreams: [
          { Type: "Video", Index: 0 },
          { Type: "Audio", Index: 1, Language: "eng", IsDefault: true },
          ...streams,
        ],
      },
    ],
  });
  const text = {
    Type: "Subtitle",
    Index: 3,
    Language: "fre",
    Codec: "subrip",
    IsTextSubtitleStream: true,
  };
  const picture = {
    Type: "Subtitle",
    Index: 4,
    Language: "eng",
    Codec: "pgssub",
    IsTextSubtitleStream: false,
  };
  const shows = (item: BaseItemDto, subtitleIndex = -1) => {
    store.set(remotePlayAtom, {
      play: {
        item,
        positionTicks: 0,
        mediaSourceId: `source-${item.Id}`,
        audioIndex: 1,
        subtitleIndex,
      },
      loaded: true,
    });
  };
  const tvShows = async (itemId: string, subtitleIndex: number) => {
    mockCast.remotePlayback = {
      ...NO_REMOTE_PLAYBACK,
      connected: true,
      phase: "playing",
      itemId,
      audioIndex: 1,
      subtitleIndex,
    };
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });
  };
  const mute = async (muted: boolean) => {
    await act(async () => {
      emitRemoteTarget(mockCast, { ...connected, muted });
    });
  };
  const subtitleCalls = () =>
    mockCast.trackCalls
      .filter((call) => call.kind === "subtitle")
      .map((call) => call.index);

  beforeEach(() => {
    store.set(settingsAtom, {
      subtitlesOnMute: true,
      subtitlesOnMuteAllowRestart: false,
    } as never);
    shows(episode("m1", [text, picture]));
  });

  afterEach(() => store.set(settingsAtom, null as never));

  test("muting the TV turns on the subtitle the policy picks", async () => {
    await render(<RemotePlayerController />);
    await mute(true);
    await waitFor(() => expect(subtitleCalls()).toEqual([3]));
    expect(mockPlayer.notices).toEqual(["player.auto_subtitles_enabled"]);
  });

  test("the sound coming back turns it off again", async () => {
    await render(<RemotePlayerController />);
    await mute(true);
    await waitFor(() => expect(subtitleCalls()).toEqual([3]));
    await tvShows("m1", 3);
    await mute(false);
    await waitFor(() => expect(subtitleCalls()).toEqual([3, -1]));
  });

  test("a subtitle the user chose is left alone", async () => {
    await render(<RemotePlayerController />);
    await mute(true);
    await waitFor(() => expect(subtitleCalls()).toEqual([3]));
    await tvShows("m1", 3);
    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onTrackSelectionRequested", {
        kind: "subtitle",
        jellyfinIndex: 4,
        positionSec: 30,
        remote: true,
      });
    });
    await tvShows("m1", 4);
    await mute(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subtitleCalls()).toEqual([3, 4]);
  });

  // A picture subtitle is burned into the picture by the server: turning it on plays the item again.
  test("a subtitle that would reload the stream is not turned on without the setting", async () => {
    shows(episode("m2", [picture]));
    await render(<RemotePlayerController />);
    await mute(true);
    await waitFor(() =>
      expect(mockPlayer.notices).toEqual([
        "player.auto_subtitles_restart_required",
      ]),
    );
    expect(subtitleCalls()).toEqual([]);
  });

  test("nothing happens with the setting off", async () => {
    store.set(settingsAtom, { subtitlesOnMute: false } as never);
    await render(<RemotePlayerController />);
    await mute(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subtitleCalls()).toEqual([]);
    expect(mockPlayer.notices).toEqual([]);
  });

  // The TV goes on to the next episode with the subtitle it had: it stays ours, and goes with the sound.
  test("the next episode keeps the subtitle while the TV stays muted", async () => {
    await render(<RemotePlayerController />);
    await mute(true);
    await waitFor(() => expect(subtitleCalls()).toEqual([3]));
    await tvShows("m1", 3);
    await act(async () => {
      shows(episode("m3", [text, picture]), 3);
    });
    await tvShows("m3", 3);
    expect(subtitleCalls()).toEqual([3]);
    await mute(false);
    await waitFor(() => expect(subtitleCalls()).toEqual([3, -1]));
  });
});

describe("technical info from the remote player", () => {
  const source: MediaSourceInfo = {
    Id: "source-1",
    Container: "mkv",
    MediaStreams: [{ Type: "Video", Index: 0, Codec: "hevc" }],
  };
  const receiverSession = {
    Client: "Chromecast",
    UserId: "user-1",
    DeviceName: "Living Room TV",
    NowPlayingItem: { Id: "episode-1" },
    PlayState: { PlayMethod: "Transcode" },
    TranscodingInfo: {
      VideoCodec: "h264",
      TranscodeReasons: ["ContainerBitrateExceedsLimit"],
    },
  };
  const SESSIONS = /\/Sessions/;
  let api = makeApi();
  const panel = (event: "onTechnicalInfoRequested" | "onTechnicalInfoClosed") =>
    act(async () => {
      emitNativePlayerEvent(mockPlayer, event, { remote: true });
    });

  beforeEach(() => {
    api = makeApi();
    api.mock.onGet(SESSIONS).reply(200, [receiverSession]);
    store.set(apiAtom, api);
    store.set(remotePlayAtom, {
      play: { ...play, item: { ...episode, MediaSources: [source] } },
      loaded: true,
    });
    mockCast.remotePlayback = {
      ...NO_REMOTE_PLAYBACK,
      connected: true,
      phase: "playing",
      itemId: "episode-1",
      playMethod: "Transcode",
    };
  });

  afterEach(() => jest.useRealTimers());

  test("the panel shows what the TV plays, as the server says", async () => {
    await render(<RemotePlayerController />);
    await panel("onTechnicalInfoRequested");

    await waitFor(() =>
      expect(mockPlayer.technicalInfoUpdates).toHaveLength(1),
    );
    expect(mockPlayer.technicalInfoUpdates[0]).toEqual(
      expect.arrayContaining([
        { label: "player.technical_info.play_method", value: "Transcoding" },
        { label: "player.technical_info.video_codec", value: "H.264" },
        {
          label: "player.technical_info.transcode_reasons",
          value: "Bitrate exceeds limit",
        },
      ]),
    );
  });

  // A name with no Latin letter reaches the receiver as the fallback alone, the senders naming no id: the
  // session is looked for under that same name.
  test("a TV whose name is not Latin still finds its session", async () => {
    mockCast.remoteTarget = {
      ...connected,
      target: { ...livingRoom, name: "Гостиная" },
    };
    api.mock
      .onGet(SESSIONS)
      .reply(200, [{ ...receiverSession, DeviceName: "Chromecast" }]);
    await render(<RemotePlayerController />);
    await panel("onTechnicalInfoRequested");

    await waitFor(() =>
      expect(mockPlayer.technicalInfoUpdates.at(-1)).toEqual(
        expect.arrayContaining([
          { label: "player.technical_info.video_codec", value: "H.264" },
        ]),
      ),
    );
  });

  test("no server session still shows the play method", async () => {
    api.mock.onGet(SESSIONS).reply(500);
    await render(<RemotePlayerController />);
    await panel("onTechnicalInfoRequested");

    await waitFor(() =>
      expect(mockPlayer.technicalInfoUpdates).toEqual([
        [{ label: "player.technical_info.play_method", value: "Transcoding" }],
      ]),
    );
    // The local log is exported to public issues: the failed request's headers stay out of it.
    expect(jest.mocked(writeErrorLog)).toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(writeErrorLog).mock.calls)).not.toContain(
      api.accessToken,
    );
  });

  test("the lines stop refreshing when the panel closes", async () => {
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    await render(<RemotePlayerController />);
    await panel("onTechnicalInfoRequested");
    await waitFor(() =>
      expect(mockPlayer.technicalInfoUpdates).toHaveLength(1),
    );
    await act(async () => {
      jest.advanceTimersByTime(REMOTE_TECHNICAL_INFO_REFRESH_MS);
    });
    await waitFor(() =>
      expect(mockPlayer.technicalInfoUpdates).toHaveLength(2),
    );

    await panel("onTechnicalInfoClosed");
    await act(async () => {
      jest.advanceTimersByTime(REMOTE_TECHNICAL_INFO_REFRESH_MS * 3);
    });

    expect(mockPlayer.technicalInfoUpdates).toHaveLength(2);
  });
});

// The server searches and downloads; the TV plays the item again with the new subtitle. The phone has no file to add.
describe("subtitle search from the remote player", () => {
  const ITEM = /\/Items\/s1e1(\?|$)/;
  const SEARCH = /\/Items\/s1e1\/RemoteSearch\/Subtitles\/fre/;
  const DOWNLOAD = /\/Items\/s1e1\/RemoteSearch\/Subtitles\/r-1/;
  const streams = [
    { Type: "Video" as const, Index: 0 },
    { Type: "Audio" as const, Index: 1, Language: "eng" },
    { Type: "Subtitle" as const, Index: 2, Language: "eng", Codec: "subrip" },
  ];
  const item: BaseItemDto = {
    Id: "s1e1",
    Name: "Pilot",
    Type: "Episode",
    MediaType: "Video",
    MediaSources: [{ Id: "source-s1", MediaStreams: streams }],
  };
  // The item as the server lists it once the file is saved next to the media.
  const withFrench: BaseItemDto = {
    ...item,
    MediaSources: [
      {
        Id: "source-s1",
        MediaStreams: [
          ...streams,
          { Type: "Subtitle", Index: 3, Language: "fre", Codec: "subrip" },
        ],
      },
    ],
  };
  const found = [
    {
      Id: "r-1",
      Name: "Pilot.fr.srt",
      ProviderName: "Open Subtitles",
      Format: "srt",
      ThreeLetterISOLanguageName: "fre",
    },
  ];
  const result = expect.objectContaining({ id: "r-1", language: "fre" });
  let api = makeApi();
  const search = () =>
    act(async () => {
      emitNativePlayerEvent(mockPlayer, "onSubtitleSearchRequested", {
        language: "fre",
        remote: true,
      });
    });
  const download = async () => {
    await search();
    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates).toHaveLength(1),
    );
    await act(async () => {
      emitNativePlayerEvent(mockPlayer, "onSubtitleDownloadRequested", {
        resultId: "r-1",
        positionSec: 30,
        remote: true,
      });
    });
  };
  const poll = async (times: number) => {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        jest.advanceTimersByTime(REMOTE_SUBTITLE_POLL_MS);
      });
    }
  };

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    api = makeApi();
    api.mock.onGet(SEARCH).reply(200, found);
    store.set(apiAtom, api);
    store.set(remotePlayAtom, {
      play: {
        item,
        positionTicks: 0,
        mediaSourceId: "source-s1",
        audioIndex: 1,
        subtitleIndex: 2,
      },
      loaded: true,
    });
    mockCast.remotePlayback = {
      ...NO_REMOTE_PLAYBACK,
      connected: true,
      phase: "playing",
      itemId: "s1e1",
      audioIndex: 1,
      subtitleIndex: 2,
    };
  });

  afterEach(() => jest.useRealTimers());

  test("a search answers with the server's results", async () => {
    await render(<RemotePlayerController />);
    await search();

    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates).toEqual([
        { status: "results", results: [result] },
      ]),
    );
  });

  test("a search the account may not make says so", async () => {
    api.mock.onGet(SEARCH).reply(403);
    await render(<RemotePlayerController />);
    await search();

    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates).toEqual([
        {
          status: "error",
          results: [],
          errorMessage: "player.subtitle_search_not_allowed",
        },
      ]),
    );
  });

  test("a downloaded subtitle reloads the TV with it selected", async () => {
    api.mock.onPost(DOWNLOAD).reply(204);
    api.mock.onGet(ITEM).reply(200, withFrench);
    await render(<RemotePlayerController />);
    await download();
    await poll(1);

    await waitFor(() => expect(mockCast.reloadSubtitles).toEqual([3]));
    // No cap named: the TV keeps the quality it plays at.
    expect(mockCast.reloadCalls).toEqual([
      {
        serverAddress: api.basePath,
        accessToken: api.accessToken,
        userId: "user-1",
        receiverName: "Living Room TV",
      },
    ]);
    expect(mockPlayer.subtitleSearchUpdates.at(-1)).toEqual({
      status: "applied",
      results: [],
    });

    // The TV takes it: the menu lists the new subtitle, checked.
    mockCast.remotePlayback = { ...mockCast.remotePlayback, subtitleIndex: 3 };
    await act(async () => {
      emitCastEvent(
        mockCast,
        "onRemotePlaybackChanged",
        mockCast.remotePlayback,
      );
    });
    const subtitles = (
      mockPlayer.trackMenuUpdates.at(-1) as {
        subtitles: { jellyfinIndex: number; selected?: boolean }[];
      }
    ).subtitles;
    expect(subtitles.filter((row) => row.selected)).toEqual([
      expect.objectContaining({ jellyfinIndex: 3 }),
    ]);
  });

  test("a failed download says so and reloads nothing", async () => {
    api.mock.onPost(DOWNLOAD).reply(500);
    await render(<RemotePlayerController />);
    await download();

    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates.at(-1)).toEqual({
        status: "results",
        results: [result],
        errorMessage: "player.search_failed",
      }),
    );
    expect(mockCast.reloadCalls).toEqual([]);
    expect(jest.mocked(writeErrorLog)).toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(writeErrorLog).mock.calls)).not.toContain(
      api.accessToken,
    );
  });

  // The sheet shows the download in progress from the tap: an outcome always answers it.
  test("a download whose item the TV left says so and reloads nothing", async () => {
    api.mock.onPost(DOWNLOAD).reply(204);
    api.mock.onGet(ITEM).reply(200, withFrench);
    await render(<RemotePlayerController />);
    await download();
    mockCast.remotePlayback = { ...mockCast.remotePlayback, itemId: "s1e2" };
    await poll(1);

    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates.at(-1)).toEqual({
        status: "results",
        results: [result],
        errorMessage: "player.subtitle_apply_failed",
      }),
    );
    expect(mockCast.reloadCalls).toEqual([]);
  });

  test("a subtitle the server never lists says so and reloads nothing", async () => {
    api.mock.onPost(DOWNLOAD).reply(204);
    api.mock.onGet(ITEM).reply(200, item);
    await render(<RemotePlayerController />);
    await download();
    await poll(REMOTE_SUBTITLE_POLL_ATTEMPTS);

    await waitFor(() =>
      expect(mockPlayer.subtitleSearchUpdates.at(-1)).toEqual({
        status: "results",
        results: [result],
        errorMessage: "player.subtitle_apply_failed",
      }),
    );
    expect(mockCast.reloadCalls).toEqual([]);
  });
});
