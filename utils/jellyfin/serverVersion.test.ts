import { expect, test } from "bun:test";
import { supportsOriginalAudioLanguage } from "./serverVersion";

test("requires Jellyfin 12 or newer for original audio", () => {
  expect(supportsOriginalAudioLanguage("10.11.11")).toBe(false);
  expect(supportsOriginalAudioLanguage("11.0.0")).toBe(false);
  expect(supportsOriginalAudioLanguage("12.0.0-rc5")).toBe(true);
  expect(supportsOriginalAudioLanguage("12.0.0")).toBe(true);
  expect(supportsOriginalAudioLanguage("12.1.0")).toBe(true);
  expect(supportsOriginalAudioLanguage("13.0.0")).toBe(true);
});

test("treats an unknown version as unsupported", () => {
  expect(supportsOriginalAudioLanguage()).toBe(false);
  expect(supportsOriginalAudioLanguage("")).toBe(false);
  expect(supportsOriginalAudioLanguage(null)).toBe(false);
  expect(supportsOriginalAudioLanguage("unknown")).toBe(false);
});

test("rejects a malformed version instead of truncating it", () => {
  expect(supportsOriginalAudioLanguage("12invalid")).toBe(false);
  expect(supportsOriginalAudioLanguage("v12.0.0")).toBe(false);
  expect(supportsOriginalAudioLanguage(" 12.0.0")).toBe(false);
  expect(supportsOriginalAudioLanguage("12")).toBe(true);
});
