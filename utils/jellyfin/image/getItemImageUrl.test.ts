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
} satisfies BaseItemDto;

describe("getItemImageUrl sizing", () => {
  test("a width alone asks for fillWidth", () => {
    expect(getItemImageUrl(api, movie, "primary", { width: 300 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=80&tag=p`,
    );
  });

  test("a height alone asks for fillHeight", () => {
    expect(getItemImageUrl(api, movie, "primary", { height: 200 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillHeight=200&quality=80&tag=p`,
    );
  });

  test("both sides cover the box and bound the result", () => {
    expect(
      getItemImageUrl(api, movie, "primary", { width: 600, height: 900 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=80&tag=p`,
    );
  });

  test("sizes are rounded to whole pixels", () => {
    expect(
      getItemImageUrl(api, movie, "primary", { width: 599.6, height: 899.4 }),
    ).toContain("fillWidth=600&fillHeight=899&");
  });

  test("no size asks for none", () => {
    expect(getItemImageUrl(api, movie, "primary")).toBe(
      `${base}/Items/movie-1/Images/Primary?quality=80&tag=p`,
    );
  });
});

describe("getItemImageUrl quality", () => {
  test("defaults to 80", () => {
    expect(getItemImageUrl(api, movie, "primary")).toContain("quality=80");
  });

  test("passes a given quality through", () => {
    expect(getItemImageUrl(api, movie, "primary", { quality: 55 })).toContain(
      "quality=55",
    );
  });

  test("a logo defaults to 90", () => {
    expect(getItemImageUrl(api, movie, "logo", { height: 100 })).toBe(
      `${base}/Items/movie-1/Images/Logo?fillHeight=100&quality=90&tag=l`,
    );
  });

  test("a logo takes a given quality", () => {
    expect(
      getItemImageUrl(api, movie, "logo", { height: 100, quality: 70 }),
    ).toContain("quality=70");
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
    expect(getItemImageUrl(api, movie, "heroBackdrop", { width: 800 })).toBe(
      `${base}/Items/movie-1/Images/Backdrop?fillWidth=800&quality=80&tag=b&imageIndex=0`,
    );
  });

  test("adds none to a Primary image of the backdrop kind", () => {
    expect(
      getItemImageUrl(api, { ...movie, BackdropImageTags: [] }, "backdrop"),
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
    expect(getItemImageUrlById(api, "movie-1", "Primary", { width: 250 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=250&quality=80`,
    );
    expect(
      getItemImageUrlById(api, "movie-1", "Primary", {
        width: 600,
        height: 900,
        quality: 60,
      }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=60`,
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
