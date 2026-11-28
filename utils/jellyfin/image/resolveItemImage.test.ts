import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  IMAGE_KINDS,
  type ImageKind,
  resolveItemImage,
} from "./resolveItemImage";

const full = {
  Id: "item",
  Type: "Movie",
  ImageTags: {
    Primary: "primary",
    Thumb: "thumb",
    Logo: "logo",
  },
  BackdropImageTags: ["backdrop", "backdrop-2"],
  SeriesId: "series",
  SeriesPrimaryImageTag: "series-primary",
  SeriesThumbImageTag: "series-thumb",
  ParentThumbItemId: "thumb-owner",
  ParentThumbImageTag: "parent-thumb",
  ParentBackdropItemId: "backdrop-owner",
  ParentBackdropImageTags: ["parent-backdrop"],
  ParentLogoItemId: "logo-owner",
  ParentLogoImageTag: "parent-logo",
  ParentId: "parent",
  SeasonId: "season",
  ParentPrimaryImageItemId: "parent-primary-owner",
  ParentPrimaryImageTag: "parent-primary",
  AlbumId: "album",
  AlbumPrimaryImageTag: "album-primary",
} satisfies BaseItemDto;

const episode = { ...full, Type: "Episode" } satisfies BaseItemDto;

describe("resolveItemImage steps", () => {
  test("returns null for a missing item", () => {
    expect(resolveItemImage(null, "primary")).toBeNull();
    expect(resolveItemImage(undefined, "primary")).toBeNull();
  });

  test.each([
    ["primary", "primary", "item", "Primary", "primary"],
    ["thumb", "thumb", "item", "Thumb", "thumb"],
    ["backdrop", "backdrop", "item", "Backdrop", "backdrop"],
    ["logo", "logo", "item", "Logo", "logo"],
    [
      "parentBackdrop",
      "parentBackdrop",
      "backdrop-owner",
      "Backdrop",
      "parent-backdrop",
    ],
  ] as const)(
    "%s reads its own id and tag",
    (_step, kind, itemId, type, tag) => {
      expect(resolveItemImage(full, kind)).toEqual({ itemId, type, tag });
    },
  );

  test("the backdrop step takes the first of the tags", () => {
    expect(resolveItemImage(full, "backdrop")?.tag).toBe("backdrop");
  });

  test("seriesPrimary reads the series and its tag", () => {
    expect(resolveItemImage(episode, "poster")).toEqual({
      itemId: "series",
      type: "Primary",
      tag: "series-primary",
    });
  });

  test("parentPrimary reads the owner of the parent's Primary tag", () => {
    expect(resolveItemImage(episode, "seasonPoster")).toEqual({
      itemId: "parent-primary-owner",
      type: "Primary",
      tag: "parent-primary",
    });
  });

  test("seriesThumb reads the series and its Thumb tag", () => {
    expect(resolveItemImage({ ...episode, ImageTags: {} }, "wide")).toEqual({
      itemId: "series",
      type: "Thumb",
      tag: "series-thumb",
    });
  });

  test("parentThumb reads the owner of the Thumb, not of the backdrop", () => {
    expect(
      resolveItemImage(
        { ...episode, ImageTags: {}, SeriesThumbImageTag: undefined },
        "wide",
      ),
    ).toEqual({
      itemId: "thumb-owner",
      type: "Thumb",
      tag: "parent-thumb",
    });
  });

  test("parentLogo reads its own pair", () => {
    expect(resolveItemImage({ ...full, ImageTags: {} }, "logo")).toEqual({
      itemId: "logo-owner",
      type: "Logo",
      tag: "parent-logo",
    });
  });

  test("albumPrimary reads the album", () => {
    expect(resolveItemImage(full, "album")).toEqual({
      itemId: "album",
      type: "Primary",
      tag: "album-primary",
    });
  });

  test("parentPrimary reads ParentPrimaryImageItemId and a plain string tag", () => {
    expect(resolveItemImage({ ...full, AlbumId: undefined }, "album")).toEqual({
      itemId: "parent-primary-owner",
      type: "Primary",
      tag: "parent-primary",
    });
  });

  test("a person's Primary is its PrimaryImageTag", () => {
    expect(
      resolveItemImage(
        { Id: "person", PrimaryImageTag: "person-tag" },
        "primary",
      ),
    ).toEqual({ itemId: "person", type: "Primary", tag: "person-tag" });
  });

  test("an object that is not an item has no image", () => {
    expect(
      resolveItemImage("<!doctype html>" as unknown as BaseItemDto, "primary"),
    ).toBeNull();
  });
});

