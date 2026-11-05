import { localSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import { nextStepAfterSend, resolveCastHandOff } from "./resolveCastHandOff";

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
