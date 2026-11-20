import type { BaseItemDto, UserDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { Dimensions, PixelRatio } from "react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { defaultValues } from "@/utils/atoms/settings";
import { buildMetadata } from "@/utils/nativePlayer/buildNativePlayerConfig";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";
import {
  buildReducedRemotePlayerConfig,
  buildRemotePlayerConfig,
} from "./buildRemotePlayerConfig";

const t = ((key: string) => key) as unknown as TFunction;

const episode: BaseItemDto = {
  Id: "episode-1",
  Name: "Pilot",
  Type: "Episode",
  SeriesName: "Bench Show",
  ParentIndexNumber: 1,
  IndexNumber: 1,
  Chapters: [{ Name: "Opening", StartPositionTicks: 600_000_000 }],
  MediaSources: [
    {
      Id: "source-1",
      MediaStreams: [
        { Type: "Audio", Index: 1, DisplayTitle: "English" },
        { Type: "Subtitle", Index: 2, DisplayTitle: "French" },
      ],
    },
  ],
};

const params = (
  overrides: Partial<Parameters<typeof buildRemotePlayerConfig>[0]> = {},
) => ({
  item: episode,
  mediaSource: episode.MediaSources![0],
  targetName: "Living Room TV",
  audioIndex: 1,
  subtitleIndex: 2,
  episodeList: [],
  nextEpisode: null,
  tint: null,
  imageHeaders: {},
  settings: defaultValues,
  api: makeApi(),
  user: {
    Id: "user-1",
    Policy: { IsAdministrator: false, EnableSubtitleManagement: false },
  } as UserDto,
  t,
  ...overrides,
});

// The TV plays the stream: the screen gets what it shows of it, and none of the phone's own player.
test("the config carries no stream and no picture in picture", () => {
  const config = buildRemotePlayerConfig(params());

  expect(config).not.toHaveProperty("stream");
  expect(config.ui.allowPip).toBe(false);
  expect(config.ui.orientationLock).toBe("none");
  expect(config.tint).toBeNull();
  expect(config.metadata).toMatchObject({
    itemId: "episode-1",
    title: "Pilot",
    isEpisode: true,
  });
  expect(config.chapters).toEqual([{ name: "Opening", startSec: 60 }]);
  expect(config.ui.strings?.playHere).toBe("player.play_here");
  // The TV's button opens the Cast sheet over the screen, in the app's language.
  expect(config.ui.outputPickerStrings?.title).toBe("cast.output.title");
});

// The phone has no player to add a file to here: only the server's own search, which its policy gates, is offered.
test("the search is offered only when the server can do it", () => {
  const user = (policy: {
    IsAdministrator?: boolean;
    EnableSubtitleManagement?: boolean;
  }) => ({ Id: "user-1", Policy: policy }) as UserDto;
  const offered = (u: UserDto) =>
    buildRemotePlayerConfig(params({ user: u })).ui.subtitleSearchEnabled;

  expect(
    offered(user({ IsAdministrator: false, EnableSubtitleManagement: false })),
  ).toBe(false);
  expect(
    offered(user({ IsAdministrator: false, EnableSubtitleManagement: true })),
  ).toBe(true);
  expect(offered(user({ IsAdministrator: true }))).toBe(true);
  expect(
    buildReducedRemotePlayerConfig({
      title: "Live",
      imageUrl: null,
      targetName: "Living Room TV",
      settings: defaultValues,
      t,
    }).ui.subtitleSearchEnabled,
  ).toBe(false);
});

// The search sheet offers the local player's languages and starts on the user's subtitle language.
test("the search offers the languages and starts on the user's subtitle language", () => {
  const ui = buildRemotePlayerConfig(
    params({
      settings: {
        ...defaultValues,
        defaultSubtitleLanguage: { ThreeLetterISOLanguageName: "fra" },
      },
    }),
  ).ui;

  expect(ui.subtitleSearchLanguages).toEqual(
    COMMON_SUBTITLE_LANGUAGES.map(({ code, name }) => ({ code, name })),
  );
  expect(ui.subtitleSearchDefaultLanguage).toBe("fre");
});

// The intro button seeks the TV: the screen gets the item's chapters and segments as the local player does.
test("the config carries the item's chapters and segments", () => {
  const segments = [
    {
      type: "Intro" as const,
      startSec: 5,
      endSec: 65,
      skipMode: "ask" as const,
    },
  ];

  const config = buildRemotePlayerConfig(params({ segments }));

  expect(config.chapters).toEqual([{ name: "Opening", startSec: 60 }]);
  expect(config.segments).toEqual(segments);
});

test("the config names the target and the episode list", () => {
  const episodeList = [
    { itemId: "episode-2", title: "Second", indexNumber: 2 },
  ];
  const nextEpisode = { itemId: "episode-2", title: "Second" };

  const config = buildRemotePlayerConfig(
    params({
      episodeList,
      nextEpisode,
      imageHeaders: { "X-Proxy": "on" },
    }),
  );

  expect(config.targetName).toBe("Living Room TV");
  expect(config.episodeList).toEqual(episodeList);
  expect(config.nextEpisode).toEqual(nextEpisode);
  expect(config.imageHeaders).toEqual({ "X-Proxy": "on" });
  expect(config.tracks?.audio.map((track) => track.label)).toEqual(["English"]);
  expect(
    config.tracks?.subtitles.find((track) => track.selected)?.jellyfinIndex,
  ).toBe(2);
});

// The image follows the app's own setting, as the Continue Watching cards do, and goes with its shape: lying down,
// the screen sizes the image's box before the image loads.
describe("the image", () => {
  const seriesEpisode: BaseItemDto = {
    ...episode,
    ParentThumbItemId: "series-1",
    ParentThumbImageTag: "series-thumb",
  };
  const image = (item: BaseItemDto, useEpisodeImagesForNextUp: boolean) => {
    const { metadata } = buildRemotePlayerConfig(
      params({
        item,
        settings: { ...defaultValues, useEpisodeImagesForNextUp },
      }),
    );
    return { uri: metadata.artworkUri, ratio: metadata.artworkAspectRatio };
  };

  test("an episode shows the series image by default", () => {
    const { uri, ratio } = image(seriesEpisode, false);
    expect(uri).toContain("/Items/series-1/Images/Thumb");
    expect(ratio).toBeCloseTo(16 / 9);
  });

  test("an episode shows its own image when the setting asks for it", () => {
    const { uri, ratio } = image(seriesEpisode, true);
    expect(uri).toContain("/Items/episode-1/Images/Primary");
    expect(ratio).toBeCloseTo(16 / 9);
  });

  test("an episode whose series has no wide image shows its own", () => {
    expect(image(episode, false).uri).toContain(
      "/Items/episode-1/Images/Primary",
    );
  });

  test.each([
    ["a poster's shape when the item gives none", undefined, 2 / 3],
    ["the shape the item gives", 1.5, 1.5],
  ])("a movie shows its poster, %s", (_case, given, expected) => {
    const movie: BaseItemDto = {
      Id: "movie-1",
      Name: "Feature",
      Type: "Movie",
      PrimaryImageAspectRatio: given,
    };
    const { uri, ratio } = image(movie, true);
    expect(uri).toContain("/Items/movie-1/Images/Primary");
    expect(ratio).toBeCloseTo(expected);
  });
});

// Upright, a tablet's image grows with its screen, to the native share of its width: it is asked at the pixels drawn
// there. Every phone stays under the native maximum and keeps the request it had, and the local player's never moves.
describe("the image's size", () => {
  const screen = (width: number, height: number, scale: number) => {
    jest
      .spyOn(Dimensions, "get")
      .mockReturnValue({ width, height, scale, fontScale: 1 });
    jest.spyOn(PixelRatio, "get").mockReturnValue(scale);
  };
  afterEach(() => jest.restoreAllMocks());
  // A movie as the server sends it, the tags the local player's request needs.
  const movie: BaseItemDto = {
    Id: "movie-1",
    Type: "Movie",
    ImageTags: { Primary: "poster" },
    BackdropImageTags: [],
  };
  const fillWidth = (uri: string | undefined) =>
    new URL(uri ?? "").searchParams.get("fillWidth");
  const asked = (item: BaseItemDto) =>
    fillWidth(buildRemotePlayerConfig(params({ item })).metadata.artworkUri);

  test.each([
    ["an iPhone", 402, 874, 3, "500", "1440"],
    ["a large iPhone", 440, 956, 3, "500", "1440"],
    ["an Android phone", 412, 915, 2.625, "500", "1260"],
    ["an iPad", 820, 1180, 2, "984", "1476"],
    ["an Android tablet", 800, 1280, 2, "960", "1440"],
  ])(
    "%s asks the poster and the episode image at the pixels it draws",
    (_device, width, height, scale, poster, wide) => {
      screen(width, height, scale);
      expect(asked(movie)).toBe(poster);
      expect(asked(episode)).toBe(wide);
    },
  );

  test("an upright iPad asks a wide poster at the box's width, and the local player keeps its request", () => {
    screen(1180, 820, 2);
    expect(asked({ ...movie, PrimaryImageAspectRatio: 1.5 })).toBe("1476");
    expect(fillWidth(buildMetadata(movie, makeApi()).artworkUri)).toBe("500");
  });
});

// No headers is none at all: the native side would otherwise send an empty set with every image.
test("the config leaves the image headers out when the user has none", () => {
  expect(buildRemotePlayerConfig(params())).not.toHaveProperty("imageHeaders");
});

// Another server's media: what the Cast status says of it, no menu, list or chapter, and none of this server's headers.
test("the reduced config shows the Cast title and image and nothing of this server", () => {
  const config = buildReducedRemotePlayerConfig({
    title: "Foreign Film",
    imageUrl: "https://other.example/poster.jpg",
    targetName: "Living Room TV",
    settings: defaultValues,
    t,
  });

  expect(config.reduced).toBe(true);
  expect(config.metadata).toEqual({
    title: "Foreign Film",
    artworkUri: "https://other.example/poster.jpg",
    isEpisode: false,
  });
  expect(config.targetName).toBe("Living Room TV");
  expect(config.tracks).toBeNull();
  expect(config.episodeList).toEqual([]);
  expect(config.chapters).toEqual([]);
  expect(config.trickplay).toBeNull();
  expect(config.nextEpisode).toBeNull();
  expect(config.tint).toBeNull();
  expect(config).not.toHaveProperty("imageHeaders");
  expect(config.ui.allowPip).toBe(false);
  expect(config.ui.strings?.playHere).toBe("player.play_here");
  expect(config.ui.outputPickerStrings?.title).toBe("cast.output.title");
});

test("the reduced config without a title or image leaves them out", () => {
  const config = buildReducedRemotePlayerConfig({
    title: null,
    imageUrl: null,
    targetName: null,
    settings: defaultValues,
    t,
  });

  expect(config.metadata).toEqual({ isEpisode: false });
});
