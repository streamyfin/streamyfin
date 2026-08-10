import { expect, test } from "bun:test";
import { supportsOriginalAudioLanguage } from "./serverVersion";

test("requires Jellyfin 12 or newer for original audio", () => {
  expect(supportsOriginalAudioLanguage("11.0.0")).toBe(false);
  expect(supportsOriginalAudioLanguage("12.0.0-beta.1")).toBe(true);
  expect(supportsOriginalAudioLanguage("12.0.0")).toBe(true);
  expect(supportsOriginalAudioLanguage("12.1.0")).toBe(true);
  expect(supportsOriginalAudioLanguage("13.0.0")).toBe(true);
  expect(supportsOriginalAudioLanguage()).toBe(true);
});
