import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { renderHook } from "@testing-library/react-native";
import { clearMmkv } from "@/test-utils/mmkv";
import type { Settings } from "@/utils/atoms/settings";
import * as playSettings from "@/utils/jellyfin/getDefaultPlaySettings";
import { rememberTrackSelectionFromRow } from "@/utils/seriesTrackMemory";
import { buildAudioMenu } from "@/utils/subtitles/trackMenu";
import useDefaultPlaySettings from "./useDefaultPlaySettings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
jest.mock("./useTrackSelectionMemory", () => ({
  useTrackSelectionMemory: () => ({ memoryScope: mockMemoryScope }),
}));

let mockMemoryScope = "server-1:user-1";
const settings = {
  rememberAudioSelections: true,
  rememberSubtitleSelections: true,
} as Settings;
const source: MediaSourceInfo = {
  Id: "source-1",
  MediaStreams: [
    { Index: 1, Type: "Audio", Language: "eng", Title: "Commentary" },
    { Index: 4, Type: "Audio", Language: "eng", Title: "Main" },
    { Index: 2, Type: "Subtitle", Language: "eng" },
  ],
};
const item: BaseItemDto = {
  Id: "movie-1",
  Type: "Movie",
  MediaSources: [source],
};
const downloaded = {
  audioStreamIndex: 1,
  subtitleStreamIndex: 2,
  isTranscoded: false,
};

beforeEach(() => {
  clearMmkv();
  mockMemoryScope = "server-1:user-1";
});
afterEach(() => jest.restoreAllMocks());

test("a new options wrapper does not reread track memory when its fields are unchanged", async () => {
  const resolve = jest.spyOn(playSettings, "getDefaultPlaySettings");
  const { result, rerender } = await renderHook(
    (_: number) =>
      useDefaultPlaySettings(item, settings, {
        offline: true,
        downloaded,
        downloadedMediaSource: source,
      }),
    { initialProps: 0 },
  );
  const original = result.current;
  const initialCalls = resolve.mock.calls.length;
  await rerender(1);
  expect(result.current).toBe(original);
  expect(resolve).toHaveBeenCalledTimes(initialCalls);
});

test("changed download fields still recompute the default indexes", async () => {
  const { result, rerender } = await renderHook(
    (audioIndex: number) =>
      useDefaultPlaySettings(item, settings, {
        offline: true,
        downloaded: { ...downloaded, audioStreamIndex: audioIndex },
        downloadedMediaSource: source,
      }),
    { initialProps: 1 },
  );
  expect(result.current.defaultAudioIndex).toBe(1);
  await rerender(4);
  expect(result.current.defaultAudioIndex).toBe(4);
});

test("switching account scope discards the previous account's cached track choice", async () => {
  rememberTrackSelectionFromRow({
    item,
    kind: "audio",
    row: buildAudioMenu(source.MediaStreams, { isTranscoding: false })[1],
    settings,
    memoryScope: mockMemoryScope,
  });
  const { result, rerender } = await renderHook(
    (_: number) =>
      useDefaultPlaySettings(item, settings, {
        offline: true,
        downloaded,
        downloadedMediaSource: source,
      }),
    { initialProps: 0 },
  );
  expect(result.current.defaultAudioIndex).toBe(4);
  mockMemoryScope = "server-1:user-2";
  await rerender(1);
  expect(result.current.defaultAudioIndex).toBe(1);
});
