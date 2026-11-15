import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REMOTE_PLAYER_ACCENT,
  REMOTE_TINT_FADE_MS,
  REMOTE_TINT_NEUTRAL,
} from "./RemotePlayer";

const ANDROID =
  "modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/nativeplayer/PlayerConstants.kt";
const IOS = "modules/mpv-player/ios/NativePlayer/PlayerConstants.swift";

const read = (path: string) =>
  readFileSync(join(__dirname, "..", path), "utf8");

/** What a native declaration holds, matched by its first group. */
const declared = (path: string, pattern: RegExp): string => {
  const match = read(path).match(pattern);
  if (!match) throw new Error(`${pattern} not found in ${path}`);
  return match[1];
};

/** `#RRGGBB` as the six digits a native color constant spells, alpha left out. */
const digits = (hex: string) => hex.slice(1).toUpperCase();

// The native screens draw what JS sends, and fall back to these before a tint
// arrives or when one does not parse. Nothing but this test keeps them in step.
describe("native mirrors of constants/RemotePlayer.ts", () => {
  test("both screens fall back to REMOTE_PLAYER_ACCENT", () => {
    expect(declared(ANDROID, /REMOTE_ACTIVE_COLOR = 0xFF([0-9A-F]{6})/)).toBe(
      digits(REMOTE_PLAYER_ACCENT),
    );
    expect(declared(IOS, /remoteActiveColor: UInt32 = 0x([0-9A-F]{6})/)).toBe(
      digits(REMOTE_PLAYER_ACCENT),
    );
  });

  test("both screens fall back to REMOTE_TINT_NEUTRAL", () => {
    expect(
      declared(ANDROID, /REMOTE_TINT_NEUTRAL_TOP = 0xFF([0-9A-F]{6})/),
    ).toBe(digits(REMOTE_TINT_NEUTRAL.top));
    expect(
      declared(ANDROID, /REMOTE_TINT_NEUTRAL_BOTTOM = 0xFF([0-9A-F]{6})/),
    ).toBe(digits(REMOTE_TINT_NEUTRAL.bottom));
    expect(
      declared(IOS, /remoteTintNeutralTop: UInt32 = 0x([0-9A-F]{6})/),
    ).toBe(digits(REMOTE_TINT_NEUTRAL.top));
    expect(
      declared(IOS, /remoteTintNeutralBottom: UInt32 = 0x([0-9A-F]{6})/),
    ).toBe(digits(REMOTE_TINT_NEUTRAL.bottom));
  });

  test("both screens fade to a new tint in REMOTE_TINT_FADE_MS", () => {
    expect(Number(declared(ANDROID, /REMOTE_TINT_FADE_MS = (\d+)/))).toBe(
      REMOTE_TINT_FADE_MS,
    );
    expect(Number(declared(IOS, /remoteTintFadeMs: Double = (\d+)/))).toBe(
      REMOTE_TINT_FADE_MS,
    );
  });
});
