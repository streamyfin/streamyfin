import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { makeApi } from "@/test-utils/jellyfinApi";
import { defaultValues } from "@/utils/atoms/settings";
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
  t,
  ...overrides,
});

// The TV plays the stream: the screen gets what it shows of it, and none of the phone's own player.
test("the config carries no stream and no picture in picture", () => {
  const config = buildRemotePlayerConfig(params());

  expect(config).not.toHaveProperty("stream");
  expect(config.ui.allowPip).toBe(false);
  expect(config.ui.orientationLock).toBe("none");
  expect(config.ui.subtitleSearchEnabled).toBe(false);
  expect(config.tint).toBeNull();
  expect(config.metadata).toMatchObject({
    itemId: "episode-1",
    title: "Pilot",
    isEpisode: true,
  });
  expect(config.chapters).toEqual([{ name: "Opening", startSec: 60 }]);
  expect(config.ui.strings?.playHere).toBe("player.play_here");
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
