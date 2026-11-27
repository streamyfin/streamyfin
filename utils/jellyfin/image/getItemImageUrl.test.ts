import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getItemImageUrl, getItemImageUrlById } from "./getItemImageUrl";

const api = makeApi();
const base = api.basePath;

const movie = {
  Id: "movie-1",
  Type: "Movie",
  ImageTags: { Primary: "p", Logo: "l" },
  BackdropImageTags: ["b"],
  ParentBackdropItemId: "series-1",
  ParentBackdropImageTags: ["pb"],
} satisfies BaseItemDto;

describe("getItemImageUrl sizing", () => {
  test("a width alone asks for fillWidth", () => {
    // Web: 5
    expect(getItemImageUrl(api, movie, "primary", { width: 300 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=p`,
    );
  });

  test("a height alone asks for fillHeight", () => {
    // Web: 5
    expect(getItemImageUrl(api, movie, "primary", { height: 200 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillHeight=200&quality=90&tag=p`,
    );
  });

  test("both sides cover the box and bound the result", () => {
    // Web: 5
    expect(
      getItemImageUrl(api, movie, "primary", { width: 600, height: 900 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90&tag=p`,
    );
  });

  test("sizes are rounded to whole pixels", () => {
    expect(
      getItemImageUrl(api, movie, "primary", { width: 599.6, height: 899.4 }),
    ).toContain("fillWidth=600&fillHeight=899&");
  });

  test("no size asks for none", () => {
    // Web: 5
    expect(getItemImageUrl(api, movie, "primary")).toBe(
      `${base}/Items/movie-1/Images/Primary?quality=90&tag=p`,
    );
  });
});

describe("getItemImageUrl quality", () => {
  // Web: jellyfin-apiclient sends 80 for a Backdrop and 90 for every other type
  test.each([
    ["primary", "Primary", 90],
    ["thumb", "Thumb", 90],
    ["logo", "Logo", 90],
    ["parentBackdrop", "Backdrop", 80],
  ] as const)("a %s request is %s quality %i", (kind, type, quality) => {
    const item = {
      ...movie,
      ImageTags: { Primary: "p", Thumb: "t", Logo: "l" },
    };
    const url = getItemImageUrl(api, item, kind);
    expect(url).toContain(`/Images/${type}?`);
    expect(url).toContain(`quality=${quality}`);
  });

  test("a backdrop kind that falls to the Primary is 90", () => {
    expect(
      getItemImageUrl(
        api,
        { ...movie, BackdropImageTags: [], ParentBackdropImageTags: [] },
        "backdrop",
      ),
    ).toContain("quality=90");
  });

  test("a backdrop kind that resolves a Backdrop is 80", () => {
    expect(getItemImageUrl(api, movie, "backdrop")).toContain("quality=80");
  });

  test("the caller cannot override it", () => {
    expect(
      getItemImageUrl(api, movie, "primary", {
        quality: 55,
      } as never),
    ).toContain("quality=90");
  });
});

describe("getItemImageUrl logo height", () => {
  test("caps the height at the tallest logo the app asks for", () => {
    expect(getItemImageUrl(api, movie, "logo", { height: 2000 })).toContain(
      "fillHeight=600&",
    );
  });

  test("leaves the height of another kind alone", () => {
    expect(getItemImageUrl(api, movie, "primary", { height: 2000 })).toContain(
      "fillHeight=2000&",
    );
  });
});

describe("getItemImageUrl backdrops", () => {
  test("adds imageIndex 0 to a Backdrop image", () => {
    expect(getItemImageUrl(api, movie, "backdrop", { width: 800 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?fillWidth=800&quality=80&tag=b&imageIndex=0`,
    );
  });

  test("adds none to a Primary image of the backdrop kind", () => {
    expect(
      getItemImageUrl(
        api,
        { ...movie, BackdropImageTags: [], ParentBackdropImageTags: [] },
        "backdrop",
      ),
    ).not.toContain("imageIndex");
  });
});

describe("getItemImageUrl nulls", () => {
  test("returns null without an api", () => {
    expect(getItemImageUrl(null, movie, "primary")).toBeNull();
    expect(getItemImageUrl(undefined, movie, "primary")).toBeNull();
  });

  test("returns null without an item", () => {
    expect(getItemImageUrl(api, null, "primary")).toBeNull();
  });

  test("returns null, never an untagged URL, when nothing resolves", () => {
    expect(
      getItemImageUrl(api, { Id: "x", ImageTags: {} }, "primary"),
    ).toBeNull();
    expect(getItemImageUrl(api, movie, "screenshot")).toBeNull();
  });

  test("returns null for an item without an Id", () => {
    expect(
      getItemImageUrl(api, { ...movie, Id: undefined }, "primary"),
    ).toBeNull();
  });
});

describe("getItemImageUrl episodes", () => {
  const episode = {
    Id: "episode-1",
    Type: "Episode",
    ImageTags: { Primary: "ep" },
    SeriesId: "series-1",
    SeriesThumbImageTag: "sth",
    ParentThumbItemId: "series-1",
    ParentThumbImageTag: "st",
  } satisfies BaseItemDto;

  test("wide uses the series Thumb, or the episode's own with preferEpisodeImage", () => {
    expect(getItemImageUrl(api, episode, "wide", { height: 200 })).toContain(
      "/Items/series-1/Images/Thumb?",
    );
    expect(
      getItemImageUrl(api, episode, "wide", {
        height: 200,
        preferEpisodeImage: true,
      }),
    ).toContain("/Items/episode-1/Images/Primary?");
  });
});

describe("getItemImageUrlById", () => {
  test("builds an untagged URL, sized like the entry point", () => {
    // Web: 5
    expect(getItemImageUrlById(api, "movie-1", "Primary", { width: 250 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=250&quality=90`,
    );
    // Web: 5
    expect(
      getItemImageUrlById(api, "movie-1", "Primary", {
        width: 600,
        height: 900,
      }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90`,
    );
  });

  // Web: jellyfin-apiclient sends 80 for a Backdrop and 90 for every other type
  test.each([
    ["Primary", 90],
    ["Thumb", 90],
    ["Logo", 90],
    ["Backdrop", 80],
  ] as const)("a %s is quality %i", (type, quality) => {
    expect(getItemImageUrlById(api, "movie-1", type)).toContain(
      `quality=${quality}`,
    );
  });

  test("adds imageIndex 0 to a Backdrop", () => {
    expect(getItemImageUrlById(api, "movie-1", "Backdrop")).toBe(
      `${base}/Items/movie-1/Images/Backdrop?quality=80&imageIndex=0`,
    );
  });

  test("returns null without an api or an id", () => {
    expect(getItemImageUrlById(null, "movie-1", "Primary")).toBeNull();
    expect(getItemImageUrlById(api, null, "Primary")).toBeNull();
    expect(getItemImageUrlById(api, "", "Primary")).toBeNull();
  });
});
