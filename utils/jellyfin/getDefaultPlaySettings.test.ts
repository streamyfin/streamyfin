import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";
import { clearMmkv } from "@/test-utils/mmkv";
import type { Settings } from "@/utils/atoms/settings";
import { rememberTrackSelectionFromRow } from "@/utils/seriesTrackMemory";
import { buildAudioMenu, buildSubtitleMenu } from "@/utils/subtitles/trackMenu";
import {
  getDefaultPlaySettings,
  type PlaySettingsOptions,
} from "./getDefaultPlaySettings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));

const scope = "server-1:user-1";
const settingsWith = (patch: Partial<Settings> = {}): Settings =>
  ({
    rememberAudioSelections: true,
    rememberSubtitleSelections: true,
    ...patch,
  }) as Settings;
const language = (code: string) => ({ ThreeLetterISOLanguageName: code });
const audio = (
  index: number,
  extra: Partial<MediaStream> = {},
): MediaStream => ({
  Index: index,
  Type: "Audio",
  Language: "eng",
  ...extra,
});
const sub = (index: number, extra: Partial<MediaStream> = {}): MediaStream => ({
  Index: index,
  Type: "Subtitle",
  Language: "eng",
  ...extra,
});
const source = (
  streams: MediaStream[],
  extra: Partial<MediaSourceInfo> = {},
): MediaSourceInfo => ({
  Id: "source-1",
  MediaStreams: streams,
  ...extra,
});
const episode = (mediaSource: MediaSourceInfo, id = "ep-1"): BaseItemDto => ({
  Id: id,
  Type: "Episode",
  SeriesId: "series-1",
  MediaSources: [mediaSource],
});

/** Resolve within one authenticated test account unless a test switches it. */
function resolve(
  item: BaseItemDto,
  settings = settingsWith({}),
  options: PlaySettingsOptions = {},
) {
  return getDefaultPlaySettings(item, settings, {
    memoryScope: scope,
    ...options,
  });
}

/** Capture a specific menu row rather than an artificial language preference. */
function remember(
  item: BaseItemDto,
  kind: "audio" | "subtitle",
  index: number,
) {
  const streams = item.MediaSources?.[0]?.MediaStreams;
  const rows =
    kind === "audio"
      ? buildAudioMenu(streams, { isTranscoding: false })
      : buildSubtitleMenu(streams, {
          selectedIndex: -1,
          offLabel: "Off",
          isTranscoding: false,
        });
  const row = rows.find((candidate) => candidate.index === index);
  if (!row) throw new Error(`Missing ${kind} row ${index}`);
  rememberTrackSelectionFromRow({
    item,
    kind,
    row,
    settings: settingsWith({}),
    memoryScope: scope,
  });
}

beforeEach(clearMmkv);

describe("server-owned online defaults", () => {
  test("does not replace exact saved choices with language-based picks", () => {
    const item = episode(
      source(
        [
          audio(0, { Language: "jpn", IsDefault: true }),
          audio(1),
          sub(2, { IsDefault: true, IsHearingImpaired: true }),
          sub(3, { Title: "Full" }),
        ],
        { DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: 3 },
      ),
    );
    item.UserData = { PlayCount: 1 };
    expect(
      resolve(
        item,
        settingsWith({
          defaultAudioLanguage: language("jpn"),
          defaultSubtitleLanguage: language("eng"),
        }),
      ),
    ).toMatchObject({ audioIndex: 1, subtitleIndex: 3 });
  });

  test("a replayed episode keeps the server choice instead of the latest series pick", () => {
    const first = episode(source([audio(0, { Language: "jpn" }), audio(1)]));
    remember(first, "audio", 0);
    const replay = episode(
      source([audio(3, { Language: "jpn" }), audio(7)], {
        DefaultAudioStreamIndex: 7,
      }),
      "ep-2",
    );
    replay.UserData = { PlayCount: 1 };
    expect(resolve(replay).audioIndex).toBe(7);
  });

  test("does not use an offline cache to override a newer server subtitle selection", () => {
    const item: BaseItemDto = {
      ...episode(source([sub(0), sub(1)])),
      Type: "Movie",
    };
    remember(item, "subtitle", 1);
    const fresh = {
      ...item,
      MediaSources: [
        source([sub(0), sub(1)], {
          DefaultSubtitleStreamIndex: 0,
        }),
      ],
    };
    expect(resolve(fresh).subtitleIndex).toBe(0);
  });

  test("retains the server's explicit off even when cached preferences would enable subtitles", () => {
    const item = episode(source([sub(0)], { DefaultSubtitleStreamIndex: -1 }));
    expect(
      resolve(item, settingsWith({ defaultSubtitleLanguage: language("eng") }))
        .subtitleIndex,
    ).toBe(-1);
  });
});

