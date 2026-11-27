import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { PixelRatio } from "react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getItemImage } from "../../getItemImage";
import { getBackdropUrl } from "./getBackdropUrl";
import { getLogoImageUrlById } from "./getLogoImageUrlById";
import { getParentBackdropImageUrl } from "./getParentBackdropImageUrl";
import { getPortraitImageUrl } from "./getPortraitImageUrl";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";
import { getPrimaryImageUrlById } from "./getPrimaryImageUrlById";
import { getUserImageUrl } from "./getUserImageUrl";
import { getWideImageUrl } from "./getWideImageUrl";

// Characterization of every Jellyfin image URL builder as it behaves today.
// The query parameter order is part of the image cache key, so each URL is
// pinned in full. A case marked "Known:" pins a request that looks wrong, so
// that changing it shows up as a deliberate edit to this file.

const api = makeApi();
const base = api.basePath;

const movie = {
  Id: "movie-1",
  Type: "Movie",
  ImageTags: {
    Primary: "movie-primary",
    Thumb: "movie-thumb",
    Logo: "movie-logo",
  },
  BackdropImageTags: ["movie-backdrop"],
  ImageBlurHashes: {
    Primary: { "movie-primary": "movie-primary-hash" },
    Thumb: { "movie-thumb": "movie-thumb-hash" },
    Backdrop: { "movie-backdrop": "movie-backdrop-hash" },
    Logo: { "movie-logo": "movie-logo-hash" },
  },
} satisfies BaseItemDto;

const movieOnlyPrimary = {
  Id: "movie-2",
  Type: "Movie",
  ImageTags: { Primary: "only-primary" },
  BackdropImageTags: [],
  ImageBlurHashes: { Primary: { "only-primary": "only-primary-hash" } },
} satisfies BaseItemDto;

const movieNoImages = {
  Id: "movie-3",
  Type: "Movie",
  ImageTags: {},
  BackdropImageTags: [],
} satisfies BaseItemDto;

const series = {
  Id: "series-1",
  Type: "Series",
  ImageTags: {
    Primary: "series-primary",
    Thumb: "series-thumb",
    Logo: "series-logo",
  },
  BackdropImageTags: ["series-backdrop"],
  ImageBlurHashes: {
    Primary: { "series-primary": "series-primary-hash" },
    Thumb: { "series-thumb": "series-thumb-hash" },
    Backdrop: { "series-backdrop": "series-backdrop-hash" },
  },
} satisfies BaseItemDto;

const season = {
  Id: "season-1",
  Type: "Season",
  SeriesId: "series-1",
  SeriesPrimaryImageTag: "series-primary",
  ImageTags: { Primary: "season-primary" },
  BackdropImageTags: [],
  ParentLogoItemId: "series-1",
  ParentLogoImageTag: "series-logo",
  ParentBackdropItemId: "series-1",
  ParentBackdropImageTags: ["series-backdrop"],
} satisfies BaseItemDto;

const episode = {
  Id: "episode-1",
  Type: "Episode",
  SeriesId: "series-1",
  SeriesPrimaryImageTag: "series-primary",
  ImageTags: { Primary: "episode-primary" },
  BackdropImageTags: [],
  ImageBlurHashes: {
    Primary: { "episode-primary": "episode-primary-hash" },
    Backdrop: { "series-backdrop": "series-backdrop-hash" },
  },
  ParentThumbItemId: "series-1",
  ParentThumbImageTag: "series-thumb",
  ParentBackdropItemId: "series-1",
  ParentBackdropImageTags: ["series-backdrop"],
  ParentLogoItemId: "series-1",
  ParentLogoImageTag: "series-logo",
} satisfies BaseItemDto;

const episodeNoThumb = {
  Id: "episode-2",
  Type: "Episode",
  SeriesId: "series-1",
  ImageTags: { Primary: "episode-2-primary" },
  BackdropImageTags: [],
  ParentBackdropItemId: "series-1",
  ParentBackdropImageTags: ["series-backdrop"],
} satisfies BaseItemDto;

const episodeBare = {
  Id: "episode-3",
  Type: "Episode",
  ImageTags: {},
  BackdropImageTags: [],
} satisfies BaseItemDto;

const track = {
  Id: "track-1",
  Type: "Audio",
  AlbumId: "album-1",
  AlbumPrimaryImageTag: "album-primary",
  ImageTags: {},
  BackdropImageTags: [],
} satisfies BaseItemDto;

