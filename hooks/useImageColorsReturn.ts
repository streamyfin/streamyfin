import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  adjustToNearBlack,
  calculateTextColor,
  isCloseToBlack,
} from "@/utils/atoms/primaryColor";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getItemImage } from "@/utils/getItemImage";
import { extractImageColor } from "@/utils/imageColors";
import { storage } from "@/utils/mmkv";

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

      // The image lives on the Jellyfin server, which may sit behind an access
      // gateway — without the proxy headers the download 403s and the screen
      // keeps the default colors.
      const headers =
        ("headers" in source ? source.headers : undefined) ??
        getJellyfinHeadersForUrl(source.uri, api?.basePath);

      extractImageColor(source.uri, headers)
        .then((color) => {
          // No library to extract with: the colors stay as they are.
          if (color === null) return;
          let primary = color;
          let text = "#000";

          // Adjust the primary color if it's too close to black
          if (primary && isCloseToBlack(primary)) {
            primary = adjustToNearBlack(primary);
          }

          // Calculate the text color based on the primary color
          if (primary) text = calculateTextColor(primary);

          const newColors = {
            primary,
            text,
          };

          setColors(newColors);

          // Cache the colors in storage
          if (source.uri && primary) {
            storage.set(`${source.uri}-primary`, primary);
            storage.set(`${source.uri}-text`, text);
          }
        })
        .catch((error: any) => {
          console.error("Error getting colors", error);
          setColors(DEFAULT_COLORS);
        });
    }
  }, [isTv, source, disabled, item, url, api?.basePath]);

  return colors;
};
