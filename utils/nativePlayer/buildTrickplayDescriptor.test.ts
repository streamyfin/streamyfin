import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The settings atoms reach the provider, which pulls in expo-router.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  logAndCaptureError: () => undefined,
  readFromLog: () => [],
}));

import { buildTrickplayDescriptor } from "./buildNativePlayerConfig";

const sheet = { Interval: 10_000, TileWidth: 10, TileHeight: 10, Height: 180 };
const item: BaseItemDto = {
  Id: "item-1",
  RunTimeTicks: 36_000_000_000, // 1 hour → 4 sheets
  Trickplay: {
    "item-1": { "320": { ...sheet, Width: 320 } },
    alt: { "480": { ...sheet, Width: 480 } },
  },
};

test("the native player gets the playing version's trickplay sheets", () => {
  // Trickplay is keyed by media source ID; an alternate version showed the
  // primary's thumbnails before the playing source was passed through.
  const descriptor = buildTrickplayDescriptor(item, {
    api: makeApi(),
    offline: false,
    downloadedItem: null,
    mediaSourceId: "alt",
  });

  expect(descriptor?.thumbWidth).toBe(480);
  expect(descriptor?.sheetUrls[0]).toBe(
    "https://jellyfin.example.com/Videos/item-1/Trickplay/480/0.jpg?ApiKey=SECRET_TOKEN&MediaSourceId=alt",
  );
});
