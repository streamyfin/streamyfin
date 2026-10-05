import {
  supportsItemCollections,
  supportsOriginalAudioLanguage,
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

test("requires Jellyfin 12 or newer for an item's collections", () => {
  expect(supportsItemCollections("10.11.11")).toBe(false);
  expect(supportsItemCollections("11.0.0")).toBe(false);
  expect(supportsItemCollections("12.0.0-rc5")).toBe(true);
  expect(supportsItemCollections("12.0.0")).toBe(true);
  expect(supportsItemCollections("13.0.0")).toBe(true);
});

test("does not ask a server of unknown version for an item's collections", () => {
  expect(supportsItemCollections()).toBe(false);
  expect(supportsItemCollections(null)).toBe(false);
  expect(supportsItemCollections("")).toBe(false);
  expect(supportsItemCollections("12invalid")).toBe(false);
});
