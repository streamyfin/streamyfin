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
// pinned in full. A case marked "Fixed:" pins a request that used to look wrong,
// and one marked "Changed:" a request that moved with the shared selection and
// sizing, so a later change shows up as a deliberate edit to this file.

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

  test("uses the defaults of fillWidth 400 and quality 90", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: movie })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=90&tag=movie-primary`,
    );
  });

  test("passes width through and ignores quality", () => {
    // Web: 5
    expect(
      getPrimaryImageUrl({ api, item: movie, width: 300, quality: 70 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=movie-primary`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for 0", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: movie, width: 0, quality: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90&tag=movie-primary`,
    );
  });

  test("falls back to fillWidth 500 and quality 80 for null", () => {
    // Web: 5
    expect(
      getPrimaryImageUrl({ api, item: movie, width: null, quality: null }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90&tag=movie-primary`,
    );
  });

  test("adds the box height params when given a height", () => {
    // Web: 5
    expect(
      getPrimaryImageUrl({ api, item: movie, width: 600, height: 900 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90&tag=movie-primary`,
    );
  });

  test("ignores a height of 0", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: movie, height: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&quality=90&tag=movie-primary`,
    );
  });

  test("rounds a fractional height", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: movie, height: 899.6 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=400&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90&tag=movie-primary`,
    );
  });

  test("tags the request with the Primary tag of a series", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: series })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=400&quality=90&tag=series-primary`,
    );
  });

  test("tags the request with the Primary tag of an episode", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: episode })).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=400&quality=90&tag=episode-primary`,
    );
  });

  test("tags a movie with only a Primary tag", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: movieOnlyPrimary })).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=400&quality=90&tag=only-primary`,
    );
  });

  test("never borrows the backdrop tag when the item has no Primary tag", () => {
    // Fixed: a Primary request no longer carries a Backdrop tag
    expect(
      getPrimaryImageUrl({
        api,
        item: { ...movie, ImageTags: {} },
      }),
    ).toBe(null);
  });

  test("never borrows the parent backdrop tag of an episode without Primary tag", () => {
    // Web: 5
    expect(getPrimaryImageUrl({ api, item: episodeNoThumb })).toBe(
      `${base}/Items/episode-2/Images/Primary?fillWidth=400&quality=90&tag=episode-2-primary`,
    );
    // Fixed: a Primary request no longer carries a Backdrop tag
    expect(
      getPrimaryImageUrl({ api, item: { ...episodeNoThumb, ImageTags: {} } }),
    ).toBe(null);
  });

  test("returns null for an item with no image tags", () => {
    // Fixed: untagged request now returns null
    expect(getPrimaryImageUrl({ api, item: movieNoImages })).toBe(null);
  });

  test("returns null for an episode with no tags", () => {
    // Fixed: untagged request now returns null
    expect(getPrimaryImageUrl({ api, item: episodeBare })).toBe(null);
  });

  test("returns null for a track with only an album", () => {
    // Fixed: untagged request now returns null
    expect(getPrimaryImageUrl({ api, item: track })).toBe(null);
  });

  test("returns null for a track with only a ParentId", () => {
    // Fixed: untagged request now returns null
    expect(getPrimaryImageUrl({ api, item: trackOnlyParent })).toBe(null);
  });

  test("returns null for a track with neither", () => {
    // Fixed: untagged request now returns null
    expect(getPrimaryImageUrl({ api, item: trackBare })).toBe(null);
  });

  test("tags a person's request with its PrimaryImageTag and sizes it", () => {
    // Fixed: a person uses PrimaryImageTag instead of a bare URL
    // Web: 5
    expect(
      getPrimaryImageUrl({ api, item: person, width: 300, quality: 70 }),
    ).toBe(
      `${base}/Items/person-1/Images/Primary?fillWidth=300&quality=90&tag=person-primary`,
    );
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
    // Untagged by necessity: the caller has an id and no item
    expect(getPrimaryImageUrlById({ api, id: "movie-1" })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90`,
    );
  });

  test("passes width through and ignores quality", () => {
    // Untagged by necessity: the caller has an id and no item
    // Web: 5
    expect(
      getPrimaryImageUrlById({ api, id: "movie-1", width: 250, quality: 60 }),
    ).toBe(`${base}/Items/movie-1/Images/Primary?fillWidth=250&quality=90`);
  });

  test("falls back to fillWidth 500 and quality 90 for 0", () => {
    // Untagged by necessity: the caller has an id and no item
    expect(
      getPrimaryImageUrlById({ api, id: "movie-1", width: 0, quality: 0 }),
    ).toBe(`${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90`);
  });

  test("falls back to fillWidth 500 and quality 90 for null", () => {
    // Untagged by necessity: the caller has an id and no item
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
    // Web: 5
    expect(getPortraitImageUrl({ api, item: movie, width: 300 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=movie-primary`,
    );
  });

  test("uses the item's own primary image for a series and a season", () => {
    // Web: 5
    expect(getPortraitImageUrl({ api, item: series, width: 300 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=300&quality=90&tag=series-primary`,
    );
    // Web: 5
    expect(getPortraitImageUrl({ api, item: season, width: 300 })).toBe(
      `${base}/Items/season-1/Images/Primary?fillWidth=300&quality=90&tag=season-primary`,
    );
  });

  test("uses the series' primary image for an episode", () => {
    // Web: 5
    expect(getPortraitImageUrl({ api, item: episode, width: 300 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=300&quality=90&tag=series-primary`,
    );
  });

  test("uses the episode's own image for an episode without a series tag", () => {
    // Fixed: no untagged series request, the episode's own tagged Primary instead
    // Web: 5
    expect(
      getPortraitImageUrl({
        api,
        item: { ...episode, SeriesPrimaryImageTag: undefined },
        width: 300,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=300&quality=90&tag=episode-primary`,
    );
  });

  test("uses the episode's own primary image when it has no SeriesId", () => {
    // Web: 5
    expect(
      getPortraitImageUrl({
        api,
        item: { ...episode, SeriesId: undefined },
        width: 300,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=300&quality=90&tag=episode-primary`,
    );
    // Fixed: untagged request now returns undefined
    expect(getPortraitImageUrl({ api, item: episodeBare, width: 300 })).toBe(
      undefined,
    );
  });

  test("returns undefined for a movie with no images", () => {
    // Fixed: untagged request now returns undefined
    expect(getPortraitImageUrl({ api, item: movieNoImages, width: 300 })).toBe(
      undefined,
    );
  });

  test("returns undefined for a track", () => {
    // Fixed: untagged request now returns undefined
    expect(getPortraitImageUrl({ api, item: track, width: 300 })).toBe(
      undefined,
    );
    expect(
      getPortraitImageUrl({ api, item: trackOnlyParent, width: 300 }),
    ).toBe(undefined);
  });

  test("falls back to a width of 500 for 0", () => {
    // Changed: an episode used to send fillWidth=0
    // Web: 5
    expect(getPortraitImageUrl({ api, item: episode, width: 0 })).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=500&quality=90&tag=series-primary`,
    );
    // Web: 5
    expect(getPortraitImageUrl({ api, item: movie, width: 0 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=500&quality=90&tag=movie-primary`,
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
    // Web: 5
    expect(getWideImageUrl({ api, item: movie, fillHeight: 200 })).toBe(
      `${base}/Items/movie-1/Images/Thumb?fillHeight=200&quality=90&tag=movie-thumb`,
    );
  });

  test("uses the item's Thumb for a series, ignoring the given quality", () => {
    // Web: 5
    expect(
      getWideImageUrl({ api, item: series, fillHeight: 200, quality: 60 }),
    ).toBe(
      `${base}/Items/series-1/Images/Thumb?fillHeight=200&quality=90&tag=series-thumb`,
    );
  });

  test("fails over to Primary for a movie without a Thumb", () => {
    // Fixed: the failover request now carries the Primary tag
    // Web: 5
    expect(
      getWideImageUrl({ api, item: movieOnlyPrimary, fillHeight: 200 }),
    ).toBe(
      `${base}/Items/movie-2/Images/Primary?fillHeight=200&quality=90&tag=only-primary`,
    );
  });

  test("covers the whole box for the Primary failover when given a width", () => {
    // Fixed: the failover request now carries the Primary tag
    // Changed: both sides now add maxWidth and maxHeight
    // Web: 5
    expect(
      getWideImageUrl({
        api,
        item: movieOnlyPrimary,
        fillHeight: 200,
        fillWidth: 355,
      }),
    ).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=355&fillHeight=200&maxWidth=1920&maxHeight=1920&quality=90&tag=only-primary`,
    );
  });

  test("sizes a Thumb by the box it covers", () => {
    // Changed: a Thumb gets both sides like every other cover-fit image.
    // Web: 5
    expect(
      getWideImageUrl({ api, item: movie, fillHeight: 200, fillWidth: 355 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Thumb?fillWidth=355&fillHeight=200&maxWidth=1920&maxHeight=1920&quality=90&tag=movie-thumb`,
    );
  });

  test("returns undefined for a movie with no images", () => {
    // Fixed: untagged request now returns undefined
    expect(getWideImageUrl({ api, item: movieNoImages, fillHeight: 200 })).toBe(
      undefined,
    );
  });

  test("uses the series Thumb through the parent pair for an episode", () => {
    // Web: 5
    expect(getWideImageUrl({ api, item: episode, fillHeight: 200 })).toBe(
      `${base}/Items/series-1/Images/Thumb?fillHeight=200&quality=90&tag=series-thumb`,
    );
  });

  test("uses the episode's own still when asked to", () => {
    // Fixed: the request now carries the episode's Primary tag
    // Changed: both sides now add maxWidth and maxHeight
    // Web: 5
    expect(
      getWideImageUrl({
        api,
        item: episode,
        useEpisodePoster: true,
        fillHeight: 200,
        fillWidth: 355,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillWidth=355&fillHeight=200&maxWidth=1920&maxHeight=1920&quality=90&tag=episode-primary`,
    );
  });

  test("falls back to the series backdrop without a parent thumb pair", () => {
    // Fixed: the episode chain gains the parent backdrop step
    expect(
      getWideImageUrl({ api, item: episodeNoThumb, fillHeight: 200 }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillHeight=200&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("falls back to the series backdrop with half a parent thumb pair", () => {
    // Fixed: the episode chain gains the parent backdrop step
    expect(
      getWideImageUrl({
        api,
        item: { ...episode, ParentThumbImageTag: undefined },
        fillHeight: 200,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillHeight=200&quality=80&tag=series-backdrop&imageIndex=0`,
    );
    expect(
      getWideImageUrl({
        api,
        item: { ...episode, ParentThumbItemId: undefined },
        fillHeight: 200,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillHeight=200&quality=80&tag=series-backdrop&imageIndex=0`,
    );
    // Web: 5
    expect(
      getWideImageUrl({
        api,
        item: {
          ...episode,
          ParentThumbImageTag: undefined,
          ParentBackdropImageTags: [],
        },
        fillHeight: 200,
      }),
    ).toBe(
      `${base}/Items/episode-1/Images/Primary?fillHeight=200&quality=90&tag=episode-primary`,
    );
  });

  test("returns undefined for an episode with nothing", () => {
    // Fixed: untagged request now returns undefined
    expect(getWideImageUrl({ api, item: episodeBare, fillHeight: 200 })).toBe(
      undefined,
    );
  });

  test("uses a season's tagged Primary, and nothing for a track", () => {
    // Fixed: the season's request now carries its Primary tag
    // Web: 5
    expect(getWideImageUrl({ api, item: season, fillHeight: 200 })).toBe(
      `${base}/Items/season-1/Images/Primary?fillHeight=200&quality=90&tag=season-primary`,
    );
    // Fixed: untagged request now returns undefined
    expect(getWideImageUrl({ api, item: track, fillHeight: 200 })).toBe(
      undefined,
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

  test("asks for the default quality only for a movie without arguments", () => {
    // Changed: the default quality is now sent
    expect(getBackdropUrl({ api, item: movie })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?quality=80&tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("passes width through and ignores quality", () => {
    // Web: 5
    expect(getBackdropUrl({ api, item: movie, width: 800, quality: 70 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?fillWidth=800&quality=80&tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("drops a width of 0 and uses the default quality for 0", () => {
    // Changed: the default quality is now sent
    expect(getBackdropUrl({ api, item: movie, width: 0, quality: 0 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?quality=80&tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("adds the box height params when given a height", () => {
    // Web: 5
    expect(
      getBackdropUrl({
        api,
        item: movie,
        width: 800,
        quality: 70,
        height: 450,
      }),
    ).toBe(
      `${base}/Items/movie-1/Images/Backdrop?fillWidth=800&fillHeight=450&maxWidth=1920&maxHeight=1920&quality=80&tag=movie-backdrop&imageIndex=0`,
    );
  });

  test("uses the backdrop of a series", () => {
    // Changed: the default quality is now sent
    expect(getBackdropUrl({ api, item: series, width: 800 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=800&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("falls back to the primary image for a movie without a backdrop", () => {
    // Changed: the fallback no longer defaults to fillWidth=400
    // Web: 5
    expect(getBackdropUrl({ api, item: movieOnlyPrimary })).toBe(
      `${base}/Items/movie-2/Images/Primary?quality=90&tag=only-primary`,
    );
    // Web: 5
    expect(getBackdropUrl({ api, item: movieOnlyPrimary, width: 800 })).toBe(
      `${base}/Items/movie-2/Images/Primary?fillWidth=800&quality=90&tag=only-primary`,
    );
  });

  test("returns null for a movie with no images", () => {
    // Fixed: untagged request now returns null
    expect(getBackdropUrl({ api, item: movieNoImages })).toBe(null);
  });

  test("uses the series backdrop for an episode", () => {
    // Web: 4
    expect(getBackdropUrl({ api, item: episode, width: 800 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=800&quality=80&tag=series-backdrop&imageIndex=0`,
    );
    // Fixed: untagged request now returns null
    expect(getBackdropUrl({ api, item: episodeBare, width: 800 })).toBe(null);
  });

  test("uses the series backdrop for a season, and nothing for a track", () => {
    // Web: 4
    expect(getBackdropUrl({ api, item: season, width: 800 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=800&quality=80&tag=series-backdrop&imageIndex=0`,
    );
    // Fixed: untagged request now returns null
    expect(getBackdropUrl({ api, item: track, width: 800 })).toBe(null);
  });

  test("returns null for a backdrop without an Id", () => {
    // Fixed: no /Items/undefined/ path
    expect(getBackdropUrl({ api, item: noId })).toBe(null);
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

  test("passes width through and ignores quality", () => {
    // Web: 5
    expect(
      getParentBackdropImageUrl({
        api,
        item: episode,
        width: 640,
        quality: 60,
      }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=640&quality=80&tag=series-backdrop&imageIndex=0`,
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
      `${base}/Items/series-1/Images/Backdrop?fillWidth=640&fillHeight=360&maxWidth=1920&maxHeight=1920&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("ignores a height of 0", () => {
    expect(getParentBackdropImageUrl({ api, item: episode, height: 0 })).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=400&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("returns null for an episode without a parent backdrop tag", () => {
    // Fixed: no empty tag=
    expect(
      getParentBackdropImageUrl({
        api,
        item: { ...episode, ParentBackdropImageTags: [] },
      }),
    ).toBe(null);
  });

  test("returns null for an item without a parent backdrop", () => {
    // Fixed: no /Items/undefined/ path
    expect(getParentBackdropImageUrl({ api, item: movie })).toBe(null);
    expect(getParentBackdropImageUrl({ api, item: episodeBare })).toBe(null);
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
      `${base}/Items/movie-1/Images/Logo?fillHeight=260&quality=90&tag=movie-logo`,
    );
  });

  test("uses the logo of a series", () => {
    expect(getLogoImageUrlById({ api, item: series })).toBe(
      `${base}/Items/series-1/Images/Logo?fillHeight=260&quality=90&tag=series-logo`,
    );
  });

  test("passes a height through", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 200 })).toBe(
      `${base}/Items/movie-1/Images/Logo?fillHeight=200&quality=90&tag=movie-logo`,
    );
  });

  test("rounds a fractional height", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 200.6 })).toBe(
      `${base}/Items/movie-1/Images/Logo?fillHeight=201&quality=90&tag=movie-logo`,
    );
  });

  test("caps the height at the tallest logo the app asks for", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 2000 })).toBe(
      `${base}/Items/movie-1/Images/Logo?fillHeight=600&quality=90&tag=movie-logo`,
    );
  });

  test("asks for a height of 0 as given", () => {
    expect(getLogoImageUrlById({ api, item: movie, height: 0 })).toBe(
      `${base}/Items/movie-1/Images/Logo?fillHeight=0&quality=90&tag=movie-logo`,
    );
  });

  test("uses the series logo of an episode, through its parent pair", () => {
    expect(getLogoImageUrlById({ api, item: episode })).toBe(
      `${base}/Items/series-1/Images/Logo?fillHeight=260&quality=90&tag=series-logo`,
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

  test("uses the parent logo pair of a season", () => {
    // Changed: the logo kind falls back to the parent logo for any item type
    expect(getLogoImageUrlById({ api, item: season })).toBe(
      `${base}/Items/series-1/Images/Logo?fillHeight=260&quality=90&tag=series-logo`,
    );
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
        uri: `${base}/Items/movie-1/Images/Primary?fillWidth=1000&quality=90&tag=movie-primary`,
        blurhash: "movie-primary-hash",
      });
    });

    test("passes width through and ignores quality", () => {
      // Web: 5
      expect(
        pick(getItemImage({ api, item: movie, width: 300, quality: 70 })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=movie-primary`,
        blurhash: "movie-primary-hash",
      });
    });

    test("adds the box height params when given a height", () => {
      expect(
        pick(getItemImage({ api, item: movie, width: 600.4, height: 900 })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90&tag=movie-primary`,
        blurhash: "movie-primary-hash",
      });
    });

    test("has no blurhash for a Primary tag without one", () => {
      expect(
        pick(getItemImage({ api, item: { ...movie, ImageBlurHashes: {} } })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?fillWidth=1000&quality=90&tag=movie-primary`,
      });
    });

    test("returns null for an item without a Primary tag", () => {
      expect(getItemImage({ api, item: movieNoImages })).toBe(null);
      expect(getItemImage({ api, item: episodeBare })).toBe(null);
      expect(getItemImage({ api, item: track })).toBe(null);
    });

    test("uses an episode's own Primary", () => {
      expect(pick(getItemImage({ api, item: episode }))).toEqual({
        uri: `${base}/Items/episode-1/Images/Primary?fillWidth=1000&quality=90&tag=episode-primary`,
        blurhash: "episode-primary-hash",
      });
    });

    test("returns null for an item without an Id", () => {
      // Fixed: no /Items/undefined/ path
      expect(getItemImage({ api, item: noId })).toBe(null);
    });
  });

  describe("Backdrop", () => {
    test("uses the item's backdrop tag and blurhash", () => {
      // Web: 5
      expect(
        pick(getItemImage({ api, item: movie, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Backdrop?fillWidth=1000&quality=80&tag=movie-backdrop&imageIndex=0`,
        blurhash: "movie-backdrop-hash",
      });
    });

    test("adds the box height params when given a height", () => {
      // Web: 5
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
        uri: `${base}/Items/movie-1/Images/Backdrop?fillWidth=1233&fillHeight=1500&maxWidth=1920&maxHeight=1920&quality=80&tag=movie-backdrop&imageIndex=0`,
        blurhash: "movie-backdrop-hash",
      });
    });

    test("uses the parent backdrop of an episode", () => {
      // Web: 5
      expect(
        pick(getItemImage({ api, item: episode, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?fillWidth=1000&quality=80&tag=series-backdrop&imageIndex=0`,
        blurhash: "series-backdrop-hash",
      });
    });

    test("has no blurhash for an episode whose backdrop has none", () => {
      // Web: 5
      expect(
        pick(getItemImage({ api, item: episodeNoThumb, variant: "Backdrop" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?fillWidth=1000&quality=80&tag=series-backdrop&imageIndex=0`,
      });
    });

    test("falls back to the Primary without a backdrop tag", () => {
      // Web: 4
      expect(
        pick(
          getItemImage({ api, item: movieOnlyPrimary, variant: "Backdrop" }),
        ),
      ).toEqual({
        uri: `${base}/Items/movie-2/Images/Primary?fillWidth=1000&quality=90&tag=only-primary`,
        blurhash: "only-primary-hash",
      });
    });

    test("returns null without any image", () => {
      expect(
        getItemImage({ api, item: episodeBare, variant: "Backdrop" }),
      ).toBe(null);
      expect(getItemImage({ api, item: track, variant: "Backdrop" })).toBe(
        null,
      );
    });
  });

  describe("Thumb", () => {
    test("asks for the Thumb image, with its blurhash", () => {
      // Fixed: the Thumb tag is asked of the Thumb endpoint, not Backdrop
      expect(
        pick(getItemImage({ api, item: movie, variant: "Thumb" })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Thumb?fillWidth=1000&quality=90&tag=movie-thumb`,
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
        uri: `${base}/Items/series-1/Images/Thumb?fillWidth=500&fillHeight=281&maxWidth=1920&maxHeight=1920&quality=90&tag=series-thumb`,
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

  describe("variants that used to fall through to the item's Primary", () => {
    // Fixed: each variant resolves its own image instead of the item's Primary
    test("ParentBackdrop returns null for a movie, which has no parent", () => {
      expect(
        getItemImage({ api, item: movie, variant: "ParentBackdrop" }),
      ).toBe(null);
    });

    test("ParentBackdrop uses the parent backdrop of an episode", () => {
      // Web: 5
      expect(
        pick(getItemImage({ api, item: episode, variant: "ParentBackdrop" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Backdrop?fillWidth=1000&quality=80&tag=series-backdrop&imageIndex=0`,
        blurhash: "series-backdrop-hash",
      });
    });

    test.each(["ParentLogo", "Logo"] as const)(
      "%s uses the item's own logo",
      (variant) => {
        expect(pick(getItemImage({ api, item: movie, variant }))).toEqual({
          uri: `${base}/Items/movie-1/Images/Logo?fillWidth=1000&quality=90&tag=movie-logo`,
          blurhash: "movie-logo-hash",
        });
      },
    );

    test("ParentLogo uses the parent logo of an episode", () => {
      expect(
        pick(getItemImage({ api, item: episode, variant: "ParentLogo" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Logo?fillWidth=1000&quality=90&tag=series-logo`,
      });
    });

    test("returns null for a logo the item does not have", () => {
      expect(getItemImage({ api, item: movieNoImages, variant: "Logo" })).toBe(
        null,
      );
    });

    test("AlbumPrimary uses the album of a track", () => {
      expect(
        pick(getItemImage({ api, item: track, variant: "AlbumPrimary" })),
      ).toEqual({
        uri: `${base}/Items/album-1/Images/Primary?fillWidth=1000&quality=90&tag=album-primary`,
      });
    });

    test("SeriesPrimary uses the series of an episode", () => {
      expect(
        pick(getItemImage({ api, item: episode, variant: "SeriesPrimary" })),
      ).toEqual({
        uri: `${base}/Items/series-1/Images/Primary?fillWidth=1000&quality=90&tag=series-primary`,
      });
    });

    test("SeriesPrimary uses the item's own Primary when it is no episode", () => {
      expect(
        pick(getItemImage({ api, item: movie, variant: "SeriesPrimary" })),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Primary?fillWidth=1000&quality=90&tag=movie-primary`,
        blurhash: "movie-primary-hash",
      });
    });

    test("Screenshot returns null for an item without one", () => {
      expect(getItemImage({ api, item: movie, variant: "Screenshot" })).toBe(
        null,
      );
    });

    test("Screenshot uses the item's own Screenshot, with the box height params", () => {
      expect(
        pick(
          getItemImage({
            api,
            item: { ...movie, ImageTags: { Screenshot: "shot" } },
            variant: "Screenshot",
            width: 640,
            height: 360,
          }),
        ),
      ).toEqual({
        uri: `${base}/Items/movie-1/Images/Screenshot?fillWidth=640&fillHeight=360&maxWidth=1920&maxHeight=1920&quality=90&tag=shot`,
      });
    });
  });
});