describe("resolveItemImage half pairs", () => {
  test.each<[ImageKind, Partial<BaseItemDto>]>([
    ["primary", { Id: undefined }],
    ["primary", { ImageTags: {} }],
    ["thumb", { Id: undefined }],
    ["thumb", { ImageTags: {} }],
    ["logo", { Id: undefined, ParentLogoItemId: undefined }],
    ["logo", { ImageTags: {}, ParentLogoImageTag: undefined }],
    ["parentBackdrop", { ParentBackdropItemId: undefined }],
    ["parentBackdrop", { ParentBackdropImageTags: [] }],
  ])("%s gives null for %j", (kind, patch) => {
    expect(resolveItemImage({ ...full, ...patch }, kind)).toBeNull();
  });

  test.each([{ SeriesId: undefined }, { SeriesPrimaryImageTag: undefined }])(
    "an episode poster skips the series step for %j",
    (patch) => {
      expect(resolveItemImage({ ...episode, ...patch }, "poster")?.itemId).toBe(
        "item",
      );
    },
  );

  test.each([
    { ParentPrimaryImageItemId: undefined },
    { ParentPrimaryImageTag: undefined },
  ])("an episode season poster skips the parent step for %j", (patch) => {
    expect(
      resolveItemImage({ ...episode, ...patch }, "seasonPoster")?.itemId,
    ).toBe("series");
  });

  test.each([{ SeriesId: undefined }, { SeriesThumbImageTag: undefined }])(
    "an episode's wide image skips a half series Thumb pair for %j",
    (patch) => {
      expect(resolveItemImage({ ...episode, ...patch }, "wide")).toEqual({
        itemId: "thumb-owner",
        type: "Thumb",
        tag: "parent-thumb",
      });
    },
  );

  test.each([
    { ParentThumbItemId: undefined },
    { ParentThumbImageTag: undefined },
  ])(
    "an episode's wide image skips a half parent Thumb pair for %j",
    (patch) => {
      expect(
        resolveItemImage(
          { ...episode, SeriesThumbImageTag: undefined, ...patch },
          "wide",
        ),
      ).toEqual({
        itemId: "backdrop-owner",
        type: "Backdrop",
        tag: "parent-backdrop",
      });
    },
  );

  test.each([{ AlbumId: undefined }, { AlbumPrimaryImageTag: undefined }])(
    "an album skips a half album pair for %j",
    (patch) => {
      expect(resolveItemImage({ ...full, ...patch }, "album")?.itemId).toBe(
        "parent-primary-owner",
      );
    },
  );

  test.each([
    { ParentPrimaryImageItemId: undefined },
    { ParentPrimaryImageTag: undefined },
  ])("an album skips a half parent Primary pair for %j", (patch) => {
    expect(
      resolveItemImage({ ...full, AlbumId: undefined, ...patch }, "album")
        ?.itemId,
    ).toBe("item");
  });

  test("parentPrimary never falls back to ParentId", () => {
    // ParentId is set, but its tag is paired with ParentPrimaryImageItemId.
    expect(
      resolveItemImage(
        {
          ...full,
          AlbumId: undefined,
          ParentPrimaryImageItemId: undefined,
          ImageTags: {},
        },
        "album",
      ),
    ).toBeNull();
  });
});

