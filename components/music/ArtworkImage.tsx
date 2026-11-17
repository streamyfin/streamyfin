import type { ImageProps } from "expo-image";
import { Image } from "@/components/common/ServerImage";

/**
 * Music artwork, whose source changes while it stays on screen: the current
 * track, a page reused for another album, a recycled row. expo-image keeps the
 * last picture until the new one loads, and keeps it when the new one fails,
 * so an album without artwork showed the previous one's. Keyed on its source,
 * the view starts again from blank.
 */
export function ArtworkImage({ source, ...props }: ImageProps) {
  const uri =
    typeof source === "string"
      ? source
      : source && !Array.isArray(source) && typeof source === "object"
        ? (source as { uri?: string }).uri
        : undefined;
  return <Image source={source} recyclingKey={uri} {...props} />;
}
