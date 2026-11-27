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
    Screenshot: "shot",
  },
  BackdropImageTags: ["backdrop", "backdrop-2"],
  SeriesId: "series",
  SeriesPrimaryImageTag: "series-primary",
  ParentThumbItemId: "thumb-owner",
  ParentThumbImageTag: "parent-thumb",
  ParentBackdropItemId: "backdrop-owner",
  ParentBackdropImageTags: ["parent-backdrop"],
  ParentLogoItemId: "logo-owner",
  ParentLogoImageTag: "parent-logo",
  ParentId: "parent",
  SeasonId: "season",
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
    ["backdrop", "heroBackdrop", "item", "Backdrop", "backdrop"],
    ["logo", "logo", "item", "Logo", "logo"],
    ["screenshot", "screenshot", "item", "Screenshot", "shot"],
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
    expect(resolveItemImage(full, "heroBackdrop")?.tag).toBe("backdrop");
  });

  test("seriesPrimary reads the series and its tag", () => {
    expect(resolveItemImage(episode, "poster")).toEqual({
      itemId: "series",
      type: "Primary",
      tag: "series-primary",
    });
  });

  test("seasonPrimary reads the season and the parent's Primary tag", () => {
    expect(resolveItemImage(episode, "seasonPoster")).toEqual({
      itemId: "season",
      type: "Primary",
      tag: "parent-primary",
    });
  });

  test("parentThumb reads the owner of the Thumb, not of the backdrop", () => {
    expect(resolveItemImage({ ...episode, ImageTags: {} }, "wide")).toEqual({
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

  test("parentPrimary reads ParentId and a plain string tag", () => {
    expect(resolveItemImage({ ...full, AlbumId: undefined }, "album")).toEqual({
      itemId: "parent",
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
    ["heroBackdrop", { Id: undefined }],
    ["heroBackdrop", { BackdropImageTags: [] }],
    ["logo", { Id: undefined, ParentLogoItemId: undefined }],
    ["logo", { ImageTags: {}, ParentLogoImageTag: undefined }],
    ["screenshot", { Id: undefined }],
    ["screenshot", { ImageTags: {} }],
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

  test.each([{ SeasonId: undefined }, { ParentPrimaryImageTag: undefined }])(
    "an episode season poster skips the season step for %j",
    (patch) => {
      expect(
        resolveItemImage({ ...episode, ...patch }, "seasonPoster")?.itemId,
      ).toBe("series");
    },
  );

  test.each([
    { ParentThumbItemId: undefined },
    { ParentThumbImageTag: undefined },
  ])("an episode's wide image skips a half Thumb pair for %j", (patch) => {
    expect(resolveItemImage({ ...episode, ...patch }, "wide")).toEqual({
      itemId: "backdrop-owner",
      type: "Backdrop",
      tag: "parent-backdrop",
    });
  });

  test.each([{ AlbumId: undefined }, { AlbumPrimaryImageTag: undefined }])(
    "an album skips a half album pair for %j",
    (patch) => {
      expect(resolveItemImage({ ...full, ...patch }, "album")?.itemId).toBe(
        "parent",
      );
    },
  );

  test("an album skips a half ParentId pair", () => {
    expect(
      resolveItemImage(
        { ...full, AlbumId: undefined, ParentPrimaryImageTag: undefined },
        "album",
      )?.itemId,
    ).toBe("item");
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
        "heroBackdrop",
        "logo",
        "parentBackdrop",
        "poster",
        "primary",
        "screenshot",
        "seasonPoster",
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

  test("seasonPoster is the season's Primary, then the series', then the episode's own", () => {
    expect(typeAndOwner(episode, "seasonPoster")).toBe("season:Primary");
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

  test("wide is Thumb then Primary for an item that is no episode", () => {
    expect(typeAndOwner(full, "wide")).toBe("item:Thumb");
    expect(typeAndOwner({ ...full, ImageTags: { Primary: "p" } }, "wide")).toBe(
      "item:Primary",
    );
  });

  test("wide is parent Thumb, parent backdrop, then Primary for an episode", () => {
    expect(typeAndOwner(episode, "wide")).toBe("thumb-owner:Thumb");
    expect(
      typeAndOwner({ ...episode, ParentThumbImageTag: undefined }, "wide"),
    ).toBe("backdrop-owner:Backdrop");
    expect(
      typeAndOwner(
        {
          ...episode,
          ParentThumbImageTag: undefined,
          ParentBackdropImageTags: [],
        },
        "wide",
      ),
    ).toBe("item:Primary");
  });

  test("wide prefers the episode's own image when asked", () => {
    expect(typeAndOwner(episode, "wide", true)).toBe("item:Primary");
    expect(typeAndOwner({ ...episode, ImageTags: {} }, "wide", true)).toBe(
      "thumb-owner:Thumb",
    );
  });

  test("preferEpisodeImage changes nothing for an item that is no episode", () => {
    expect(typeAndOwner(full, "wide", true)).toBe("item:Thumb");
  });

  test("backdrop is the item's backdrop then its Primary, an episode's Primary alone", () => {
    expect(typeAndOwner(full, "backdrop")).toBe("item:Backdrop");
    expect(typeAndOwner({ ...full, BackdropImageTags: [] }, "backdrop")).toBe(
      "item:Primary",
    );
    expect(typeAndOwner(episode, "backdrop")).toBe("item:Primary");
  });

  test("heroBackdrop is the item's backdrop, an episode's parent backdrop", () => {
    expect(typeAndOwner(full, "heroBackdrop")).toBe("item:Backdrop");
    expect(typeAndOwner(episode, "heroBackdrop")).toBe(
      "backdrop-owner:Backdrop",
    );
    expect(
      typeAndOwner({ ...full, BackdropImageTags: [] }, "heroBackdrop"),
    ).toBeNull();
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
      "parent:Primary",
    );
    expect(
      typeAndOwner(
        { ...full, AlbumId: undefined, ParentId: undefined },
        "album",
      ),
    ).toBe("item:Primary");
  });

  test("parentBackdrop, thumb and screenshot have no fallback", () => {
    const bare = { Id: "item", ImageTags: {}, BackdropImageTags: [] };
    expect(typeAndOwner(bare, "parentBackdrop")).toBeNull();
    expect(
      typeAndOwner({ ...bare, ImageTags: { Primary: "p" } }, "thumb"),
    ).toBeNull();
    expect(
      typeAndOwner({ ...bare, ImageTags: { Primary: "p" } }, "screenshot"),
    ).toBeNull();
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
          ImageBlurHashes: { Backdrop: { "parent-backdrop": "parent-hash" } },
        },
        "heroBackdrop",
      )?.blurhash,
    ).toBe("parent-hash");
  });

  test("leaves the hash out when there is none", () => {
    expect(resolveItemImage(full, "primary")).not.toHaveProperty("blurhash");
  });
});
