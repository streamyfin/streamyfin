# Jellyfin item images

Build every Jellyfin item image URL through `utils/jellyfin/image/getItemImageUrl.ts`.
Never build one by hand. The lint rule
`biome-plugins/no-hand-built-image-url.grit` is a heuristic, not a guarantee: it
matches literal `/Images/` substrings — including third-party URLs — the direct SDK
builder calls `getImageApi(` and `new ImageUrlsApi(`, and an unaliased `Image` import
from `react-native`. Remote image use it cannot see (an alias, `expo-image`) gets no
diagnostic, but this page's rules still apply to it.

```typescript
const url = getItemImageUrl(api, item, "poster", { width: 120, height: 180 });
```

Use `getItemImageUrlById` only when the caller has no DTO or usable image metadata
for the target item. Its URL is untagged, so the server cannot tell a changed image
from the cached one. For a related item's poster — the series or season an episode
belongs to — call `getRelatedPosterUrl` instead. Its `seriesPrimary` and
`seasonPrimary` kinds are strict: a tag is used only when the DTO pairs it with that
item, never a mismatched parent tag. When the DTO identifies the item only by id, it
falls back to the untagged by-id request, which still names the right item.

## Pick a kind

A kind names the image an item shows in one place, and `IMAGE_KINDS` in
`utils/jellyfin/image/resolveItemImage.ts` holds the fallback chain of each. Read the
table and choose the kind whose chain matches the screen. Do not copy the chains into a
component.

Never fall back by hand: `item.ImageTags?.Primary ?? item.SeriesPrimaryImageTag` belongs
in the table.

## Size

`width` and `height` are the box the image is drawn in, in layout points. The URL helper
converts them to physical pixels and rounds each side up to `IMAGE_SIZE_STEP_PX`, so
near-identical boxes share one cached image.

- Pass both for an image that covers a box. Pass one for an image that scales on the
  other side.
- Pass `pixels: true` only for an image the app does not draw: lock screen artwork, a
  Top Shelf payload, a download. It has no layout box to convert.
- Never convert with `PixelRatio` or multiply by a scale at the call site.

## Missing images

A null return means the item has no such image. Render a placeholder. Never build an
untagged URL as a fallback: a placeholder beats a 404 and a stale cached picture.
For related navigation cards and offline series art, `getRelatedPosterUrl` keeps
the untagged request for a known target ID when no matching tag is available.

## Quality

Quality follows the image type, not the screen. `getItemImageUrl` reads it from
`constants/Images.ts`: `BACKDROP_IMAGE_QUALITY` for a Backdrop, `IMAGE_QUALITY` for the
rest. Do not pass a quality.

## Add a chain

A new chain is a new kind in `IMAGE_KINDS`. Add a spec for it in
`utils/jellyfin/image/resolveItemImage.test.ts` that covers the full chain, each
fallback, and a half pair (an id without its tag).

## Render

Render with `ItemImage` from `@/components/common/ItemImage`, or with `Image` from
`@/components/common/ServerImage` for a URL you already have. Both attach the user's
custom proxy auth headers. `Image` from `react-native` and `expo-image` do not. See
[custom-headers.md](../custom-headers.md). For a bundled asset API such as
`resolveAssetSource`, never a server image, import it as `Image as NativeImage`.

User avatars come from `getUserImageUrl` in `utils/jellyfin/image/getUserImageUrl.ts`.

## Where this differs from jellyfin-web

The chains follow jellyfin-web's
[`cardbuilder/utils/url.ts`](https://github.com/jellyfin/jellyfin-web/blob/master/src/components/cardbuilder/utils/url.ts).
The differences are on purpose:

- **Size caps.** A cover-fit request is capped at `MAX_IMAGE_SIDE_PX`, and a logo at
  `MAX_LOGO_HEIGHT_PX`, so a large box on a 3x phone does not decode to an oversized
  bitmap.
- **The `album` kind.** It tries the album's image before the track's own, so every
  track of an album shares one cache entry.
- **Episode landscape art.** `wide` prefers the series' and parents' landscape art,
  then the episode's own Thumb or backdrop, and only then its still — series-first
  for an episode is app policy. `preferEpisodeImage` opts back into the still.
