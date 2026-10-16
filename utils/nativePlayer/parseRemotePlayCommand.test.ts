import { parseRemotePlayCommand } from "./parseRemotePlayCommand";

describe("parseRemotePlayCommand", () => {
  test("plays a single item exactly as the sender described it", () => {
    expect(
      parseRemotePlayCommand({
        ItemIds: ["movie-1"],
        PlayCommand: "PlayNow",
        StartPositionTicks: 600_000_000,
        AudioStreamIndex: 2,
        SubtitleStreamIndex: 4,
        MediaSourceId: "source-1",
      }),
    ).toEqual({
      itemId: "movie-1",
      audioIndex: 2,
      subtitleIndex: 4,
      mediaSourceId: "source-1",
      offline: false,
      playbackPositionTicks: 600_000_000,
    });
  });

  // "Play from here" on a list sends the whole list plus the row that was
  // pressed. Taking ItemIds[0] started the top of the list instead.
  test("starts at the item StartIndex points to when several were sent", () => {
    expect(
      parseRemotePlayCommand({ ItemIds: ["e1", "e2", "e3"], StartIndex: 2 })
        ?.itemId,
    ).toBe("e3");
  });

  test("starts at the first item when no StartIndex was sent", () => {
    expect(
      parseRemotePlayCommand({ ItemIds: ["e1", "e2", "e3"] })?.itemId,
    ).toBe("e1");
  });

  test.each([7, -1, 1.5, "nope", null])(
    "falls back to the first item for the unusable StartIndex %p",
    (startIndex) => {
      expect(
        parseRemotePlayCommand({
          ItemIds: ["e1", "e2"],
          StartIndex: startIndex,
        })?.itemId,
      ).toBe("e1");
    },
  );

  // The server replaces a series, a season, a collection or a playlist with
  // the items inside it before the command is sent, so a container never
  // arrives here: Play on a show is a list of its episodes.
  test("starts a series with the first episode the server listed", () => {
    expect(
      parseRemotePlayCommand({ ItemIds: ["s1e1", "s1e2", "s2e1"] }),
    ).toEqual({ itemId: "s1e1", offline: false });
  });

  test.each([
    undefined,
    null,
    {},
    { ItemIds: [] },
    { ItemIds: "movie-1" },
    { ItemIds: [""] },
    { ItemIds: [42] },
  ])("ignores the command %p, which names nothing to play", (command) => {
    expect(parseRemotePlayCommand(command)).toBeNull();
  });

  // Number(null) is 0: a null track index must not select the first track,
  // and a null position must not restart an item that has a resume point.
  test.each([null, "nope"])(
    "treats the stream choice %p as not sent",
    (value) => {
      expect(
        parseRemotePlayCommand({
          ItemIds: ["movie-1"],
          AudioStreamIndex: value,
          SubtitleStreamIndex: value,
          StartPositionTicks: value,
          MediaSourceId: null,
        }),
      ).toEqual({ itemId: "movie-1", offline: false });
    },
  );

  test("keeps a subtitle index of -1, which turns subtitles off", () => {
    expect(
      parseRemotePlayCommand({ ItemIds: ["movie-1"], SubtitleStreamIndex: -1 })
        ?.subtitleIndex,
    ).toBe(-1);
  });
});
