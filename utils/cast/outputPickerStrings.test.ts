import { readFileSync } from "node:fs";
import path from "node:path";
import type { TFunction } from "i18next";
import { Platform } from "react-native";
import en from "@/translations/en.json";
import { buildOutputPickerStrings } from "./outputPickerStrings";

const root = path.resolve(__dirname, "../..");

// The native sheets fall back on their own English texts by key: the keys JS sends have to be theirs.
const nativeKeys = (file: string, pattern: RegExp): string[] =>
  [...readFileSync(path.join(root, file), "utf8").matchAll(pattern)]
    .map((match) => match[1])
    .sort();

// The English text of a key, undefined when en.json has none.
const english = ((key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      en,
    )) as unknown as TFunction;

test("every output picker string has a key", () => {
  const strings = buildOutputPickerStrings(english);
  const keys = Object.keys(strings).sort();

  expect(keys).toEqual(
    nativeKeys(
      "modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/output/OutputPickerStrings.kt",
      /^\s+"(\w+)" to "/gm,
    ),
  );
  expect(keys).toEqual(
    nativeKeys(
      "modules/mpv-player/ios/Cast/OutputPickerStrings.swift",
      /^\s+"(\w+)": "/gm,
    ),
  );
  for (const [key, text] of Object.entries(strings)) {
    expect([key, typeof text]).toEqual([key, "string"]);
  }
});

test("the device rows name an iPhone and an iPad on iOS", () => {
  jest.replaceProperty(Platform, "OS", "ios");

  const strings = buildOutputPickerStrings(english);

  expect([strings.thisPhone, strings.thisTablet]).toEqual([
    "This iPhone",
    "This iPad",
  ]);
});

test("the device rows name a phone and a tablet on Android", () => {
  jest.replaceProperty(Platform, "OS", "android");

  const strings = buildOutputPickerStrings(english);

  expect([strings.thisPhone, strings.thisTablet]).toEqual([
    "This phone",
    "This tablet",
  ]);
});
