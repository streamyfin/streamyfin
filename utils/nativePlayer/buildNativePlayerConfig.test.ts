import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import type { NativePlayerStrings } from "@/modules/mpv-player";
import { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import type { Settings } from "@/utils/atoms/settings";
import { buildNativePlayerConfig } from "./buildNativePlayerConfig";

stubReactNative();
jest.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/log", () => ({
  writeErrorLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeDebugLog: jest.fn(),
  writeToLog: jest.fn(),
  logAndCaptureError: jest.fn(),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});

test("native player initialization and report seed use fresh negotiated tracks, not cached menu defaults", async () => {
  const api = makeApi();
  const mediaSource: MediaSourceInfo = {
    Id: "source-1",
    MediaStreams: [
      { Type: "Audio", Index: 4, Language: "eng" },
      { Type: "Audio", Index: 8, Language: "eng", Title: "Main" },
      { Type: "Subtitle", Index: 11, Language: "eng", Title: "Full" },
    ],
    DefaultAudioStreamIndex: 8,
    DefaultSubtitleStreamIndex: 11,
  };
  api.mock
    .onPost("https://jellyfin.example.com/Items/item-1/PlaybackInfo")
    .reply(200, { PlaySessionId: "session-1", MediaSources: [mediaSource] });
  const item: BaseItemDto = {
    Id: "item-1",
    Type: "Movie",
    UserData: { PlayCount: 1 },
    MediaSources: [
      {
        ...mediaSource,
        DefaultAudioStreamIndex: 4,
        DefaultSubtitleStreamIndex: -1,
      },
    ],
  };
  const built = await buildNativePlayerConfig({
    api,
    userId: "user-1",
    item,
    req: { itemId: "item-1", offline: false },
    settings: {
      playbackSpeedPerShow: {},
      playbackSpeedPerMedia: {},
    } as Settings,
    strings: {} as NativePlayerStrings,
    getDownloadedItemById: () => undefined,
  });
  expect(built?.seed).toMatchObject({ audioIndex: 8, subtitleIndex: 11 });
  expect(built?.config.stream.initialAudioMpvId).toBe(2);
  const request = JSON.parse(api.mock.history.post[0].data);
  expect(request).not.toHaveProperty("audioStreamIndex");
  expect(request).not.toHaveProperty("subtitleStreamIndex");
});