describe("equivalent tracks in new episodes", () => {
  test("retains the main soundtrack instead of same-language commentary", () => {
    const first = episode(
      source([
        audio(0, { Title: "Commentary", IsDefault: true }),
        audio(1, { Title: "Main", Codec: "dts" }),
      ]),
    );
    remember(first, "audio", 1);
    const next = episode(
      source([
        audio(3, { Title: "Commentary", Codec: "dts", IsDefault: true }),
        audio(7, { Title: "Main", Codec: "aac" }),
      ]),
      "ep-2",
    );
    expect(resolve(next).audioIndex).toBe(7);
  });

  test("retains surround instead of same-language stereo", () => {
    const first = episode(
      source([
        audio(0, { Channels: 2 }),
        audio(1, { Channels: 6, ChannelLayout: "5.1" }),
      ]),
    );
    remember(first, "audio", 1);
    const next = episode(
      source([
        audio(3, { Channels: 2, IsDefault: true }),
        audio(7, { Channels: 6, ChannelLayout: "5.1" }),
      ]),
      "ep-2",
    );
    expect(resolve(next).audioIndex).toBe(7);
  });

  test.each([
    ["forced", { IsForced: true }],
    ["SDH", { IsHearingImpaired: true }],
    ["full title", { Title: "Full dialogue" }],
  ])("matches the specific %s subtitle after indexes change", (_, identity) => {
    const first = episode(source([sub(0), sub(8, identity)]));
    remember(first, "subtitle", 8);
    const next = episode(
      source([sub(2, { IsDefault: true }), sub(7, identity)]),
      "ep-2",
    );
    expect(resolve(next).subtitleIndex).toBe(7);
  });

  test.each(["audio", "subtitle"] as const)(
    "matches %s identity without language tags",
    (kind) => {
      const make = kind === "audio" ? audio : sub;
      const first = episode(
        source([
          make(0, { Language: undefined }),
          make(1, { Language: undefined, Title: "Full" }),
        ]),
      );
      remember(first, kind, 1);
      const next = episode(
        source([
          make(4, { Language: undefined }),
          make(7, { Language: undefined, Title: "Full" }),
        ]),
        "ep-2",
      );
      const result = resolve(next);
      expect(kind === "audio" ? result.audioIndex : result.subtitleIndex).toBe(
        7,
      );
    },
  );

  test.each(["audio", "subtitle"] as const)(
    "normalizes ISO language variants for %s identity",
    (kind) => {
      const make = kind === "audio" ? audio : sub;
      const first = episode(
        source([make(0, { Language: "fre", Title: "Full" })]),
      );
      remember(first, kind, 0);
      const next = episode(
        source([make(4, { Language: "fra", Title: "Full" })]),
        "ep-2",
      );
      const result = resolve(next);
      expect(kind === "audio" ? result.audioIndex : result.subtitleIndex).toBe(
        4,
      );
    },
  );

  test("does not apply another account's series preference", () => {
    const first = episode(source([audio(0, { Language: "jpn" })]));
    remember(first, "audio", 0);
    const next = episode(
      source([audio(3, { Language: "jpn" }), audio(7)], {
        DefaultAudioStreamIndex: 7,
      }),
      "ep-2",
    );
    expect(
      resolve(next, settingsWith({}), { memoryScope: "server-1:user-2" })
        .audioIndex,
    ).toBe(7);
  });

  test("falls back to the same language when the exact soundtrack is absent", () => {
    const first = episode(source([audio(0, { Title: "Main", Channels: 6 })]));
    remember(first, "audio", 0);
    expect(
      resolve(episode(source([audio(7, { Channels: 2 })]), "ep-2")).audioIndex,
    ).toBe(7);
  });

  test("does not match a different language based on title alone", () => {
    const first = episode(source([audio(0, { Title: "Main" })]));
    remember(first, "audio", 0);
    const next = episode(
      source(
        [
          audio(3, { Title: "Main", Language: "jpn" }),
          audio(7, { Language: "swe" }),
        ],
        { DefaultAudioStreamIndex: 7 },
      ),
      "ep-2",
    );
    expect(resolve(next).audioIndex).toBe(7);
  });

  test("off carries to a new episode", () => {
    const first = episode(source([sub(0)]));
    remember(first, "subtitle", -1);
    expect(
      resolve(
        episode(source([sub(7)], { DefaultSubtitleStreamIndex: 7 }), "ep-2"),
      ).subtitleIndex,
    ).toBe(-1);
  });

  test("explicit sequential carry-over wins over the series cache", () => {
    const first = episode(source([audio(0, { Language: "jpn" }), audio(1)]));
    remember(first, "audio", 0);
    const next = episode(
      source([audio(3, { Language: "jpn" }), audio(7)]),
      "ep-2",
    );
    expect(
      resolve(next, settingsWith({}), {
        indexes: { audioIndex: 1 },
        source: first.MediaSources?.[0],
      }).audioIndex,
    ).toBe(7);
  });
});

