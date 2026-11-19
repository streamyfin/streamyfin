import type { TFunction } from "i18next";
import { createStore } from "jotai";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast";
import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";
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
import { openRemotePlayer } from "./openRemotePlayer";

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
jest.mock("@/utils/imageColors", () => ({
  extractImageColor: jest.fn(async () => null),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const t = ((key: string) => key) as unknown as TFunction;

const livingRoom: RemoteTarget = {
  kind: "cast",
  id: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  name: "Living Room TV",
  capabilities: { volume: true },
};

let api = makeApi();
let store = createStore();
const openMusicPlayer = jest.fn();
const open = () =>
  openRemotePlayer(
    { api, userId: "user-1", store, t, openMusicPlayer },
    livingRoom,
  );
const tvPlays = (state: Partial<RemotePlaybackState>) => {
  mockCast.remotePlayback = {
    ...mockCast.remotePlayback,
    connected: true,
    phase: "playing",
    ...state,
  };
};
const presented = () =>
  mockPlayer.remotePresented[0] as {
    reduced?: boolean;
    metadata: { itemId?: string; title?: string; artworkUri?: string };
    episodeList: { itemId: string; isCurrent: boolean }[];
    nextEpisode: { itemId: string } | null;
  };

beforeEach(() => {
  mockCast = createCastDoubleState();
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  mockPlayer.remoteUpdateAnswer = false;
  api = makeApi();
  store = createStore();
  openMusicPlayer.mockReset();
  stubReactNative({ OS: "android" });
});

test("Remote opens the full player for an item the server returns", async () => {
  api.mock.onGet(/\/Items\/s1e2/).reply(200, {
    Id: "s1e2",
    Name: "Episode 2",
    Type: "Episode",
    MediaType: "Video",
    SeriesId: "series-1",
  });
  api.mock.onGet(/\/Shows\/series-1\/Episodes/).reply(200, {
    Items: [1, 2, 3].map((index) => ({
      Id: `s1e${index}`,
      Name: `Episode ${index}`,
      Type: "Episode",
      SeriesId: "series-1",
      IndexNumber: index,
    })),
  });
  tvPlays({ itemId: "s1e2", queueItemIds: ["s1e2"], positionSec: 300 });

  await expect(open()).resolves.toBe("known");

  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(presented().reduced).toBeUndefined();
  expect(presented().metadata.itemId).toBe("s1e2");
  expect(presented().episodeList.find((e) => e.isCurrent)?.itemId).toBe("s1e2");
  expect(presented().nextEpisode).toMatchObject({ itemId: "s1e3" });
  // Held for the screen's presses: the next one goes from this phone, under its account.
  expect(store.get(remotePlayAtom)).toMatchObject({
    loaded: true,
    play: { positionTicks: 3_000_000_000 },
    list: { itemIds: ["s1e2"], nextUpId: "s1e3" },
  });
});

test("an item the server does not return gets the reduced player", async () => {
  api.mock.onGet(/\/Items\/other-1/).reply(404);
  tvPlays({
    itemId: "other-1",
    title: "Elsewhere",
    imageUrl: "https://other.example/1.jpg",
  });

  await expect(open()).resolves.toBe("foreign");

  expect(presented()).toMatchObject({
    reduced: true,
    metadata: { title: "Elsewhere", artworkUri: "https://other.example/1.jpg" },
  });
  expect(store.get(remotePlayAtom)).toBeNull();
  expect(store.get(remoteForeignAtom)).toEqual({
    itemId: "other-1",
    title: "Elsewhere",
    imageUrl: "https://other.example/1.jpg",
  });
});

test("no item id gets the reduced player with the Cast title and image", async () => {
  tvPlays({
    itemId: null,
    foreign: true,
    title: "Clip",
    imageUrl: "https://other.example/clip.jpg",
  });

  await expect(open()).resolves.toBe("foreign");

  expect(presented()).toMatchObject({
    reduced: true,
    metadata: { title: "Clip", artworkUri: "https://other.example/clip.jpg" },
  });
});

test("an unreachable server gets the reduced player", async () => {
  api.mock.onGet(/\/Items\/s1e2/).networkError();
  tvPlays({ itemId: "s1e2", title: "Episode 2", imageUrl: null });

  await expect(open()).resolves.toBe("foreign");

  expect(presented()).toMatchObject({
    reduced: true,
    metadata: { title: "Episode 2" },
  });
});

test("music sent by the app opens the music player", async () => {
  api.mock.onGet(/\/Items\/track-1/).reply(200, {
    Id: "track-1",
    Type: "Audio",
    MediaType: "Audio",
  });
  tvPlays({ itemId: "track-1" });

  await expect(open()).resolves.toBe("music");

  expect(openMusicPlayer).toHaveBeenCalledTimes(1);
  expect(mockPlayer.remotePresented).toEqual([]);
});

test("nothing loaded opens nothing", async () => {
  tvPlays({ itemId: null, phase: "none" });

  await expect(open()).resolves.toBe("nothing");

  expect(mockPlayer.remotePresented).toEqual([]);
  expect(mockPlayer.remoteUpdates).toEqual([]);
  expect(openMusicPlayer).not.toHaveBeenCalled();
});

test("a send still on its way keeps Remote from replacing it", async () => {
  api.mock.onGet(/\/Items\/s1e1/).reply(200, {
    Id: "s1e1",
    Name: "Episode 1",
    Type: "Movie",
    MediaType: "Video",
  });
  tvPlays({ itemId: "s1e1", queueItemIds: ["s1e1"] });
  const sending = { play: { item: { Id: "s1e3" } }, loaded: false } as never;
  store.set(remotePlayAtom, sending);

  await expect(open()).resolves.toBe("sending");

  // The send presents its own screen once the TV takes it; nothing superseded it.
  expect(mockPlayer.remotePresented).toHaveLength(0);
  expect(store.get(remotePlayAtom)).toBe(sending);
});

test("the TV moving on while the server answers opens what it plays now", async () => {
  api.mock.onGet(/\/Items\/film-1/).reply(() => {
    tvPlays({ itemId: "film-2", queueItemIds: ["film-2"] });
    return [
      200,
      { Id: "film-1", Name: "Film 1", Type: "Movie", MediaType: "Video" },
    ];
  });
  api.mock.onGet(/\/Items\/film-2/).reply(200, {
    Id: "film-2",
    Name: "Film 2",
    Type: "Movie",
    MediaType: "Video",
  });
  tvPlays({ itemId: "film-1", queueItemIds: ["film-1"] });

  await expect(open()).resolves.toBe("known");

  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(presented().metadata.itemId).toBe("film-2");
  expect(store.get(remotePlayAtom)?.play.item.Id).toBe("film-2");
});
