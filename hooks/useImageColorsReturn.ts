import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import type * as ImageColorsType from "react-native-image-colors";
import { apiAtom } from "@/providers/JellyfinProvider";

// Conditionally import react-native-image-colors only on non-TV platforms
const ImageColors = Platform.isTV
  ? null
  : (require("react-native-image-colors") as typeof ImageColorsType);

import {
  adjustToNearBlack,
  calculateTextColor,
  isCloseToBlack,
} from "@/utils/atoms/primaryColor";
import { getItemImage } from "@/utils/getItemImage";
import { getJellyfinCustomHeadersForUrl } from "@/utils/jellyfin/customHeadersForUrl";
import { storage } from "@/utils/mmkv";

async function fetchImageAsDataUri(
  uri: string,
  headers: Record<string, string>,
): Promise<string> {
  const response = await fetch(uri, { headers });
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader result is not a string"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ThemeColors {
  primary: string;
  text: string;
}

const DEFAULT_COLORS: ThemeColors = {
  primary: "#FFFFFF",
  text: "#000000",
};

/**
 * Custom hook to extract and return image colors for a given item.
 * Returns colors as state instead of updating global atom.
 *
 * @param item - The BaseItemDto object representing the item.
 * @param disabled - A boolean flag to disable color extraction.
 * @returns ThemeColors object with primary and text colors
 */
export const useImageColorsReturn = ({
  item,
  url,
  disabled,
}: {
  item?: BaseItemDto | null;
  url?: string | null;
  disabled?: boolean;
}): ThemeColors => {
  const api = useAtomValue(apiAtom);
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_COLORS);

  const isTv = Platform.isTV;

  const source = useMemo(() => {
    if (!api) return;
    if (url) return { uri: url };
    if (item)
      return getItemImage({
        item,
        api,
        variant: "Primary",
        quality: 80,
        width: 300,
      });
    return null;
  }, [api, item, url]);

  useEffect(() => {
    // Reset to default colors when item changes
    if (!item && !url) {
      setColors(DEFAULT_COLORS);
      return;
    }

    if (isTv) return;
    if (disabled) return;
    if (source?.uri) {
      const _primary = storage.getString(`${source.uri}-primary`);
      const _text = storage.getString(`${source.uri}-text`);

      if (_primary && _text) {
        setColors({
          primary: _primary,
          text: _text,
        });
        return;
      }

      // Extract colors from the image
      if (!ImageColors?.getColors) return;

      const sourceHeaders = "headers" in source ? source.headers : undefined;
      const customHeaders =
        sourceHeaders ??
        getJellyfinCustomHeadersForUrl(source.uri, api?.basePath);

      // react-native-image-colors doesn't support custom HTTP headers.
      // Pre-fetch as a base64 data URI when CF headers are needed.
      // If that fails (native decoder may reject data URIs), skip silently.
      const resolveUri = customHeaders
        ? fetchImageAsDataUri(source.uri, customHeaders).catch(() => null)
        : Promise.resolve(source.uri as string | null);

      resolveUri
        .then((uri) => {
          if (!uri) return undefined; // headers required but fetch failed - skip
          return ImageColors!.getColors(uri, {
            fallback: "#fff",
            cache: false,
          });
        })
        .then((colors) => {
          if (!colors) return;

          let primary = "#fff";
          let text = "#000";
          let backup = "#fff";

          if (colors.platform === "android") {
            primary = colors.dominant;
            backup = colors.vibrant;
          } else if (colors.platform === "ios") {
            primary = colors.detail;
            backup = colors.primary;
          }

          if (primary && isCloseToBlack(primary)) {
            if (backup && !isCloseToBlack(backup)) primary = backup;
            primary = adjustToNearBlack(primary);
          }

          if (primary) text = calculateTextColor(primary);

          setColors({ primary, text });

          if (source.uri && primary) {
            storage.set(`${source.uri}-primary`, primary);
            storage.set(`${source.uri}-text`, text);
          }
        })
        .catch(() => {
          // Silently fall back - non-fatal, just loses dynamic theme color
          setColors(DEFAULT_COLORS);
        });
    }
  }, [isTv, source?.uri, disabled, item, url, api]);

  return colors;
};
