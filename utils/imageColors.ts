import { Platform } from "react-native";
import type * as ImageColorsType from "react-native-image-colors";
import { optionsWithOptionalHeaders } from "@/utils/customHeaders";

// TV builds leave react-native-image-colors out (react-native.config.js).
const ImageColors = Platform.isTV
  ? null
  : (require("react-native-image-colors") as typeof ImageColorsType);

/**
 * The color an image is themed from: Android's dominant color, iOS's detail
 * color. The image may sit behind the user's access gateway, so the request
 * carries their headers; without them the download 403s. Null where the
 * library is absent; rejects when the image does not load.
 */
export const extractImageColor = async (
  uri: string,
  headers?: Record<string, string> | null,
): Promise<string | null> => {
  if (!ImageColors?.getColors) return null;
  const colors = await ImageColors.getColors(
    uri,
    optionsWithOptionalHeaders({ fallback: "#fff", cache: false }, headers),
  );
  if (colors.platform === "android") return colors.dominant;
  if (colors.platform === "ios") return colors.detail;
  return null;
};
