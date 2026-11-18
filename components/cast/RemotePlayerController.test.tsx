import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { act, render, waitFor } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
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
import { settingsAtom } from "@/utils/atoms/settings";
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
