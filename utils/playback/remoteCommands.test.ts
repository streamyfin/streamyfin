import { describe, expect, test } from "bun:test";
import { mapRemoteCommand } from "./remoteCommands";

describe("mapRemoteCommand — Playstate", () => {
  test("maps Pause", () => {
    expect(
      mapRemoteCommand({
        MessageType: "Playstate",
        Data: { Command: "Pause" },
      }),
    ).toEqual({ kind: "pause" });
  });

  test("maps Stop, PlayPause, Unpause, NextTrack, PreviousTrack", () => {
    const m = (c: string) =>
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: c } });
    expect(m("Stop")).toEqual({ kind: "stop" });
    expect(m("PlayPause")).toEqual({ kind: "playPause" });
    expect(m("Unpause")).toEqual({ kind: "unpause" });
    expect(m("NextTrack")).toEqual({ kind: "next" });
    expect(m("PreviousTrack")).toEqual({ kind: "previous" });
  });

  test("maps Seek, converting ticks to milliseconds", () => {
    expect(
      mapRemoteCommand({
        MessageType: "Playstate",
        Data: { Command: "Seek", SeekPositionTicks: 600_000_000 },
      }),
    ).toEqual({ kind: "seek", positionMs: 60_000 });
  });

  test("returns null for Seek with no position", () => {
    expect(
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: "Seek" } }),
    ).toBeNull();
  });

  test("returns null for an unknown command", () => {
    expect(
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: "Wat" } }),
    ).toBeNull();
  });
});

describe("mapRemoteCommand — GeneralCommand", () => {
  test("maps SetVolume, converting 0-100 to 0-1", () => {
    expect(
      mapRemoteCommand({
        MessageType: "GeneralCommand",
        Data: { Name: "SetVolume", Arguments: { Volume: "40" } },
      }),
    ).toEqual({ kind: "setVolume", level: 0.4 });
  });

  test("clamps SetVolume to 0-1", () => {
    const r = mapRemoteCommand({
      MessageType: "GeneralCommand",
      Data: { Name: "SetVolume", Arguments: { Volume: "250" } },
    });
    expect(r).toEqual({ kind: "setVolume", level: 1 });
  });

  test("maps ToggleMute / Mute / Unmute to toggleMute", () => {
    const m = (n: string) =>
      mapRemoteCommand({ MessageType: "GeneralCommand", Data: { Name: n } });
    expect(m("ToggleMute")).toEqual({ kind: "toggleMute" });
    expect(m("Mute")).toEqual({ kind: "toggleMute" });
    expect(m("Unmute")).toEqual({ kind: "toggleMute" });
  });

  test("maps DisplayMessage from Arguments.Text", () => {
    expect(
      mapRemoteCommand({
        MessageType: "GeneralCommand",
        Data: { Name: "DisplayMessage", Arguments: { Text: "Hello" } },
      }),
    ).toEqual({ kind: "displayMessage", text: "Hello" });
  });
});

describe("mapRemoteCommand — other", () => {
  test("returns null for unrelated message types", () => {
    expect(mapRemoteCommand({ MessageType: "KeepAlive", Data: {} })).toBeNull();
  });
});
