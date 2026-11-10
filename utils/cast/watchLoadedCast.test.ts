import type { CastMediaStatus } from "@/modules/mpv-player/src/cast";
import {
  castDoubleDevice,
  createCastDoubleState,
  emitCastSessionEvent,
  setCastSession,
} from "@/test-utils/cast";
import { secondsToTicks } from "@/utils/time";
import {
  type CastPlaybackFailure,
  type LoadedCast,
  onCastPlaybackFailed,
  watchLoadedCast,
} from "./watchLoadedCast";

const mockCast = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  // The factory runs before this file's body, so the state is read lazily.
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));

/** A remote media client whose status updates the test emits. */
const makeClient = () => {
  let listener: ((status: CastMediaStatus | null) => void) | undefined;
  return {
    sessionId: mockCast.session?.id ?? "no-session",
    onMediaStatusUpdated: jest.fn((handler: typeof listener) => {
      listener = handler;
      return {
        remove: () => {
          listener = undefined;
        },
      };
    }),
    emit: (next: CastMediaStatus | null) => listener?.(next),
  };
};

const status = (
  playerState: CastMediaStatus["playerState"],
  {
    playSessionId = "play-1",
    itemId = "item-1",
    position = 0,
    idleReason,
  }: {
    playSessionId?: string;
    itemId?: string;
    position?: number;
    idleReason?: CastMediaStatus["idleReason"];
  } = {},
): CastMediaStatus => ({
  playerState,
  idleReason,
  currentItemId: 1,
  streamPosition: position,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: {
    contentId: itemId,
    customData: {
      itemId,
      playSessionId,
      mediaSourceId: "source-1",
      audioStreamIndex: 1,
      subtitleStreamIndex: -1,
    },
    metadata: { title: "Festen", subtitle: null },
  },
  customData: null,
});

const load = (overrides: Partial<LoadedCast> = {}): LoadedCast => ({
  item: { Id: "item-1", Name: "Festen", Type: "Movie" },
  sent: {
    itemId: "item-1",
    mediaSourceId: "source-1",
    audioIndex: 1,
    subtitleIndex: -1,
    playbackPositionTicks: secondsToTicks(120),
  },
  receiverName: "Salon - Chromecast",
  playSessionId: "play-1",
  choice: 7,
  userId: "user-1",
  ...overrides,
});

let failures: CastPlaybackFailure[] = [];
let subscription: { remove(): void };
let stopWatching = () => {};

beforeEach(() => {
  setCastSession(mockCast, "session-1", castDoubleDevice());
  failures = [];
  subscription = onCastPlaybackFailed((failure) => failures.push(failure));
});

afterEach(() => {
  stopWatching();
  subscription.remove();
});

test("reports a load the receiver stops on with an error, from where it played it", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(status("playing", { position: 150 }));
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures).toEqual([
    {
      item: load().item,
      request: {
        itemId: "item-1",
        mediaSourceId: "source-1",
        audioIndex: 1,
        subtitleIndex: -1,
        playbackPositionTicks: secondsToTicks(150),
      },
      receiverName: "Salon - Chromecast",
      choice: 7,
      userId: "user-1",
    },
  ]);
});

test("goes on from the position sent when the receiver never played the load", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(status("buffering", { position: 0 }));
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures.map((failure) => failure.request)).toEqual([load().sent]);
});

test.each(["finished", "cancelled", "interrupted"] as const)(
  "says nothing for a load that %s, nor for an error after it",
  (idleReason) => {
    const client = makeClient();
    stopWatching = watchLoadedCast(client as never, load());

    client.emit(status("playing", { position: 30 }));
    client.emit(status("idle", { idleReason }));
    client.emit(status("idle", { idleReason: "error" }));

    expect(failures).toEqual([]);
  },
);

test("stops following its load once another one replaces it", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(status("playing", { playSessionId: "play-2", itemId: "item-2" }));
  client.emit(status("idle", { playSessionId: "play-1", idleReason: "error" }));

  expect(failures).toEqual([]);
});

// The iOS SDK drops the media from an idle status: the reason is all that comes, and it is the load's own end.
test("reports an error status that comes without its media, as on iOS", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(status("playing", { position: 150 }));
  client.emit({
    ...status("idle", { idleReason: "error" }),
    mediaInfo: null,
  });

  expect(
    failures.map((failure) => failure.request.playbackPositionTicks),
  ).toEqual([secondsToTicks(150)]);
});

test("says nothing for a load that finished, its status without media", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit({
    ...status("idle", { idleReason: "finished" }),
    mediaInfo: null,
  });
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures).toEqual([]);
});

test("stops following its load once the receiver has no media", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(null);
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures).toEqual([]);
});

test("stops following its load at the end of its Cast session", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  emitCastSessionEvent(mockCast, "ended");
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures).toEqual([]);
});

test("a new load replaces the one followed before", () => {
  const first = makeClient();
  const second = makeClient();
  watchLoadedCast(first as never, load());
  stopWatching = watchLoadedCast(
    second as never,
    load({ playSessionId: "play-2" }),
  );

  first.emit(status("idle", { idleReason: "error" }));

  expect(failures).toEqual([]);
});

test("reports a failure once", () => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client as never, load());

  client.emit(status("idle", { idleReason: "error" }));
  client.emit(status("idle", { idleReason: "error" }));

  expect(failures).toHaveLength(1);
});
