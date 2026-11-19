import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { makeApi } from "@/test-utils/jellyfinApi";
import { defaultValues } from "@/utils/atoms/settings";
import { buildRemotePlayerConfig } from "./buildRemotePlayerConfig";

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
