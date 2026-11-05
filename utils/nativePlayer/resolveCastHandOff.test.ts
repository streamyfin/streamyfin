import { localSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import {
  mayHandOff,
  nextStepAfterSend,
  resolveCastHandOff,
  stepAfterRefusal,
} from "./resolveCastHandOff";

const item = { Id: "item-1", Name: "Film", Type: "Movie" } as never;
const session = {
  item,
  mediaSourceId: "source-1",
  currentAudioIndex: 2,
  currentSubtitleIndex: 4,
};

test("the hand-off sends the session's streams at the position", () => {
  expect(resolveCastHandOff(session, 61.5)).toEqual({
    item,
    positionTicks: 615_000_000,
    mediaSourceId: "source-1",
    audioIndex: 2,
    subtitleIndex: 4,
  });
});

// Subtitles turned off stay off on the receiver.
test("subtitles turned off stay off", () => {
  expect(
    resolveCastHandOff({ ...session, currentSubtitleIndex: -1 }, 0)
      .subtitleIndex,
  ).toBe(-1);
});

// A subtitle file on this device is not the server's: the receiver plays without subtitles.
test("a subtitle on this device gives none on the receiver", () => {
  expect(
    resolveCastHandOff(
      { ...session, currentSubtitleIndex: localSubtitleIndex(0) },
      0,
    ).subtitleIndex,
  ).toBe(-1);
});

test("a loaded hand-off closes the player", () => {
  expect(nextStepAfterSend({ status: "loaded" })).toEqual({ kind: "dismiss" });
});

// The receiver refused the item: the player stays, says why and plays on.
test("a refused hand-off keeps the player and says why", () => {
  expect(
    nextStepAfterSend({ status: "notStarted", message: "It did not start" }),
  ).toEqual({ kind: "notice", message: "It did not start" });
  expect(
    nextStepAfterSend({ status: "failed", message: "The connection failed" }),
  ).toEqual({ kind: "notice", message: "The connection failed" });
});

// Another send replaced this one: nothing to say, the player plays on.
test("a superseded hand-off only resumes", () => {
  expect(nextStepAfterSend({ status: "superseded" })).toEqual({
    kind: "resume",
  });
});

// A newer hand-off started while this one waited: the player is the newer one's to close or to resume.
test("a hand-off a newer one replaced leaves the player alone", () => {
  for (const result of [
    { status: "superseded" },
    { status: "loaded" },
    { status: "failed", message: "The connection failed" },
  ] as const) {
    expect(nextStepAfterSend(result, { latest: false })).toEqual({
      kind: "none",
    });
  }
});

// A group joined while the receiver loaded owns the player now: it neither closes nor plays on its own.
test("a hand-off a SyncPlay join overtook leaves the player to the group", () => {
  for (const result of [
    { status: "loaded" },
    { status: "superseded" },
    { status: "notStarted", message: "It did not start" },
  ] as const) {
    expect(nextStepAfterSend(result, { inSyncPlay: true })).toEqual({
      kind: "none",
    });
  }
});

const request = {
  itemId: "item-1",
  session,
  inSyncPlay: false,
  receiverConnected: true,
};

test("a connected receiver takes the item the player plays", () => {
  expect(mayHandOff(request)).toBe(true);
});

// A group joined while the sheet was open: the player plays for the group, here.
test("a group member's player keeps playing here", () => {
  expect(mayHandOff({ ...request, inSyncPlay: true })).toBe(false);
});

// An in-place swap holds the next item already while the player still shows the one it hands off.
test("a hand-off for another item than the session's goes nowhere", () => {
  expect(mayHandOff({ ...request, itemId: "item-2" })).toBe(false);
});

test("nothing goes without a connected receiver or a session", () => {
  expect(mayHandOff({ ...request, receiverConnected: false })).toBe(false);
  expect(mayHandOff({ ...request, session: null })).toBe(false);
});

// The player paused for the hand-off: refused, it plays on.
test("a refused hand-off plays on", () => {
  expect(stepAfterRefusal({ ...request, receiverConnected: false })).toEqual({
    kind: "resume",
  });
});

// A group member plays on the group's command only, so its player stays paused until the group's next one.
test("a hand-off refused in a SyncPlay group leaves the player to the group", () => {
  expect(stepAfterRefusal({ ...request, inSyncPlay: true })).toEqual({
    kind: "none",
  });
});