describe("resolveItemImage kinds", () => {
  const typeAndOwner = (
    item: BaseItemDto,
    kind: ImageKind,
    preferEpisodeImage = false,
  ) => {
    const ref = resolveItemImage(item, kind, { preferEpisodeImage });
    return ref && `${ref.itemId}:${ref.type}`;
  };

  test("lists every kind in one table", () => {
    expect(Object.keys(IMAGE_KINDS).sort()).toEqual(
      [
        "album",
        "backdrop",
        "logo",
        "parentBackdrop",
        "poster",
        "primary",
        "seasonPoster",
        "seasonPrimary",
        "seriesPrimary",
        "thumb",
        "wide",
      ].sort(),
    );
  });

  test("primary is the item's own Primary, for an episode too", () => {
    expect(typeAndOwner(full, "primary")).toBe("item:Primary");
    expect(typeAndOwner(episode, "primary")).toBe("item:Primary");
  });

  test("poster is the series' Primary for an episode, the item's otherwise", () => {
    expect(typeAndOwner(episode, "poster")).toBe("series:Primary");
    expect(typeAndOwner(full, "poster")).toBe("item:Primary");
  });

  test("poster falls to the episode's own Primary without the series pair", () => {
    expect(
      typeAndOwner({ ...episode, SeriesPrimaryImageTag: undefined }, "poster"),
    ).toBe("item:Primary");
  });

  test("seasonPoster is the parent's Primary, then the series', then the episode's own", () => {
    expect(typeAndOwner(episode, "seasonPoster")).toBe(
      "parent-primary-owner:Primary",
    );
    expect(
      typeAndOwner(
        { ...episode, ParentPrimaryImageTag: undefined },
        "seasonPoster",
      ),
    ).toBe("series:Primary");
    expect(
      typeAndOwner(
        {
          ...episode,
          ParentPrimaryImageTag: undefined,
          SeriesPrimaryImageTag: undefined,
        },
        "seasonPoster",
      ),
    ).toBe("item:Primary");
  });

  test("seasonPoster is the item's own Primary for an item that is no episode", () => {
    expect(typeAndOwner(full, "seasonPoster")).toBe("item:Primary");
  });

  test.each(["poster", "seasonPoster"] as const)(
    "%s of a season is its own Primary, else the series'",
    (kind) => {
      const season = {
        Id: "season",
        Type: "Season",
        ImageTags: { Primary: "season-p" },
        SeriesId: "series",
        SeriesPrimaryImageTag: "series-tag",
      } satisfies BaseItemDto;
      const noOwn = { ...season, ImageTags: {} };

      expect(resolveItemImage(season, kind)).toEqual({
        itemId: "season",
        type: "Primary",
        tag: "season-p",
      });
      expect(resolveItemImage(noOwn, kind)).toEqual({
        itemId: "series",
        type: "Primary",
        tag: "series-tag",
      });
      expect(
        resolveItemImage({ ...noOwn, SeriesId: undefined }, kind),
      ).toBeNull();
      expect(
        resolveItemImage({ ...noOwn, SeriesPrimaryImageTag: undefined }, kind),
      ).toBeNull();
    },
  );

  test("primary of a season without its own is null, not the series'", () => {
    expect(
      resolveItemImage(
        {
          Id: "season",
          Type: "Season",
          ImageTags: {},
          SeriesId: "series",
          SeriesPrimaryImageTag: "series-tag",
        },
        "primary",
      ),
    ).toBeNull();
  });

  test("wide is Thumb, backdrop, then Primary for an item that is no episode", () => {
    const noThumbs = {
      ...full,
      ImageTags: { Primary: "p" },
      SeriesThumbImageTag: undefined,
    };
    expect(typeAndOwner(noThumbs, "wide")).toBe("item:Backdrop");
    expect(typeAndOwner({ ...noThumbs, BackdropImageTags: [] }, "wide")).toBe(
      "item:Primary",
    );
  });

  // A season carries its series' Thumb, and jellyfin-web draws it before any
  // backdrop.
  test("wide is the series Thumb before a backdrop for an item that is no episode", () => {
    const season = {
      ...full,
      Type: "Season",
      ImageTags: { Primary: "p" },
    } satisfies BaseItemDto;
    expect(typeAndOwner(season, "wide")).toBe("series:Thumb");
    expect(
      typeAndOwner({ ...season, SeriesThumbImageTag: undefined }, "wide"),
    ).toBe("item:Backdrop");
  });

  test("wide is series Thumb, parent Thumb, parent backdrop, then the episode's own landscape art and still", () => {
    expect(typeAndOwner(episode, "wide")).toBe("series:Thumb");
    const noSeriesThumb = { ...episode, SeriesThumbImageTag: undefined };
    expect(typeAndOwner(noSeriesThumb, "wide")).toBe("thumb-owner:Thumb");
    const noThumbs = { ...noSeriesThumb, ParentThumbImageTag: undefined };
    expect(typeAndOwner(noThumbs, "wide")).toBe("backdrop-owner:Backdrop");
    const noInherited = { ...noThumbs, ParentBackdropImageTags: [] };
    expect(typeAndOwner(noInherited, "wide")).toBe("item:Thumb");
    expect(
      typeAndOwner({ ...noInherited, ImageTags: { Primary: "p" } }, "wide"),
    ).toBe("item:Backdrop");
    expect(
      typeAndOwner(
        {
          ...noInherited,
          ImageTags: { Primary: "p" },
          BackdropImageTags: [],
        },
        "wide",
      ),
    ).toBe("item:Primary");
  });

  // A landscape card never picks an episode still while the episode has real
  // landscape art — inherited or its own. Series-first is app policy.
  test("wide keeps an episode's own landscape art before its still", () => {
    const withThumb = {
      Id: "ep",
      Type: "Episode",
      ImageTags: { Thumb: "thumb" },
    } satisfies BaseItemDto;
    const withBackdrop = {
      Id: "ep",
      Type: "Episode",
      BackdropImageTags: ["backdrop"],
    } satisfies BaseItemDto;

    for (const preferEpisodeImage of [false, true]) {
      expect(
        resolveItemImage(withThumb, "wide", { preferEpisodeImage }),
      ).toEqual({ itemId: "ep", type: "Thumb", tag: "thumb" });
      expect(
        resolveItemImage(withBackdrop, "wide", { preferEpisodeImage }),
      ).toEqual({ itemId: "ep", type: "Backdrop", tag: "backdrop" });
    }
  });

  test("wide takes an episode's still over its landscape art only with preferEpisodeImage", () => {
    const withThumb = {
      Id: "ep",
      Type: "Episode",
      ImageTags: { Primary: "still", Thumb: "thumb" },
    } satisfies BaseItemDto;
    const withBackdrop = {
      Id: "ep",
      Type: "Episode",
      ImageTags: { Primary: "still" },
      BackdropImageTags: ["backdrop"],
    } satisfies BaseItemDto;

    expect(resolveItemImage(withThumb, "wide")).toEqual({
      itemId: "ep",
      type: "Thumb",
      tag: "thumb",
    });
    expect(resolveItemImage(withBackdrop, "wide")).toEqual({
      itemId: "ep",
      type: "Backdrop",
      tag: "backdrop",
    });
    for (const ep of [withThumb, withBackdrop]) {
      expect(
        resolveItemImage(ep, "wide", { preferEpisodeImage: true }),
      ).toEqual({ itemId: "ep", type: "Primary", tag: "still" });
    }
  });

  test("wide with preferEpisodeImage is the still, inherited landscape art, then the episode's own", () => {
    expect(typeAndOwner(episode, "wide", true)).toBe("item:Primary");
    const own = { ...episode, ImageTags: {} };
    expect(typeAndOwner(own, "wide", true)).toBe("series:Thumb");
    const noSeriesThumb = { ...own, SeriesThumbImageTag: undefined };
    expect(typeAndOwner(noSeriesThumb, "wide", true)).toBe("thumb-owner:Thumb");
    const noThumbs = { ...noSeriesThumb, ParentThumbImageTag: undefined };
    expect(typeAndOwner(noThumbs, "wide", true)).toBe(
      "backdrop-owner:Backdrop",
    );
    const noInherited = { ...noThumbs, ParentBackdropImageTags: [] };
    expect(typeAndOwner(noInherited, "wide", true)).toBe("item:Backdrop");
    expect(
      typeAndOwner({ ...noInherited, BackdropImageTags: [] }, "wide", true),
    ).toBeNull();
  });

  test("preferEpisodeImage changes nothing for an item that is no episode", () => {
    expect(typeAndOwner(full, "wide", true)).toBe("item:Thumb");
  });

  test("backdrop is the item's backdrop, the parent's, then its Primary, episode or not", () => {
    for (const item of [full, episode]) {
      expect(typeAndOwner(item, "backdrop")).toBe("item:Backdrop");
      const own = { ...item, BackdropImageTags: [] };
      expect(typeAndOwner(own, "backdrop")).toBe("backdrop-owner:Backdrop");
      expect(
        typeAndOwner({ ...own, ParentBackdropImageTags: [] }, "backdrop"),
      ).toBe("item:Primary");
    }
  });

  test("logo is the item's own, then the parent's", () => {
    expect(typeAndOwner(full, "logo")).toBe("item:Logo");
    expect(typeAndOwner({ ...episode, ImageTags: {} }, "logo")).toBe(
      "logo-owner:Logo",
    );
  });

  test("album is the album's Primary, the parent's, then the item's", () => {
    expect(typeAndOwner(full, "album")).toBe("album:Primary");
    expect(typeAndOwner({ ...full, AlbumId: undefined }, "album")).toBe(
      "parent-primary-owner:Primary",
    );
    expect(
      typeAndOwner(
        { ...full, AlbumId: undefined, ParentPrimaryImageItemId: undefined },
        "album",
      ),
    ).toBe("item:Primary");
  });

  // An episode's Thumb hangs on its series or season, as jellyfin-web's
  // preferThumb chain reads it.
  test("thumb is an episode's own, the series', then the parent's", () => {
    expect(typeAndOwner(episode, "thumb")).toBe("item:Thumb");
    const noOwn = { ...episode, ImageTags: {} };
    expect(typeAndOwner(noOwn, "thumb")).toBe("series:Thumb");
    expect(
      typeAndOwner({ ...noOwn, SeriesThumbImageTag: undefined }, "thumb"),
    ).toBe("thumb-owner:Thumb");
  });

  test("parentBackdrop and thumb have no fallback", () => {
    const bare = { Id: "item", ImageTags: {}, BackdropImageTags: [] };
    expect(typeAndOwner(bare, "parentBackdrop")).toBeNull();
    expect(
      typeAndOwner({ ...bare, ImageTags: { Primary: "p" } }, "thumb"),
    ).toBeNull();
  });
});