describe("offline exact choices and file constraints", () => {
  const mediaSource = source([audio(0), audio(1), sub(2), sub(3)]);
  const item: BaseItemDto = { ...episode(mediaSource), Type: "Movie" };
  const local: PlaySettingsOptions = {
    offline: true,
    downloadedMediaSource: mediaSource,
    downloaded: {
      audioStreamIndex: 0,
      subtitleStreamIndex: 2,
      isTranscoded: false,
    },
  };

  test("restores both exact tracks in an original downloaded file", () => {
    remember(item, "audio", 1);
    remember(item, "subtitle", 3);
    expect(resolve(item, settingsWith({}), local)).toMatchObject({
      audioIndex: 1,
      subtitleIndex: 3,
    });
  });

  test("zero is a valid remembered index", () => {
    remember(item, "audio", 0);
    expect(
      resolve(item, settingsWith({}), {
        ...local,
        downloaded: { audioStreamIndex: 1 },
      }).audioIndex,
    ).toBe(0);
  });

  test("does not select an audio track absent from a transcoded download", () => {
    remember(item, "audio", 1);
    expect(
      resolve(item, settingsWith({}), {
        ...local,
        downloaded: { audioStreamIndex: 0, isTranscoded: true },
      }).audioIndex,
    ).toBe(0);
  });

  test("cannot disable a subtitle burned into the downloaded pixels", () => {
    const burned = source([sub(2, { IsTextSubtitleStream: false }), sub(3)]);
    remember(item, "subtitle", -1);
    expect(
      resolve(item, settingsWith({}), {
        ...local,
        downloadedMediaSource: burned,
        downloaded: { subtitleStreamIndex: 2, isTranscoded: true },
      }).subtitleIndex,
    ).toBe(2);
  });

  test("remember switches also gate offline restoration", () => {
    remember(item, "audio", 1);
    remember(item, "subtitle", 3);
    expect(
      resolve(
        item,
        settingsWith({
          rememberAudioSelections: false,
          rememberSubtitleSelections: false,
        }),
        local,
      ),
    ).toMatchObject({ audioIndex: 0, subtitleIndex: 2 });
  });
});

describe("preference fallback when server defaults are absent", () => {
  test.each([
    ["deu", "ger"],
    ["swe", "sv"],
    ["fra", "fre"],
  ])(
    "normalizes preferred %s against stream language %s",
    (preferred, actual) => {
      const item = episode(
        source([sub(0, { Language: "tur" }), sub(1, { Language: actual })]),
      );
      expect(
        resolve(
          item,
          settingsWith({ defaultSubtitleLanguage: language(preferred) }),
        ).subtitleIndex,
      ).toBe(1);
    },
  );

  test("does not confuse Swedish with Swahili", () => {
    expect(
      resolve(
        episode(source([sub(0, { Language: "swa" })])),
        settingsWith({
          defaultSubtitleLanguage: language("swe"),
        }),
      ).subtitleIndex,
    ).toBe(-1);
  });

  test.each([
    ["None", -1],
    ["OnlyForced", 1],
    ["Always", 0],
    ["Smart", -1],
  ])("keeps %s fallback behavior", (mode, expected) => {
    const item = episode(
      source([sub(0), sub(1, { IsForced: true }), audio(2)], {
        DefaultAudioStreamIndex: 2,
      }),
    );
    expect(
      resolve(
        item,
        settingsWith({
          subtitleMode: mode as SubtitlePlaybackMode,
          defaultSubtitleLanguage: language("eng"),
        }),
      ).subtitleIndex,
    ).toBe(expected);
  });
});
