# Jellyfin item images

Every Jellyfin item image URL comes from `getItemImageUrl` in
`utils/jellyfin/image/getItemImageUrl.ts`. Never build one by hand. The lint rule
`biome-plugins/no-hand-built-image-url.grit` rejects a `/Images/` path and the SDK's
`getImageApi(` and `new ImageUrlsApi(` outside `utils/jellyfin/image/`.

```typescript
const url = getItemImageUrl(api, item, "poster", { width: 120, height: 180 });
```

Use `getItemImageUrlById` only when the caller has no item. Its URL is untagged, so the
server cannot tell a changed image from the cached one.

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
[custom-headers.md](../custom-headers.md).

User avatars come from `getUserImageUrl` in `utils/jellyfin/image/getUserImageUrl.ts`.

## Where this differs from jellyfin-web

The chains follow jellyfin-web's `cardbuilder/utils/url.ts`. Two differences are on
purpose:

- **Size caps.** A cover-fit request is capped at `MAX_IMAGE_SIDE_PX`, and a logo at
  `MAX_LOGO_HEIGHT_PX`, so a large box on a 3x phone does not decode to an oversized
  bitmap.
- **The `album` kind.** It tries the album's image before the track's own, so every
  track of an album shares one cache entry.
