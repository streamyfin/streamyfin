import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { PixelRatio } from "react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { getItemImageUrl, getItemImageUrlById } from "./getItemImageUrl";

const api = makeApi();
const base = api.basePath;

const onScreenDensity = (density: number) =>
  jest.spyOn(PixelRatio, "get").mockReturnValue(density);

// Sizes are layout points: pin the density the expectations are written for.
beforeEach(() => {
  onScreenDensity(2);
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
    expect(getItemImageUrl(api, movie, "primary", { width: 150 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90&tag=p`,
    );
  });

  test("a height alone asks for fillHeight", () => {
    // Web: 5
    expect(getItemImageUrl(api, movie, "primary", { height: 100 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillHeight=200&quality=90&tag=p`,
    );
  });

  test("both sides cover the box and bound the result", () => {
    // Web: 5
    expect(
      getItemImageUrl(api, movie, "primary", { width: 300, height: 450 }),
    ).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=600&fillHeight=900&maxWidth=1920&maxHeight=1920&quality=90&tag=p`,
    );
  });

  test("sizes are rounded up to the next step of 100 pixels", () => {
    expect(
      getItemImageUrl(api, movie, "primary", { width: 151, height: 401 }),
    ).toContain("fillWidth=400&fillHeight=900&");
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
    expect(getItemImageUrl(api, movie, "primary", { height: 1000 })).toContain(
      "fillHeight=2000&",
    );
  });
});

describe("getItemImageUrl backdrops", () => {
  test("adds imageIndex 0 to a Backdrop image", () => {
    expect(getItemImageUrl(api, movie, "backdrop", { width: 400 })).toBe(
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

const sizeOf = (url: string | null) => {
  const params = new URL(url ?? "").searchParams;
  return {
    fillWidth: params.get("fillWidth"),
    fillHeight: params.get("fillHeight"),
    maxWidth: params.get("maxWidth"),
    maxHeight: params.get("maxHeight"),
  };
};

describe("getItemImageUrl covering a box", () => {
  // Issue #2166: a 16:9 backdrop covering a header taller than 16:9 is bound
  // by its height. Asked for by width alone it came back a third as tall as
  // the header and was scaled up to cover it.
  test("a backdrop covers the whole box when given its height", () => {
    const url = getItemImageUrl(api, movie, "backdrop", {
      width: 600,
      height: 750,
    });

    expect(url).toContain("/Items/movie-1/Images/Backdrop?");
    expect(sizeOf(url)).toEqual({
      fillWidth: "1200",
      fillHeight: "1500",
      maxWidth: "1920",
      maxHeight: "1920",
    });
  });

  test("the Primary a backdrop falls to covers the box too", () => {
    const url = getItemImageUrl(
      api,
      {
        Id: "episode-1",
        Type: "Episode",
        ImageTags: { Primary: "p" },
        BackdropImageTags: [],
      },
      "backdrop",
      { width: 500, height: 585 },
    );

    expect(url).toContain("/Items/episode-1/Images/Primary?");
    expect(sizeOf(url)).toEqual({
      fillWidth: "1000",
      fillHeight: "1200",
      maxWidth: "1920",
      maxHeight: "1920",
    });
  });

  test("a parent backdrop covers the box, and a width alone stays a width", () => {
    const episode = {
      Id: "episode-1",
      Type: "Episode",
      ParentBackdropItemId: "series-1",
      ParentBackdropImageTags: ["series-backdrop-tag"],
    } satisfies BaseItemDto;

    const box = getItemImageUrl(api, episode, "parentBackdrop", {
      width: 500,
      height: 585,
    });
    expect(box).toContain("/Items/series-1/Images/Backdrop?");
    expect(sizeOf(box)).toEqual({
      fillWidth: "1000",
      fillHeight: "1200",
      maxWidth: "1920",
      maxHeight: "1920",
    });
    // Web: 5
    expect(
      getItemImageUrl(api, episode, "parentBackdrop", { width: 339 }),
    ).toBe(
      `${base}/Items/series-1/Images/Backdrop?fillWidth=700&quality=80&tag=series-backdrop-tag&imageIndex=0`,
    );
  });
});

describe("getItemImageUrl logos", () => {
  test("an episode gets its series' logo, sized and tagged", () => {
    const url = getItemImageUrl(
      api,
      {
        Id: "episode-1",
        Type: "Episode",
        ParentLogoItemId: "series-1",
        ParentLogoImageTag: "series-logo-tag",
      },
      "logo",
      { height: 130 },
    );

    expect(url).toContain("/Items/series-1/Images/Logo?");
    expect(new URL(url ?? "").searchParams.get("tag")).toBe("series-logo-tag");
    expect(sizeOf(url).fillHeight).toBe("300");
  });

  test("a fractional height rounds up to the next step", () => {
    expect(
      sizeOf(getItemImageUrl(api, movie, "logo", { height: 170.3 })).fillHeight,
    ).toBe("400");
  });

  test("a height of 0 is asked for as given", () => {
    expect(
      sizeOf(getItemImageUrl(api, movie, "logo", { height: 0 })).fillHeight,
    ).toBe("0");
  });

  test("an item without a logo has no URL", () => {
    expect(
      getItemImageUrl(api, { Id: "movie-2", Type: "Movie" }, "logo"),
    ).toBeNull();
  });
});

describe("getItemImageUrl people and answers that are not items", () => {
  test("a person's image is tagged with its PrimaryImageTag", () => {
    const person = {
      Id: "person-1",
      PrimaryImageTag: "person-tag",
    } satisfies BaseItemPerson;

    // Web: 5
    expect(getItemImageUrl(api, person, "primary", { width: 200 })).toBe(
      `${base}/Items/person-1/Images/Primary?fillWidth=400&quality=90&tag=person-tag`,
    );
  });

  test("a person without a tag has no image", () => {
    expect(getItemImageUrl(api, { Id: "person-1" }, "primary")).toBeNull();
  });

  // REACT-NATIVE-NY: a text answer reached the series page as its item, and
  // building the image threw "right operand of 'in' is not an object". An
  // object without an Id gave /Items/undefined/Images/Primary.
  test.each([
    ["a page", "<!doctype html><html></html>"],
    ["a number", 42],
    ["an object without an Id", { message: "Not found" }],
    ["a list", [{ Id: "movie-1" }]],
    ["a boxed string", new String("<!doctype html>")],
  ])("gives no image, without throwing, for %s", (_name, notAnItem) => {
    for (const kind of ["primary", "backdrop", "logo", "wide"] as const) {
      expect(
        getItemImageUrl(api, notAnItem as unknown as BaseItemDto, kind, {
          width: 100,
        }),
      ).toBeNull();
    }
  });
});

describe("getItemImageUrlById", () => {
  test("builds an untagged URL, sized like the entry point", () => {
    // Web: 5
    expect(getItemImageUrlById(api, "movie-1", "Primary", { width: 125 })).toBe(
      `${base}/Items/movie-1/Images/Primary?fillWidth=300&quality=90`,
    );
    // Web: 5
    expect(
      getItemImageUrlById(api, "movie-1", "Primary", {
        width: 300,
        height: 450,
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

describe("getItemImageUrl layout points", () => {
  // jellyfin-apiclient normalizeImageOptions multiplies the drawn size by the
  // device pixel ratio; here the entry point does it for every caller.
  test.each([
    [2, 118, "300"],
    [3, 118, "400"],
    [3, 100, "300"],
    [2, 100, "200"],
  ])(
    "a %ix screen asks for the pixels of a box %i points wide",
    (density, points, fillWidth) => {
      onScreenDensity(density);

      expect(
        sizeOf(getItemImageUrl(api, movie, "primary", { width: points })),
      ).toMatchObject({ fillWidth });
    },
  );

  test("boxes a few points apart share one request", () => {
    onScreenDensity(3);

    expect(getItemImageUrl(api, movie, "primary", { width: 113 })).toBe(
      getItemImageUrl(api, movie, "primary", { width: 126 }),
    );
  });

  test("converts both sides of a box, each to its own step", () => {
    onScreenDensity(3);

    expect(
      sizeOf(
        getItemImageUrl(api, movie, "primary", { width: 118, height: 66 }),
      ),
    ).toMatchObject({ fillWidth: "400", fillHeight: "200" });
  });

  test("caps the logo height after converting and rounding", () => {
    onScreenDensity(3);

    expect(
      sizeOf(getItemImageUrl(api, movie, "logo", { height: 130 })).fillHeight,
    ).toBe("400");
    expect(
      sizeOf(getItemImageUrl(api, movie, "logo", { height: 300 })).fillHeight,
    ).toBe("600");
  });

  test("bounds a cover fit request at the longest side in pixels", () => {
    onScreenDensity(3);

    expect(
      sizeOf(
        getItemImageUrl(api, movie, "backdrop", { width: 400, height: 800 }),
      ),
    ).toEqual({
      fillWidth: "1200",
      fillHeight: "2400",
      maxWidth: "1920",
      maxHeight: "1920",
    });
  });

  test("the id entry point converts the same way", () => {
    onScreenDensity(3);

    expect(
      sizeOf(getItemImageUrlById(api, "movie-1", "Primary", { width: 118 })),
    ).toMatchObject({ fillWidth: "400" });
  });
});

describe("getItemImageUrl pixels", () => {
  test("takes the sizes as physical pixels, converting nothing", () => {
    onScreenDensity(3);

    expect(
      sizeOf(
        getItemImageUrl(api, movie, "primary", { width: 500, pixels: true }),
      ),
    ).toMatchObject({ fillWidth: "500" });
  });

  test("still rounds up to the next step", () => {
    onScreenDensity(3);

    expect(
      sizeOf(
        getItemImageUrl(api, movie, "primary", {
          width: 512,
          height: 512,
          pixels: true,
        }),
      ),
    ).toMatchObject({ fillWidth: "600", fillHeight: "600" });
    expect(
      sizeOf(
        getItemImageUrlById(api, "movie-1", "Primary", {
          width: 500,
          pixels: true,
        }),
      ),
    ).toMatchObject({ fillWidth: "500" });
  });

  test("keeps the logo cap", () => {
    expect(
      sizeOf(
        getItemImageUrl(api, movie, "logo", { height: 2000, pixels: true }),
      ).fillHeight,
    ).toBe("600");
  });
});

describe("getItemImageUrl without a size", () => {
  test("sends no size params, whatever the density", () => {
    onScreenDensity(3);

    expect(getItemImageUrl(api, movie, "primary")).toBe(
      `${base}/Items/movie-1/Images/Primary?quality=90&tag=p`,
    );
    expect(getItemImageUrl(api, movie, "primary", { pixels: true })).toBe(
      `${base}/Items/movie-1/Images/Primary?quality=90&tag=p`,
    );
  });
});
