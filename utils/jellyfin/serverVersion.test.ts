import {
  supportsOriginalAudioLanguage,
  supportsPerVersionUserData,
} from "./serverVersion";

test("requires Jellyfin 12 or newer for original audio", () => {
  expect(supportsOriginalAudioLanguage("10.11.11")).toBe(false);
  expect(supportsOriginalAudioLanguage("11.0.0")).toBe(false);
  expect(supportsOriginalAudioLanguage("12.0.0-rc5")).toBe(true);
  expect(supportsOriginalAudioLanguage("12.0.0")).toBe(true);
  expect(supportsOriginalAudioLanguage("13.0.0")).toBe(true);
});

test("treats an unknown version as unsupported", () => {
  expect(supportsOriginalAudioLanguage()).toBe(false);
  expect(supportsOriginalAudioLanguage(null)).toBe(false);
  expect(supportsOriginalAudioLanguage("")).toBe(false);
  expect(supportsOriginalAudioLanguage("12invalid")).toBe(false);
});

test("per-version UserData follows the Jellyfin 12 cut", () => {
  expect(supportsPerVersionUserData("10.11.11")).toBe(false);
  expect(supportsPerVersionUserData("12.0.0")).toBe(true);
  expect(supportsPerVersionUserData(undefined)).toBe(false);
});
