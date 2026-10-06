import type { TFunction } from "i18next";
import type { NativePlayerSyncPlayAction } from "@/modules/mpv-player";
import { initialSyncPlaySnapshot } from "@/utils/syncplay/controller";
import {
  buildNativeSyncPlayState,
  dispatchNativeSyncPlayAction,
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
  [
    { action: "queue", itemIds: ["movie", "movie"], mode: "QueueNext" },
    "queueItems",
    [["movie", "movie"], "QueueNext"],
  ],
  [{ action: "playItems", itemIds: ["movie"] }, "playItems", [["movie"], 0, 0]],
])(
  "native %j requests the shared Jellyfin action",
  async (action, method, args) => {
    const sync = coordinator();
    await dispatchNativeSyncPlayAction(sync as never, action, jest.fn());
    expect(sync[method as keyof typeof sync]).toHaveBeenCalledWith(...args);
  },
);

test.each<NativePlayerSyncPlayAction>([
  { action: "seek", positionSec: Number.NaN },
  { action: "seek", positionSec: -1 },
  { action: "move", playlistItemId: "entry", newIndex: -1 },
  { action: "repeat", mode: "unknown" },
  { action: "queue", itemIds: ["entry"], mode: "unknown" },
])("invalid native payload %j cannot mutate the group", async (action) => {
  const sync = coordinator();
  await expect(
    dispatchNativeSyncPlayAction(sync as never, action, jest.fn()),
  ).rejects.toThrow();
  for (const value of Object.values(sync))
    if (jest.isMockFunction(value)) expect(value).not.toHaveBeenCalled();
});

test("a late native action after leave does not affect another playback", async () => {
  const sync = coordinator();
  sync.enabled = false;
  await dispatchNativeSyncPlayAction(
    sync as never,
    { action: "ended" },
    jest.fn(),
  );
  expect(sync.notifyEnded).not.toHaveBeenCalled();
});

test("native search stays local to the current library sheet", async () => {
  const search = jest.fn();
  await dispatchNativeSyncPlayAction(
    coordinator() as never,
    { action: "search", query: "clip" },
    search,
  );
  expect(search).toHaveBeenCalledWith("clip");
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
    { movie: "Clip" },
    { items: [], query: "", loading: false },
    ((key: string) => key) as TFunction,
  );
  expect(state?.playlist).toEqual([
    { itemId: "movie", playlistItemId: "first", title: "Clip" },
    { itemId: "movie", playlistItemId: "second", title: "Clip" },
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
      { items: [], query: "", loading: false },
      ((key: string) => key) as TFunction,
    ),
  ).toBeNull();
});
