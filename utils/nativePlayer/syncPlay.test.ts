import type { TFunction } from "i18next";
import type { NativePlayerSyncPlayAction } from "@/modules/mpv-player";
import { initialSyncPlaySnapshot } from "@/utils/syncplay/controller";
import {
  buildNativeSyncPlayState,
  dispatchNativeSyncPlayAction,
  isSameStreamUrl,
} from "./syncPlay";

const coordinator = () => ({
  enabled: true,
  group: { GroupId: "group" },
  requestUnpause: jest.fn(),
  requestPause: jest.fn(),
  requestSeek: jest.fn(),
  requestNext: jest.fn(),
  requestPrevious: jest.fn(),
  requestStop: jest.fn(),
  notifyEnded: jest.fn(),
  leaveGroup: jest.fn(),
  suspendGroup: jest.fn(),
  getGroup: jest.fn(),
  setRepeatMode: jest.fn(),
  setShuffleMode: jest.fn(),
  setIgnoreWait: jest.fn(),
  requestPlaylistItem: jest.fn(),
  removePlaylistItems: jest.fn(),
  movePlaylistItem: jest.fn(),
  clearPlaylist: jest.fn(),
  queueItems: jest.fn(),
  playItems: jest.fn(),
});

test.each<[NativePlayerSyncPlayAction, string, unknown[]]>([
  [{ action: "play" }, "requestUnpause", []],
  [{ action: "pause" }, "requestPause", []],
  [{ action: "seek", positionSec: 12.3456789 }, "requestSeek", [123456789]],
  [{ action: "next" }, "requestNext", []],
  [{ action: "previous" }, "requestPrevious", []],
  [{ action: "stop" }, "requestStop", []],
  [{ action: "ended" }, "notifyEnded", [undefined]],
  [
    { action: "ended", playlistItemId: "outgoing-entry" },
    "notifyEnded",
    ["outgoing-entry"],
  ],
  [{ action: "leave" }, "leaveGroup", []],
  [{ action: "suspend" }, "suspendGroup", []],
  [{ action: "refresh" }, "getGroup", ["group"]],
  [{ action: "repeat", mode: "RepeatAll" }, "setRepeatMode", ["RepeatAll"]],
  [{ action: "shuffle", mode: "Sorted" }, "setShuffleMode", ["Sorted"]],
  [{ action: "ignoreWait", value: false }, "setIgnoreWait", [false]],
  [
    { action: "select", playlistItemId: "duplicate-2" },
    "requestPlaylistItem",
    ["duplicate-2"],
  ],
  [
    { action: "remove", playlistItemId: "duplicate-1" },
    "removePlaylistItems",
    [["duplicate-1"]],
  ],
  [
    { action: "move", playlistItemId: "duplicate-2", newIndex: 0 },
    "movePlaylistItem",
    ["duplicate-2", 0],
  ],
  [{ action: "clear", value: false }, "clearPlaylist", [false]],
  [{ action: "clear", value: true }, "clearPlaylist", [true]],
])(
  "native %j requests the shared Jellyfin action",
  async (action, method, args) => {
    const sync = coordinator();
    await dispatchNativeSyncPlayAction(sync as never, action);
    expect(sync[method as keyof typeof sync]).toHaveBeenCalledWith(...args);
  },
);

test.each<NativePlayerSyncPlayAction>([
  { action: "seek", positionSec: Number.NaN },
  { action: "seek", positionSec: -1 },
  { action: "move", playlistItemId: "entry", newIndex: -1 },
  { action: "repeat", mode: "unknown" },
  // Adding to the queue left the native players. A stale binary still asks.
  { action: "queue" } as unknown as NativePlayerSyncPlayAction,
])("invalid native payload %j cannot mutate the group", async (action) => {
  const sync = coordinator();
  await expect(
    dispatchNativeSyncPlayAction(sync as never, action),
  ).rejects.toThrow();
  for (const value of Object.values(sync))
    if (jest.isMockFunction(value)) expect(value).not.toHaveBeenCalled();
});

test("a late native action after leave does not affect another playback", async () => {
  const sync = coordinator();
  sync.enabled = false;
  await dispatchNativeSyncPlayAction(sync as never, { action: "ended" });
  expect(sync.notifyEnded).not.toHaveBeenCalled();
});

test("native state preserves playlist identities for duplicate media", () => {
  const state = buildNativeSyncPlayState(
    {
      ...initialSyncPlaySnapshot(),
      connected: true,
      group: {
        GroupId: "group",
        GroupName: "Official group",
        Participants: [],
      },
      playlist: [
        { ItemId: "movie", PlaylistItemId: "first" },
        { ItemId: "movie", PlaylistItemId: "second" },
      ],
      currentPlaylistItemId: "second",
      repeatMode: "RepeatOne",
      ignoreWait: true,
    },
    {
      movie: {
        title: "Clip",
        subtitle: "2024",
        imageUrl: "http://host/Items/movie/Images/Primary",
      },
    },
    ((key: string) => key) as TFunction,
  );
  const row = {
    itemId: "movie",
    title: "Clip",
    subtitle: "2024",
    imageUrl: "http://host/Items/movie/Images/Primary",
  };
  expect(state?.playlist).toEqual([
    { ...row, playlistItemId: "first" },
    { ...row, playlistItemId: "second" },
  ]);
  expect(state).toMatchObject({
    currentPlaylistItemId: "second",
    repeatMode: "RepeatOne",
    ignoreWait: true,
  });
  expect(
    buildNativeSyncPlayState(
      initialSyncPlaySnapshot(),
      {},
      ((key: string) => key) as TFunction,
    ),
  ).toBeNull();
});

describe("isSameStreamUrl", () => {
  test("matches a URL the native side percent-encoded", () => {
    expect(
      isSameStreamUrl(
        "http://host/media/My Movie [2020].strm",
        "http://host/media/My%20Movie%20%5B2020%5D.strm",
      ),
    ).toBe(true);
  });

  test("tells two streams apart", () => {
    expect(
      isSameStreamUrl(
        "http://host/Videos/a/stream.mkv",
        "http://host/Videos/b/stream.mkv",
      ),
    ).toBe(false);
  });

  test("falls back to the raw strings when one is not decodable", () => {
    expect(isSameStreamUrl("http://host/100%", "http://host/100%")).toBe(true);
    expect(isSameStreamUrl("http://host/100%", "http://host/50%")).toBe(false);
  });
});
