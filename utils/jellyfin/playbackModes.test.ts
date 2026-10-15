import {
  nextRepeatMode,
  parsePlaybackModeCommand,
  sessionSupportsCommand,
  supportedCommands,
  toJellyfinRepeatMode,
  toPlaybackOrder,
} from "./playbackModes";

describe("what the music player reports", () => {
  test.each([
    ["off", "RepeatNone"],
    ["all", "RepeatAll"],
    ["one", "RepeatOne"],
  ] as const)("repeat %s is reported as %s", (mode, reported) => {
    expect(toJellyfinRepeatMode(mode)).toBe(reported);
  });

  test("shuffle is reported as a playback order", () => {
    expect(toPlaybackOrder(true)).toBe("Shuffle");
    expect(toPlaybackOrder(false)).toBe("Default");
  });
});

describe("parsePlaybackModeCommand", () => {
  // The argument names and values are the ones jellyfin-web sends from its
  // remote control (sessionPlayer: setRepeatMode, setQueueShuffleMode).
  test.each([
    ["RepeatNone", "off"],
    ["RepeatAll", "all"],
    ["RepeatOne", "one"],
  ] as const)("SetRepeatMode %s sets repeat %s", (RepeatMode, repeatMode) => {
    expect(
      parsePlaybackModeCommand({
        Name: "SetRepeatMode",
        Arguments: { RepeatMode },
      }),
    ).toEqual({ repeatMode });
  });

  test.each([
    ["Shuffle", true],
    ["Sorted", false],
  ] as const)("SetShuffleQueue %s sets shuffle to %p", (ShuffleMode, on) => {
    expect(
      parsePlaybackModeCommand({
        Name: "SetShuffleQueue",
        Arguments: { ShuffleMode },
      }),
    ).toEqual({ shuffleEnabled: on });
  });

  test.each([
    ["an unknown repeat mode", "SetRepeatMode", { RepeatMode: "Forever" }],
    ["a repeat command without arguments", "SetRepeatMode", undefined],
    ["null arguments", "SetShuffleQueue", null],
    // What a session reports, not what the command carries.
    ["a playback order", "SetShuffleQueue", { ShuffleMode: "Default" }],
    ["another command", "ToggleMute", { RepeatMode: "RepeatAll" }],
  ])("ignores %s", (_case, Name, Arguments) => {
    expect(parsePlaybackModeCommand({ Name, Arguments })).toBeNull();
  });

  test("ignores a message without data", () => {
    expect(parsePlaybackModeCommand(undefined)).toBeNull();
    expect(parsePlaybackModeCommand(null)).toBeNull();
  });
});

describe("the sessions page", () => {
  test("the repeat button goes off, all, one and back to off", () => {
    expect(nextRepeatMode("RepeatNone")).toBe("RepeatAll");
    expect(nextRepeatMode("RepeatAll")).toBe("RepeatOne");
    expect(nextRepeatMode("RepeatOne")).toBe("RepeatNone");
  });

  test("a session that reports no repeat mode counts as not repeating", () => {
    expect(nextRepeatMode(undefined)).toBe("RepeatAll");
    expect(nextRepeatMode(null)).toBe("RepeatAll");
  });

  test("a command is supported only when the session lists it", () => {
    const session = { SupportedCommands: ["SetRepeatMode" as const] };
    expect(sessionSupportsCommand(session, "SetRepeatMode")).toBe(true);
    expect(sessionSupportsCommand(session, "SetShuffleQueue")).toBe(false);
    expect(sessionSupportsCommand({}, "SetRepeatMode")).toBe(false);
  });
});

describe("supportedCommands", () => {
  test("a phone or tablet takes repeat and shuffle commands", () => {
    expect(supportedCommands(false)).toEqual([
      "Play",
      "SetRepeatMode",
      "SetShuffleQueue",
    ]);
  });

  // The music player is a stub on TV: a button there would do nothing.
  test("a TV only takes Play", () => {
    expect(supportedCommands(true)).toEqual(["Play"]);
  });
});