const trackOnlyParent = {
  Id: "track-2",
  Type: "Audio",
  ParentId: "album-2",
  ImageTags: {},
  BackdropImageTags: [],
} satisfies BaseItemDto;

const trackBare = {
  Id: "track-3",
  Type: "Audio",
  ImageTags: {},
  BackdropImageTags: [],
} satisfies BaseItemDto;

const person = {
  Id: "person-1",
  Name: "An Actor",
  PrimaryImageTag: "person-primary",
} satisfies BaseItemPerson;

const noId = {
  Type: "Movie",
  ImageTags: { Primary: "movie-primary", Logo: "movie-logo" },
  BackdropImageTags: ["movie-backdrop"],
} satisfies BaseItemDto;

const pick = (source: { uri?: string; blurhash?: string } | null) =>
  source && { uri: source.uri, blurhash: source.blurhash };

beforeEach(() => {
  jest.spyOn(PixelRatio, "get").mockReturnValue(2);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getPrimaryImageUrl", () => {
  test("returns null without an api", () => {
    expect(getPrimaryImageUrl({ api: null, item: movie })).toBe(null);
  });

  test("returns null without an item", () => {
    expect(getPrimaryImageUrl({ api, item: null })).toBe(null);
  });

  test("returns null for an item without an Id", () => {
    expect(getPrimaryImageUrl({ api, item: noId })).toBe(null);
  });

  test("uses the defaults of fillWidth 400 and quality 80", () => {
    expect(getPrimaryImageUrl({ api, item: movie })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=80&tag=movie-primary`,
    );
  });

  test("passes width and quality through", () => {
    expect(
      getPrimaryImageUrl({ api, item: movie, width: 300, quality: 70 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=70&tag=movie-primary`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for 0", () => {
    expect(getPrimaryImageUrl({ api, item: movie, width: 0, quality: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=80&tag=movie-primary`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for null", () => {
    expect(
      getPrimaryImageUrl({ api, item: movie, width: null, quality: null }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=80&tag=movie-primary`,
    );
  });

  test("adds the box height params when given a height", () => {
    expect(
      getPrimaryImageUrl({ api, item: movie, width: 600, height: 900 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&quality=80&tag=movie-primary&fillHeight=900&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("ignores a height of 0", () => {
    expect(getPrimaryImageUrl({ api, item: movie, height: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=80&tag=movie-primary`,
    );
  });

  test("rounds a fractional height", () => {
    expect(getPrimaryImageUrl({ api, item: movie, height: 899.6 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=80&tag=movie-primary&fillHeight=900&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("tags the request with the Primary tag of a series", () => {
    expect(getPrimaryImageUrl({ api, item: series })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=400&quality=80&tag=series-primary`,
    );
  });

  test("tags the request with the Primary tag of an episode", () => {
    expect(getPrimaryImageUrl({ api, item: episode })).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=400&quality=80&tag=episode-primary`,
    );
  });

  test("tags a movie with only a Primary tag", () => {
    expect(getPrimaryImageUrl({ api, item: movieOnlyPrimary })).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=400&quality=80&tag=only-primary`,
    );
  });

  test("borrows the backdrop tag when the item has no Primary tag", () => {
    expect(
      getPrimaryImageUrl({
        api,
        item: { ...movie, ImageTags: {} },
      }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=80&tag=movie-backdrop`,
    );
  });

  test("borrows the parent backdrop tag of an episode without Primary tag", () => {
    expect(getPrimaryImageUrl({ api, item: episodeNoThumb })).toBe(
      `${base}/Items/episode-2/Images/Primary?fillWidth=400&quality=80&tag=episode-2-primary`,
    );
    expect(
      getPrimaryImageUrl({ api, item: { ...episodeNoThumb, ImageTags: {} } }),
    ).toBe(
      `${base}/Items/episode-2/Images/Primary?fillWidth=400&quality=80&tag=series-backdrop`,
    );
  });

  test("asks for an untagged image for an item with no image tags", () => {
    // Known: untagged request, may 404
    expect(getPrimaryImageUrl({ api, item: movieNoImages })).toBe(
      `${base}/Items/movie-3/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("asks for an untagged image for an episode with no tags", () => {
    // Known: untagged request, may 404
    expect(getPrimaryImageUrl({ api, item: episodeBare })).toBe(
      `${base}/Items/episode-3/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("asks for an untagged image for a track with only an album", () => {
    // Known: untagged request, may 404; the album's image is not used
    expect(getPrimaryImageUrl({ api, item: track })).toBe(
      `${base}/Items/track-1/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("asks for an untagged image for a track with only a ParentId", () => {
    // Known: untagged request, may 404
    expect(getPrimaryImageUrl({ api, item: trackOnlyParent })).toBe(
      `${base}/Items/track-2/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("asks for an untagged image for a track with neither", () => {
    // Known: untagged request, may 404
    expect(getPrimaryImageUrl({ api, item: trackBare })).toBe(
      `${base}/Items/track-3/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("builds a bare URL for a person, ignoring width, quality and tag", () => {
    // Known: untagged request, may 404; the person's PrimaryImageTag is unused
    expect(
      getPrimaryImageUrl({ api, item: person, width: 300, quality: 70 }),
    ).toBe(`${base}/Items/person-1/Images/Primary`);
  });
});

describe("getPrimaryImageUrlById", () => {
  test("returns null without an api", () => {
    expect(getPrimaryImageUrlById({ api: null, id: "movie-1" })).toBe(null);
  });

  test("returns null without an id", () => {
    expect(getPrimaryImageUrlById({ api, id: null })).toBe(null);
    expect(getPrimaryImageUrlById({ api, id: undefined })).toBe(null);
    expect(getPrimaryImageUrlById({ api, id: "" })).toBe(null);
  });

  test("uses the defaults of fillWidth 500 and quality 90", () => {
    // Known: untagged request, may 404
    expect(getPrimaryImageUrlById({ api, id: "movie-1" })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90`,
    );
  });

  test("passes width and quality through", () => {
    // Known: untagged request, may 404
    expect(
      getPrimaryImageUrlById({ api, id: "movie-1", width: 250, quality: 60 }),
    ).toBe(`${base}/Items/movie-1/Images/Primary?fillWidth=250&quality=60`);
  });

  test("falls back to fillWidth 500 and quality 90 for 0", () => {
    // Known: untagged request, may 404
    expect(
      getPrimaryImageUrlById({ api, id: "movie-1", width: 0, quality: 0 }),
    ).toBe(`${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90`);
  });

  test("falls back to fillWidth 500 and quality 90 for null", () => {
    // Known: untagged request, may 404
    expect(
      getPrimaryImageUrlById({
        api,
        id: "movie-1",
        width: null,
        quality: null,
      }),
    ).toBe(`${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90`);
  });
});

describe("getPortraitImageUrl", () => {
  test("returns undefined without an api", () => {
    expect(getPortraitImageUrl({ api: null, item: movie, width: 300 })).toBe(
      undefined,
    );
  });

  test("returns undefined without an item", () => {
    expect(getPortraitImageUrl({ api, item: null, width: 300 })).toBe(
      undefined,
    );
  });

  test("uses the item's own primary image for a movie", () => {
    expect(getPortraitImageUrl({ api, item: movie, width: 300 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=80&tag=movie-primary`,
    );
  });

  test("uses the item's own primary image for a series and a season", () => {
    expect(getPortraitImageUrl({ api, item: series, width: 300 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=300&quality=80&tag=series-primary`,
    );
    expect(getPortraitImageUrl({ api, item: season, width: 300 })).toBe(
      `${base}/Items/season-1/Images/Primary?fillWidth=300&quality=80&tag=season-primary`,
    );
  });

  test("uses the series' primary image for an episode", () => {
    expect(getPortraitImageUrl({ api, item: episode, width: 300 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=300&quality=80&tag=series-primary`,
    );
  });

  test("asks for an untagged series image for an episode without a series tag", () => {
    // Known: untagged request, may 404
    expect(
      getPortraitImageUrl({
        api,
        item: { ...episode, SeriesPrimaryImageTag: undefined },
        width: 300,
      }),
    ).toBe(`${base}/Items/series-1/Images/Primary?fillWidth=300&quality=80`);
  });

  test("uses the episode's own primary image when it has no SeriesId", () => {
    expect(
      getPortraitImageUrl({
        api,
        item: { ...episode, SeriesId: undefined },
        width: 300,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=300&quality=80&tag=episode-primary`,
    );
    expect(getPortraitImageUrl({ api, item: episodeBare, width: 300 })).toBe(
      `${base}/Items/episode-3/Images/Primary?fillWidth=300&quality=80`,
    );
  });

  test("asks for an untagged image for a movie with no images", () => {
    // Known: untagged request, may 404
    expect(getPortraitImageUrl({ api, item: movieNoImages, width: 300 })).toBe(
      `${base}/Items/movie-3/Images/Primary?fillWidth=300&quality=80`,
    );
  });

  test("asks for an untagged image for a track", () => {
    // Known: untagged request, may 404
    expect(getPortraitImageUrl({ api, item: track, width: 300 })).toBe(
      `${base}/Items/track-1/Images/Primary?fillWidth=300&quality=80`,
    );
    expect(
      getPortraitImageUrl({ api, item: trackOnlyParent, width: 300 }),
    ).toBe(`${base}/Items/track-2/Images/Primary?fillWidth=300&quality=80`);
  });

  test("passes a width of 0 through for an episode, and falls back to 500 otherwise", () => {
    expect(getPortraitImageUrl({ api, item: episode, width: 0 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=0&quality=80&tag=series-primary`,
    );
    expect(getPortraitImageUrl({ api, item: movie, width: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=80&tag=movie-primary`,
    );
  });

  test("returns undefined for an item without an Id", () => {
    expect(getPortraitImageUrl({ api, item: noId, width: 300 })).toBe(
      undefined,
    );
  });
});

describe("getWideImageUrl", () => {
  test("returns undefined without an api", () => {
    expect(getWideImageUrl({ api: null, item: movie, fillHeight: 200 })).toBe(
      undefined,
    );
  });

  test("returns undefined without an item", () => {
    expect(getWideImageUrl({ api, item: null, fillHeight: 200 })).toBe(
      undefined,
    );
  });

  test("returns undefined for an item without an Id", () => {
    expect(getWideImageUrl({ api, item: noId, fillHeight: 200 })).toBe(
      undefined,
    );
  });

  test("uses the item's Thumb for a movie, at the default quality", () => {
    expect(getWideImageUrl({ api, item: movie, fillHeight: 200 })).toBe(
      `${base}/Items/movie-1/Images/Thumb?fillHeight=200&quality=80&tag=movie-thumb`,
    );
  });

  test("uses the item's Thumb for a series, at the given quality", () => {
    expect(
      getWideImageUrl({ api, item: series, fillHeight: 200, quality: 60 }),
    ).toBe(
      `${base}/Items/series-1/Images/Thumb?fillHeight=200&quality=60&tag=series-thumb`,
    );
  });

  test("fails over to Primary for a movie without a Thumb", () => {
    // Known: untagged request, may 404
    expect(
      getWideImageUrl({ api, item: movieOnlyPrimary, fillHeight: 200 }),
    ).toBe(`${base}/Items/movie-2/Images/Primary?fillHeight=200&quality=80`);
  });

  test("covers the whole box for the Primary failover when given a width", () => {
    // Known: untagged request, may 404
    expect(
      getWideImageUrl({
        api,
        item: movieOnlyPrimary,
        fillHeight: 200,
        fillWidth: 355,
      }),
    ).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=355&fillHeight=200&quality=80`,
    );
  });

  test("ignores a width for a Thumb", () => {
    expect(
      getWideImageUrl({ api, item: movie, fillHeight: 200, fillWidth: 355 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Thumb?fillHeight=200&quality=80&tag=movie-thumb`,
    );
  });

  test("asks for an untagged Primary for a movie with no images", () => {
    // Known: untagged request, may 404
    expect(getWideImageUrl({ api, item: movieNoImages, fillHeight: 200 })).toBe(
      `${base}/Items/movie-3/Images/Primary?fillHeight=200&quality=80`,
    );
  });

  test("uses the series Thumb through the parent pair for an episode", () => {
    expect(getWideImageUrl({ api, item: episode, fillHeight: 200 })).toBe(
      `${base}/Items/series-1/Images/Thumb?fillHeight=200&quality=80&tag=series-thumb`,
    );
  });

  test("uses the episode's own still when asked to", () => {
    // Known: untagged request, may 404
    expect(
      getWideImageUrl({
        api,
        item: episode,
        useEpisodePoster: true,
        fillHeight: 200,
        fillWidth: 355,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=355&fillHeight=200&quality=80`,
    );
  });

  test("falls back to the episode's Primary without a parent thumb pair", () => {
    // Known: untagged request, may 404
    expect(
      getWideImageUrl({ api, item: episodeNoThumb, fillHeight: 200 }),
    ).toBe(`${base}/Items/episode-2/Images/Primary?fillHeight=200&quality=80`);
  });

  test("falls back to the episode's Primary with half a parent thumb pair", () => {
    // Known: untagged request, may 404
    expect(
      getWideImageUrl({
        api,
        item: { ...episode, ParentThumbImageTag: undefined },
        fillHeight: 200,
      }),
    ).toBe(`${base}/Items/episode-1/Images/Primary?fillHeight=200&quality=80`);
    expect(
      getWideImageUrl({
        api,
        item: { ...episode, ParentThumbItemId: undefined },
        fillHeight: 200,
      }),
    ).toBe(`${base}/Items/episode-1/Images/Primary?fillHeight=200&quality=80`);
  });

  test("asks for an untagged Primary for an episode with nothing", () => {
    // Known: untagged request, may 404
    expect(getWideImageUrl({ api, item: episodeBare, fillHeight: 200 })).toBe(
      `${base}/Items/episode-3/Images/Primary?fillHeight=200&quality=80`,
    );
  });

  test("asks for an untagged Primary for a season and a track", () => {
    // Known: untagged request, may 404
    expect(getWideImageUrl({ api, item: season, fillHeight: 200 })).toBe(
      `${base}/Items/season-1/Images/Primary?fillHeight=200&quality=80`,
    );
    expect(getWideImageUrl({ api, item: track, fillHeight: 200 })).toBe(
      `${base}/Items/track-1/Images/Primary?fillHeight=200&quality=80`,
    );
  });
});

describe("getBackdropUrl", () => {
  test("returns null without an api", () => {
    expect(getBackdropUrl({ api: null, item: movie })).toBe(null);
  });

  test("returns null without an item", () => {
    expect(getBackdropUrl({ api, item: null })).toBe(null);
  });

  test("builds a bare backdrop request for a movie without arguments", () => {
    expect(getBackdropUrl({ api, item: movie })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("passes width and quality through", () => {
    expect(getBackdropUrl({ api, item: movie, width: 800, quality: 70 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?quality=70&fillWidth=800&tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("drops a width and quality of 0", () => {
    expect(getBackdropUrl({ api, item: movie, width: 0, quality: 0 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("adds the box height params when given a height", () => {
    expect(
      getBackdropUrl({
        api,
        item: movie,
        width: 800,
        quality: 70,
        height: 450,
      }),
    ).toBe(
      `${base}/Items/movie-1/Images/Backdrop?quality=70&fillWidth=800&tag=movie-backdrop&imageIndex=0&fillHeight=450&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("uses the backdrop of a series", () => {
    expect(getBackdropUrl({ api, item: series, width: 800 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=800&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("falls back to the primary image for a movie without a backdrop", () => {
    expect(getBackdropUrl({ api, item: movieOnlyPrimary })).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=400&quality=80&tag=only-primary`,
    );
    expect(getBackdropUrl({ api, item: movieOnlyPrimary, width: 800 })).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=800&quality=80&tag=only-primary`,
    );
  });

  test("asks for an untagged primary image for a movie with no images", () => {
    // Known: untagged request, may 404
    expect(getBackdropUrl({ api, item: movieNoImages })).toBe(
      `${base}/Items/movie-3/Images/Primary?fillWidth=400&quality=80`,
    );
  });

  test("uses the primary image for an episode, never its backdrop", () => {
    expect(getBackdropUrl({ api, item: episode, width: 800 })).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=800&quality=80&tag=episode-primary`,
    );
    expect(getBackdropUrl({ api, item: episodeBare, width: 800 })).toBe(
      `${base}/Items/episode-3/Images/Primary?fillWidth=800&quality=80`,
    );
  });

  test("falls back to the primary image for a season and a track", () => {
    // Known: untagged request, may 404
    expect(getBackdropUrl({ api, item: season, width: 800 })).toBe(
      `${base}/Items/season-1/Images/Primary?fillWidth=800&quality=80&tag=season-primary`,
    );
    expect(getBackdropUrl({ api, item: track, width: 800 })).toBe(
      `${base}/Items/track-1/Images/Primary?fillWidth=800&quality=80`,
    );
  });

  test("builds a path with undefined as the item id for a backdrop without an Id", () => {
    // Known: missing parent id
    expect(getBackdropUrl({ api, item: noId })).toBe(
      `${base}/Items/undefined/Images/Backdrop?tag=movie-backdrop&imageIndex=0`,
    );
  });
});

describe("getParentBackdropImageUrl", () => {
  test("returns null without an api", () => {
    expect(getParentBackdropImageUrl({ api: null, item: episode })).toBe(null);
  });

  test("returns null without an item", () => {
    expect(getParentBackdropImageUrl({ api, item: null })).toBe(null);
  });

  test("uses the defaults of fillWidth 400 and quality 80", () => {
    expect(getParentBackdropImageUrl({ api, item: episode })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=400&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("builds the same request for a season", () => {
    expect(getParentBackdropImageUrl({ api, item: season })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=400&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("passes width and quality through", () => {
    expect(
      getParentBackdropImageUrl({
        api,
        item: episode,
        width: 640,
        quality: 60,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=640&quality=60&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for 0", () => {
    expect(
      getParentBackdropImageUrl({ api, item: episode, width: 0, quality: 0 }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=500&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for null", () => {
    expect(
      getParentBackdropImageUrl({
        api,
        item: episode,
        width: null,
        quality: null,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=500&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("adds the box height params when given a height", () => {
    expect(
      getParentBackdropImageUrl({
        api,
        item: episode,
        width: 640,
        height: 360,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=640&quality=80&tag=series-backdrop&imageIndex=0&fillHeight=360&maxWidth=1920&maxHeight=1920`,
    );
  });

  test("ignores a height of 0", () => {
    expect(getParentBackdropImageUrl({ api, item: episode, height: 0 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=400&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("sends an empty tag for an episode without a parent backdrop tag", () => {
    // Known: untagged request, may 404; empty tag=
    expect(
      getParentBackdropImageUrl({
        api,
        item: { ...episode, ParentBackdropImageTags: [] },
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=400&quality=80&tag=&imageIndex=0`,
    );
  });

  test("builds a path with undefined as the item id for an item without a parent backdrop", () => {
    // Known: missing parent id
    expect(getParentBackdropImageUrl({ api, item: movie })).toBe(
      `${base}/Items/undefined/Images/Backdrop?fillWidth=400&quality=80&tag=&imageIndex=0`,
    );
    expect(getParentBackdropImageUrl({ api, item: episodeBare })).toBe(
      `${base}/Items/undefined/Images/Backdrop?fillWidth=400&quality=80&tag=&imageIndex=0`,
    );
  });
});

describe("getLogoImageUrlById", () => {
  test("returns null without an api", () => {
    expect(getLogoImageUrlById({ api: null, item: movie })).toBe(null);
  });

  test("returns null without an item", () => {
    expect(getLogoImageUrlById({ api, item: null })).toBe(null);
  });

  test("uses the logo slot height by default", () => {
    expect(getLogoImageUrlById({ api, item: movie })).toBe(
      `${base}/Items/movie-1/Images/Logo?quality=90&fillHeight=260&tag=movie-logo`,
    );
  });

  test("uses the logo of a series", () => {
    expect(getLogoImageUrlById({ api, item: series })).toBe(
      `${base}/Items/series-1/Images/Logo?quality=90&fillHeight=260&tag=series-logo`,
    );
  });

  test("passes a height through", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 200 })).toBe(
      `${base}/Items/movie-1/Images/Logo?quality=90&fillHeight=200&tag=movie-logo`,
    );
  });

  test("rounds a fractional height", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 200.6 })).toBe(
      `${base}/Items/movie-1/Images/Logo?quality=90&fillHeight=201&tag=movie-logo`,
    );
  });

  test("caps the height at the tallest logo the app asks for", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 2000 })).toBe(
      `${base}/Items/movie-1/Images/Logo?quality=90&fillHeight=600&tag=movie-logo`,
    );
  });

  test("asks for a height of 0 as given", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 0 })).toBe(
      `${base}/Items/movie-1/Images/Logo?quality=90&fillHeight=0&tag=movie-logo`,
    );
  });

  test("uses the series logo of an episode, through its parent pair", () => {
    expect(getLogoImageUrlById({ api, item: episode })).toBe(
      `${base}/Items/series-1/Images/Logo?quality=90&fillHeight=260&tag=series-logo`,
    );
  });

  test("returns null for an episode without a parent logo pair", () => {
    expect(getLogoImageUrlById({ api, item: episodeNoThumb })).toBe(null);
    expect(
      getLogoImageUrlById({
        api,
        item: { ...episode, ParentLogoImageTag: undefined },
      }),
    ).toBe(null);
    expect(
      getLogoImageUrlById({
        api,
        item: { ...episode, ParentLogoItemId: undefined },
      }),
    ).toBe(null);
  });

  test("returns null for a movie without a logo, a season and a track", () => {
    expect(getLogoImageUrlById({ api, item: movieOnlyPrimary })).toBe(null);
    expect(getLogoImageUrlById({ api, item: movieNoImages })).toBe(null);
    expect(getLogoImageUrlById({ api, item: track })).toBe(null);
  });

  test("does not use the parent logo pair of a season", () => {
    expect(getLogoImageUrlById({ api, item: season })).toBe(null);
  });

  test("returns null for an item without an Id", () => {
    expect(getLogoImageUrlById({ api, item: noId })).toBe(null);
  });
});

describe("getUserImageUrl", () => {
  const serverAddress = "https://jellyfin.example.com";

  test("returns null without a tag", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: null,
      }),
    ).toBe(null);
    expect(getUserImageUrl({ serverAddress, userId: "user-1" })).toBe(null);
    expect(
      getUserImageUrl({ serverAddress, userId: "user-1", primaryImageTag: "" }),
    ).toBe(null);
  });

  test("uses the default width of 280", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=280&tag=user-tag`,
    );
  });

  test("passes the width through", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
        width: 96,
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=96&tag=user-tag`,
    );
  });

  test("keeps a width of 0", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
        width: 0,
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=0&tag=user-tag`,
    );
  });

  test("keeps a path of the server address", () => {
    expect(
      getUserImageUrl({
        serverAddress: "https://example.com/jellyfin/",
        userId: "user-1",
        primaryImageTag: "user-tag",
      }),
    ).toBe(
      "https://example.com/jellyfin/Users/user-1/Images/Primary?quality=90&width=280&tag=user-tag",
    );
  });
});

describe("getItemImage", () => {
  test("returns null without an api", () => {
    expect(
      getItemImage({ api: null as never, item: movie, variant: "Primary" }),
    ).toBe(null);
  });

  describe("Primary (the default variant)", () => {
    test("uses the Primary tag and blurhash with the defaults", () => {
      expect(pick(getItemImage({ api, item: movie }))).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?quality=90&tag=movie-primary&width=1000`,
        blurhash: "movie-primary-hash",
      });
    });

    test("passes width and quality through", () => {
      expect(
        pick(getItemImage({ api, item: movie, width: 300, quality: 70 })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?quality=70&tag=movie-primary&width=300`,
        blurhash: "movie-primary-hash",
      });
    });

    test("adds the box height params when given a height", () => {
      expect(
        pick(getItemImage({ api, item: movie, width: 600.4, height: 900 })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?quality=90&tag=movie-primary&fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920`,
        blurhash: "movie-primary-hash",
      });
    });

    test("has no blurhash for a Primary tag without one", () => {
      expect(
        pick(getItemImage({ api, item: { ...movie, ImageBlurHashes: {} } })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?quality=90&tag=movie-primary&width=1000`,
      });
    });

    test("returns null for an item without a Primary tag", () => {
      expect(getItemImage({ api, item: movieNoImages })).toBe(null);
      expect(getItemImage({ api, item: episodeBare })).toBe(null);
      expect(getItemImage({ api, item: track })).toBe(null);
    });

    test("uses an episode's own Primary", () => {
      expect(pick(getItemImage({ api, item: episode }))).toEqual({
        uri: `${base}/Items/episode-1/Images/Primary?quality=90&tag=episode-primary&width=1000`,
        blurhash: "episode-primary-hash",
      });
    });

    test("asks for the path with undefined as the item id for an item without an Id", () => {
      // Known: missing parent id
      expect(pick(getItemImage({ api, item: noId }))).toEqual({
        uri: `${base}/Items/undefined/Images/Primary?quality=90&tag=movie-primary&width=1000`,
      });
    });
  });

  describe("Backdrop", () => {
    test("uses the item's backdrop tag and blurhash", () => {
      expect(
        pick(getItemImage({ api, item: movie, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Backdrop?quality=90&tag=movie-backdrop&width=1000&imageIndex=0`,
        blurhash: "movie-backdrop-hash",
      });
    });

    test("adds the box height params when given a height", () => {
      expect(
        pick(
          getItemImage({
            api,
            item: movie,
            variant: "Backdrop",
            width: 1233,
            height: 1500,
          }),
        ),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Backdrop?quality=90&tag=movie-backdrop&fillWidth=1233&fillHeight=1500&maxWidth=1920&maxHeight=1920&imageIndex=0`,
        blurhash: "movie-backdrop-hash",
      });
    });

    test("uses the parent backdrop of an episode", () => {
      expect(
        pick(getItemImage({ api, item: episode, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?quality=90&tag=series-backdrop&width=1000&imageIndex=0`,
        blurhash: "series-backdrop-hash",
      });
    });

    test("has no blurhash for an episode whose backdrop has none", () => {
      expect(
        pick(getItemImage({ api, item: episodeNoThumb, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?quality=90&tag=series-backdrop&width=1000&imageIndex=0`,
      });
    });

    test("returns null without a backdrop tag", () => {
      expect(
        getItemImage({ api, item: movieOnlyPrimary, variant: "Backdrop" }),
      ).toBe(null);
      expect(
        getItemImage({ api, item: episodeBare, variant: "Backdrop" }),
      ).toBe(null);
      expect(getItemImage({ api, item: track, variant: "Backdrop" })).toBe(
        null,
      );
    });
  });

  describe("Thumb", () => {
    test("asks for the Thumb tag as a Backdrop image, with its blurhash", () => {
      expect(
        pick(getItemImage({ api, item: movie, variant: "Thumb" })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Backdrop?quality=90&tag=movie-thumb&width=1000`,
        blurhash: "movie-thumb-hash",
      });
    });

    test("adds the box height params when given a height", () => {
      expect(
        pick(
          getItemImage({
            api,
            item: series,
            variant: "Thumb",
            width: 500,
            height: 281,
          }),
        ),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?quality=90&tag=series-thumb&fillWidth=500&fillHeight=281&maxWidth=1920&maxHeight=1920`,
        blurhash: "series-thumb-hash",
      });
    });

    test("returns null for an item without a Thumb tag, an episode among them", () => {
      expect(
        getItemImage({ api, item: movieOnlyPrimary, variant: "Thumb" }),
      ).toBe(null);
      expect(getItemImage({ api, item: episode, variant: "Thumb" })).toBe(null);
    });
  });

  describe("variants that fall through to the item's Primary", () => {
    test.each([
      "ParentBackdrop",
      "ParentLogo",
      "Logo",
      "AlbumPrimary",
      "SeriesPrimary",
      "Screenshot",
    ] as const)(
      "%s asks for the item's own Primary, without a blurhash",
      (variant) => {
        expect(pick(getItemImage({ api, item: movie, variant }))).toEqual({
          uri: `${base}/Items/movie-1/Images/Primary?quality=90&tag=movie-primary&width=1000`,
        });
      },
    );

    test("asks for the string undefined as the tag for an item without a Primary tag", () => {
      // Known: untagged request, may 404; tag=undefined
      expect(
        pick(getItemImage({ api, item: movieNoImages, variant: "Logo" })),
      ).toEqual({
        uri: `${base}/Items/movie-3/Images/Primary?quality=90&tag=undefined&width=1000`,
      });
    });

    test("ignores the album of a track", () => {
      // Known: untagged request, may 404; tag=undefined, the album is not used
      expect(
        pick(getItemImage({ api, item: track, variant: "AlbumPrimary" })),
      ).toEqual({
        uri: `${base}/Items/track-1/Images/Primary?quality=90&tag=undefined&width=1000`,
      });
    });

    test("ignores the series of an episode", () => {
      expect(
        pick(getItemImage({ api, item: episode, variant: "SeriesPrimary" })),
      ).toEqual({
        uri: `${base}/Items/episode-1/Images/Primary?quality=90&tag=episode-primary&width=1000`,
      });
    });

    test("ignores the parent logo of an episode", () => {
      expect(
        pick(getItemImage({ api, item: episode, variant: "ParentLogo" })),
      ).toEqual({
        uri: `${base}/Items/episode-1/Images/Primary?quality=90&tag=episode-primary&width=1000`,
      });
    });

    test("adds the box height params when given a height", () => {
      expect(
        pick(
          getItemImage({
            api,
            item: movie,
            variant: "Screenshot",
            width: 640,
            height: 360,
          }),
        ),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?quality=90&tag=movie-primary&fillWidth=640&fillHeight=360&maxWidth=1920&maxHeight=1920`,
      });
    });
  });
});
