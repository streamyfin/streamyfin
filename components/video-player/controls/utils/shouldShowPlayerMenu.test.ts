import { describe, expect, test } from "bun:test";
import { shouldShowPlayerMenu } from "./shouldShowPlayerMenu";

describe("shouldShowPlayerMenu", () => {
  test("hidden on TV (TV uses its own navigation-based selectors)", () => {
    expect(shouldShowPlayerMenu({ isTV: true, offline: false })).toBe(false);
  });

  test("shown for online playback", () => {
    expect(shouldShowPlayerMenu({ isTV: false, offline: false })).toBe(true);
  });

  test("shown for offline direct downloads", () => {
    expect(
      shouldShowPlayerMenu({ isTV: false, offline: true, isTranscoded: false }),
    ).toBe(true);
  });

  test("shown for offline transcoded downloads (external subtitles are downloadable)", () => {
    expect(
      shouldShowPlayerMenu({ isTV: false, offline: true, isTranscoded: true }),
    ).toBe(true);
  });
});
