import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getItemImage } from "./getItemImage";

const api = makeApi();

const movie = {
  Id: "movie-1",
  Type: "Movie",
  ImageTags: { Primary: "primary-tag" },
  BackdropImageTags: ["backdrop-tag"],
} satisfies BaseItemDto;

describe("getItemImage", () => {
  // Issue #2166: the detail page header asked for a 1000 pixel wide backdrop
  // and covered a 1233 by 1500 pixel box with it.
  test("asks for an image that covers the whole box when given its height", () => {
    const source = getItemImage({
      api,
      item: movie,
      kind: "backdrop",
      width: 1233,
      height: 1500,
    });

    // Web: 5
    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Backdrop?fillWidth=1233&fillHeight=1500&maxWidth=1920&maxHeight=1920&quality=80&tag=backdrop-tag&imageIndex=0`,
    );
  });

  test("covers the box with the primary image too", () => {
    const source = getItemImage({
      api,
      item: movie,
      width: 1233,
      height: 1050,
    });

    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Primary?fillWidth=1233&fillHeight=1050&maxWidth=1920&maxHeight=1920&quality=90&tag=primary-tag`,
    );
  });

  test("leaves a width only request as it was", () => {
    const source = getItemImage({ api, item: movie, kind: "backdrop" });

    // Web: 5
    expect(source?.uri).toBe(
      `${api.basePath}/Items/movie-1/Images/Backdrop?fillWidth=1000&quality=80&tag=backdrop-tag&imageIndex=0`,
    );
  });
});

describe("getItemImage kinds", () => {
  const base = api.basePath;
  const pick = (source: { uri?: string; blurhash?: string } | null) =>
    source && { uri: source.uri, blurhash: source.blurhash };

  const full = {
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
    },
  } satisfies BaseItemDto;

  const episode = {
    Id: "episode-1",
    Type: "Episode",
    SeriesId: "series-1",
    SeriesPrimaryImageTag: "series-primary",
    ImageTags: { Primary: "episode-primary" },
    BackdropImageTags: [],
    ImageBlurHashes: {
      Backdrop: { "series-backdrop": "series-backdrop-hash" },
    },
    ParentBackdropItemId: "series-1",
    ParentBackdropImageTags: ["series-backdrop"],
    ParentLogoItemId: "series-1",
    ParentLogoImageTag: "series-logo",
  } satisfies BaseItemDto;

  const track = {
    Id: "track-1",
    Type: "Audio",
    AlbumId: "album-1",
    AlbumPrimaryImageTag: "album-primary",
    ImageTags: {},
    BackdropImageTags: [],
  } satisfies BaseItemDto;

  const bare = {
    Id: "movie-3",
    Type: "Movie",
    ImageTags: {},
    BackdropImageTags: [],
  } satisfies BaseItemDto;

  test("returns null without an api", () => {
    expect(getItemImage({ api: null as never, item: full })).toBeNull();
  });

  test("primary is the default, with its blurhash and a width of 1000", () => {
    expect(pick(getItemImage({ api, item: full }))).toEqual({
      uri: `${base}/Items/movie-1/Images/Primary?fillWidth=1000&quality=90&tag=movie-primary`,
      blurhash: "movie-primary-hash",
    });
  });

  test("ignores a quality passed in", () => {
    expect(
      getItemImage({ api, item: full, width: 300, quality: 70 })?.uri,
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=movie-primary`,
    );
  });

  test("an item without the image has no source, an item without an Id too", () => {
    expect(getItemImage({ api, item: bare })).toBeNull();
    expect(getItemImage({ api, item: track })).toBeNull();
    expect(getItemImage({ api, item: { ...full, Id: undefined } })).toBeNull();
  });

  test("backdrop carries the blurhash of the item's backdrop", () => {
    // Web: 5
    expect(pick(getItemImage({ api, item: full, kind: "backdrop" }))).toEqual({
      uri: `${base}/Items/movie-1/Images/Backdrop?fillWidth=1000&quality=80&tag=movie-backdrop&imageIndex=0`,
      blurhash: "movie-backdrop-hash",
    });
  });

  test("backdrop of an episode is its series' backdrop, and has no source without any image", () => {
    // Web: 5
    expect(
      pick(getItemImage({ api, item: episode, kind: "backdrop" })),
    ).toEqual({
      uri: `${base}/Items/series-1/Images/Backdrop?fillWidth=1000&quality=80&tag=series-backdrop&imageIndex=0`,
      blurhash: "series-backdrop-hash",
    });
    expect(getItemImage({ api, item: track, kind: "backdrop" })).toBeNull();
  });

  test("thumb asks the Thumb endpoint and has none for an episode", () => {
    expect(
      pick(
        getItemImage({
          api,
          item: full,
          kind: "thumb",
          width: 500,
          height: 281,
        }),
      ),
    ).toEqual({
      uri: `${base}/Items/movie-1/Images/Thumb?fillWidth=500&fillHeight=281&maxWidth=1920&maxHeight=1920&quality=90&tag=movie-thumb`,
      blurhash: "movie-thumb-hash",
    });
    expect(getItemImage({ api, item: episode, kind: "thumb" })).toBeNull();
  });

  test("parentBackdrop is the parent's, and null for a movie", () => {
    expect(
      getItemImage({ api, item: full, kind: "parentBackdrop" }),
    ).toBeNull();
    expect(
      getItemImage({ api, item: episode, kind: "parentBackdrop" })?.uri,
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=1000&quality=80&tag=series-backdrop&imageIndex=0`,
    );
  });

  test("logo is the item's own, then the parent's, else null", () => {
    expect(getItemImage({ api, item: full, kind: "logo" })?.uri).toBe(
      `${base}/Items/movie-1/Images/Logo?fillWidth=1000&quality=90&tag=movie-logo`,
    );
    expect(getItemImage({ api, item: episode, kind: "logo" })?.uri).toBe(
      `${base}/Items/series-1/Images/Logo?fillWidth=1000&quality=90&tag=series-logo`,
    );
    expect(getItemImage({ api, item: bare, kind: "logo" })).toBeNull();
  });

  test("album is the album's Primary of a track", () => {
    expect(getItemImage({ api, item: track, kind: "album" })?.uri).toBe(
      `${base}/Items/album-1/Images/Primary?fillWidth=1000&quality=90&tag=album-primary`,
    );
  });

  test("poster is the series' Primary of an episode, the item's own otherwise", () => {
    expect(getItemImage({ api, item: episode, kind: "poster" })?.uri).toBe(
      `${base}/Items/series-1/Images/Primary?fillWidth=1000&quality=90&tag=series-primary`,
    );
    expect(getItemImage({ api, item: full, kind: "poster" })?.uri).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=1000&quality=90&tag=movie-primary`,
    );
  });

  test("screenshot is null without one and sized to the box with one", () => {
    expect(getItemImage({ api, item: full, kind: "screenshot" })).toBeNull();
    expect(
      getItemImage({
        api,
        item: { ...full, ImageTags: { Screenshot: "shot" } },
        kind: "screenshot",
        width: 640,
        height: 360,
      })?.uri,
    ).toBe(
      `${base}/Items/movie-1/Images/Screenshot?fillWidth=640&fillHeight=360&maxWidth=1920&maxHeight=1920&quality=90&tag=shot`,
    );
  });
});
