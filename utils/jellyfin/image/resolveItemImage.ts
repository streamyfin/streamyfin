import type {
  BaseItemDto,
  BaseItemPerson,
  ImageType,
} from "@jellyfin/sdk/lib/generated-client/models";

/** One image of one item, found by its own tag: never an untagged guess. */
export type ImageRef = {
  itemId: string;
  type: ImageType;
  tag: string;
  blurhash?: string;
};

export type ImageKind =
  | "primary"
  | "poster"
  | "seasonPoster"
  | "wide"
  | "backdrop"
  | "parentBackdrop"
  | "thumb"
  | "logo"
  | "album"
  | "screenshot";

export type ResolveItemImageOptions = {
  /** `wide` only: prefer an episode's own still over its series' Thumb. */
  preferEpisodeImage?: boolean;
};

type Item = BaseItemDto | BaseItemPerson;
type Step = (
  item: BaseItemDto & BaseItemPerson,
) => Omit<ImageRef, "blurhash"> | null;

// An image exists only when both its owner and its tag do. Half a pair is a
// request the server answers with a 404 or the wrong picture.
const pair = (
  itemId: string | null | undefined,
  type: ImageType,
  tag: string | null | undefined,
) => (itemId && tag ? { itemId, type, tag } : null);

const STEPS = {
  // A person carries its tag as PrimaryImageTag, a BaseItemDto in ImageTags.
  primary: (i) =>
    pair(i.Id, "Primary", i.ImageTags?.Primary ?? i.PrimaryImageTag),
  thumb: (i) => pair(i.Id, "Thumb", i.ImageTags?.Thumb),
  backdrop: (i) => pair(i.Id, "Backdrop", i.BackdropImageTags?.[0]),
  logo: (i) => pair(i.Id, "Logo", i.ImageTags?.Logo),
  screenshot: (i) => pair(i.Id, "Screenshot", i.ImageTags?.Screenshot),
  seriesPrimary: (i) => pair(i.SeriesId, "Primary", i.SeriesPrimaryImageTag),
  seriesThumb: (i) => pair(i.SeriesId, "Thumb", i.SeriesThumbImageTag),
  // The Thumb and the Backdrop of a parent can belong to different items, so
  // each reads its own id: a Thumb tag asked of the backdrop's owner is a 404.
  parentThumb: (i) => pair(i.ParentThumbItemId, "Thumb", i.ParentThumbImageTag),
  parentBackdrop: (i) =>
    pair(i.ParentBackdropItemId, "Backdrop", i.ParentBackdropImageTags?.[0]),
  parentLogo: (i) => pair(i.ParentLogoItemId, "Logo", i.ParentLogoImageTag),
  // ParentPrimaryImageTag belongs to ParentPrimaryImageItemId, which is not
  // always ParentId.
  parentPrimary: (i) =>
    pair(i.ParentPrimaryImageItemId, "Primary", i.ParentPrimaryImageTag),
  albumPrimary: (i) => pair(i.AlbumId, "Primary", i.AlbumPrimaryImageTag),
} satisfies Record<string, Step>;

type StepName = keyof typeof STEPS;

type StepList = readonly StepName[];

type KindSteps = {
  episode?: StepList;
  episodeOwnImage?: StepList;
  default: StepList;
};

/**
 * What each kind of image falls back through, first hit wins. The one place
 * that says which image an item shows where.
 */
export const IMAGE_KINDS: Record<ImageKind, KindSteps> = {
  primary: { default: ["primary"] },
  poster: { episode: ["seriesPrimary", "primary"], default: ["primary"] },
  seasonPoster: {
    episode: ["parentPrimary", "seriesPrimary", "primary"],
    default: ["primary"],
  },
  wide: {
    episode: ["seriesThumb", "parentThumb", "parentBackdrop", "primary"],
    episodeOwnImage: [
      "primary",
      "seriesThumb",
      "parentThumb",
      "parentBackdrop",
    ],
    default: ["thumb", "seriesThumb", "backdrop", "primary"],
  },
  backdrop: { default: ["backdrop", "parentBackdrop", "primary"] },
  parentBackdrop: { default: ["parentBackdrop"] },
  thumb: {
    episode: ["thumb", "seriesThumb", "parentThumb"],
    default: ["thumb"],
  },
  logo: { default: ["logo", "parentLogo"] },
  album: { default: ["albumPrimary", "parentPrimary", "primary"] },
  screenshot: { default: ["screenshot"] },
};

const stepsFor = (
  kind: ImageKind,
  item: Item,
  options: ResolveItemImageOptions,
): StepList => {
  const kindSteps = IMAGE_KINDS[kind];
  if ((item as BaseItemDto).Type !== "Episode") return kindSteps.default;
  if (options.preferEpisodeImage && kindSteps.episodeOwnImage) {
    return kindSteps.episodeOwnImage;
  }
  return kindSteps.episode ?? kindSteps.default;
};

/**
 * Finds the image an item shows for a kind: the first step of the kind's list
 * whose id and tag both exist. Pure: it builds no URL and knows no size.
 */
export const resolveItemImage = (
  item: Item | null | undefined,
  kind: ImageKind,
  options: ResolveItemImageOptions = {},
): ImageRef | null => {
  if (!item) return null;

  for (const name of stepsFor(kind, item, options)) {
    const found = STEPS[name](item as BaseItemDto & BaseItemPerson);
    if (found) {
      // Jellyfin lists a parent image's hash on the child, keyed by its tag.
      const blurhash =
        (item as BaseItemDto).ImageBlurHashes?.[found.type]?.[found.tag] ??
        undefined;
      return blurhash ? { ...found, blurhash } : found;
    }
  }
  return null;
};
