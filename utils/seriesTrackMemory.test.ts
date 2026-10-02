import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { TRACK_MEMORY_MAX_ENTRIES } from "@/constants/Playback";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { buildAudioMenu, buildSubtitleMenu } from "@/utils/subtitles/trackMenu";
import {
  getItemTrackMemory,
  getSeriesTrackMemory,
  getTrackMemoryScope,
  rememberTrackSelectionFromRow,
} from "./seriesTrackMemory";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));

const scope = "server-1:user-1";
const on = { rememberAudioSelections: true, rememberSubtitleSelections: true };
const episode: BaseItemDto = {
  Id: "ep-1",
  Type: "Episode",
  SeriesId: "series-1",
};

/** Capture the real menu shape used by both mobile and native controls. */
function remember(
  kind: "audio" | "subtitle",
  stream: MediaStream,
  memoryScope = scope,
  item = episode,
) {
  const row =
    kind === "audio"
      ? buildAudioMenu([stream], { isTranscoding: false })[0]
      : buildSubtitleMenu([stream], {
          selectedIndex: -1,
          offLabel: "Off",
          isTranscoding: false,
        })[1];
  rememberTrackSelectionFromRow({
    item,
    kind,
    row,
    settings: on,
    memoryScope,
    mediaSourceId: "source-1",
  });
}

beforeEach(clearMmkv);

test("stores specific soundtrack identity for movies as well as episodes", () => {
  remember(
    "audio",
    {
      Type: "Audio",
      Index: 4,
      Language: "eng",
      Title: "Main",
      Channels: 6,
      ChannelLayout: "5.1",
      Codec: "dts",
      Path: "/private/server/movie.mkv",
    },
    scope,
    { Id: "movie-1", Type: "Movie" },
  );
  expect(getItemTrackMemory("movie-1", scope)?.audio).toMatchObject({
    mediaSourceId: "source-1",
    stream: { Index: 4, Title: "Main", Channels: 6, ChannelLayout: "5.1" },
  });
  expect(JSON.stringify(getItemTrackMemory("movie-1", scope))).not.toContain(
    "/private/",
  );
  expect(getSeriesTrackMemory("series-1", scope)).toBeUndefined();
});

test("keeps audio and subtitle identities independent", () => {
  remember("audio", {
    Type: "Audio",
    Index: 0,
    Title: "Main",
    Language: "jpn",
  });
  remember("subtitle", {
    Type: "Subtitle",
    Index: 3,
    Title: "Full",
    Language: "eng",
  });
  expect(getSeriesTrackMemory("series-1", scope)).toMatchObject({
    audio: { stream: { Index: 0, Title: "Main" } },
    subtitle: { stream: { Index: 3, Title: "Full" } },
  });
});

test("remembers metadata even when the language tag is missing", () => {
  remember("audio", {
    Type: "Audio",
    Index: 4,
    Title: "Commentary",
    Channels: 2,
  });
  expect(getSeriesTrackMemory("series-1", scope)?.audio?.stream.Title).toBe(
    "Commentary",
  );
});

test("off replaces the subtitle snapshot without clearing audio", () => {
  remember("audio", { Type: "Audio", Index: 0, Language: "eng" });
  remember("subtitle", { Type: "Subtitle", Index: 3, Language: "eng" });
  rememberTrackSelectionFromRow({
    item: episode,
    kind: "subtitle",
    row: { index: -1, kind: "off" },
    settings: on,
    memoryScope: scope,
  });
  expect(getSeriesTrackMemory("series-1", scope)?.subtitle).toBe("off");
  expect(getItemTrackMemory("ep-1", scope)?.audio?.stream.Index).toBe(0);
});

test.each(["server-1:user-2", "server-2:user-1"])(
  "does not leak a selection into account %s",
  (other) => {
    remember("audio", { Type: "Audio", Index: 0, Language: "jpn" });
    expect(getSeriesTrackMemory("series-1", other)).toBeUndefined();
    expect(getItemTrackMemory("ep-1", other)).toBeUndefined();
  },
);

test("the same item can have different preferences in different accounts", () => {
  remember("audio", { Type: "Audio", Index: 0, Language: "jpn" });
  remember(
    "audio",
    { Type: "Audio", Index: 1, Language: "eng" },
    "server-1:user-2",
  );
  expect(getItemTrackMemory("ep-1", scope)?.audio?.stream.Language).toBe("jpn");
  expect(
    getItemTrackMemory("ep-1", "server-1:user-2")?.audio?.stream.Language,
  ).toBe("eng");
});

test("scopes by stable server ID rather than server URL", () => {
  expect(getTrackMemoryScope({ ServerId: "s", Id: "u" })).toBe("s:u");
  expect(getTrackMemoryScope({ Id: "u" })).toBeUndefined();
  expect(getTrackMemoryScope(null)).toBeUndefined();
});

test("does not adopt unscoped legacy preferences into an arbitrary account", () => {
  storage.set(
    "seriesTrackMemory.v1",
    JSON.stringify({
      "series-1": { audioLang: "jpn", subtitleLang: "off", updatedAt: 1 },
    }),
  );
  expect(getSeriesTrackMemory("series-1", scope)).toBeUndefined();
});

test.each(["sidecar", "burnedIn"] as const)(
  "does not remember an inert %s row",
  (kind) => {
    rememberTrackSelectionFromRow({
      item: episode,
      kind: "subtitle",
      row: { kind, index: -100 },
      settings: on,
      memoryScope: scope,
    });
    expect(getItemTrackMemory("ep-1", scope)).toBeUndefined();
  },
);

test.each(["audio", "subtitle"] as const)(
  "respects the %s remember switch",
  (kind) => {
    rememberTrackSelectionFromRow({
      item: episode,
      kind,
      row: {
        index: 0,
        kind: "server",
        stream: { Index: 0, Type: kind === "audio" ? "Audio" : "Subtitle" },
      },
      settings: {
        rememberAudioSelections: false,
        rememberSubtitleSelections: false,
      },
      memoryScope: scope,
    });
    expect(getItemTrackMemory("ep-1", scope)).toBeUndefined();
  },
);

test("bounds per-video cache entries", () => {
  for (let index = 0; index <= TRACK_MEMORY_MAX_ENTRIES; index++) {
    remember("audio", { Type: "Audio", Index: 0, Title: "Main" }, scope, {
      Id: `movie-${index}`,
      Type: "Movie",
    });
  }
  expect(getItemTrackMemory("movie-0", scope)).toBeUndefined();
  expect(
    getItemTrackMemory(`movie-${TRACK_MEMORY_MAX_ENTRIES}`, scope)?.audio,
  ).toBeDefined();
});