describe("resolveItemImage related posters", () => {
  const related = {
    Id: "episode",
    Type: "Episode",
    ImageTags: { Primary: "still" },
    ParentId: "parent",
    SeasonId: "season",
    SeriesId: "series",
    SeriesPrimaryImageTag: "series-v1",
    ParentPrimaryImageItemId: "season",
    ParentPrimaryImageTag: "season-tag",
  } satisfies BaseItemDto;

  test("seriesPrimary is the series' own tagged Primary", () => {
    expect(resolveItemImage(related, "seriesPrimary")).toEqual({
      itemId: "series",
      type: "Primary",
      tag: "series-v1",
    });
  });

  test.each([{ SeriesId: undefined }, { SeriesPrimaryImageTag: undefined }])(
    "seriesPrimary has no fallback for half a pair: %j",
    (patch) => {
      // The episode still is not the series poster.
      expect(
        resolveItemImage({ ...related, ...patch }, "seriesPrimary"),
      ).toBeNull();
    },
  );

  test("seasonPrimary is the season's Primary when the parent tag belongs to it", () => {
    expect(resolveItemImage(related, "seasonPrimary")).toEqual({
      itemId: "season",
      type: "Primary",
      tag: "season-tag",
    });
  });

  // The ParentPrimary pair can point at the series or the parent rather than
  // the season; reusing its tag for the season would serve the wrong picture.
  test.each(["series", "parent", undefined] as const)(
    "seasonPrimary is null when the parent Primary's owner is %s",
    (owner) => {
      expect(
        resolveItemImage(
          { ...related, ParentPrimaryImageItemId: owner },
          "seasonPrimary",
        ),
      ).toBeNull();
    },
  );

  test("seasonPrimary is null without the tag", () => {
    expect(
      resolveItemImage(
        { ...related, ParentPrimaryImageTag: undefined },
        "seasonPrimary",
      ),
    ).toBeNull();
  });

  test("seasonPrimary reads ParentId as the season id when SeasonId is missing", () => {
    expect(
      resolveItemImage(
        {
          ...related,
          SeasonId: undefined,
          ParentPrimaryImageItemId: "parent",
        },
        "seasonPrimary",
      ),
    ).toEqual({ itemId: "parent", type: "Primary", tag: "season-tag" });
  });
});

describe("resolveItemImage blurhash", () => {
  test("reads the hash keyed by the image type and tag", () => {
    expect(
      resolveItemImage(
        { ...full, ImageBlurHashes: { Primary: { primary: "hash" } } },
        "primary",
      )?.blurhash,
    ).toBe("hash");
  });

  test("reads the hash of a parent image the child lists", () => {
    expect(
      resolveItemImage(
        {
          ...episode,
          BackdropImageTags: [],
          ImageBlurHashes: { Backdrop: { "parent-backdrop": "parent-hash" } },
        },
        "backdrop",
      )?.blurhash,
    ).toBe("parent-hash");
  });

  test("leaves the hash out when there is none", () => {
    expect(resolveItemImage(full, "primary")).not.toHaveProperty("blurhash");
  });
});
