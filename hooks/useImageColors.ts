import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  adjustToNearBlack,
  calculateTextColor,
  isCloseToBlack,
  itemThemeColorAtom,
} from "@/utils/atoms/primaryColor";
import { getItemImage } from "@/utils/getItemImage";
import { storage } from "@/utils/mmkv";

// import { getColors } from "react-native-image-colors";
const Colors = !Platform.isTV ? require("react-native-image-colors") : null;

/**
 * Custom hook to extract and manage image colors for a given item.
 *
 * @param item - The BaseItemDto object representing the item.
 * @param disabled - A boolean flag to disable color extraction.
 *
 */
export const useImageColors = ({
  item,
  url,
  disabled,
}: {
  item?: BaseItemDto | null;
  url?: string | null;
  disabled?: boolean;
}) => {
  const api = useAtomValue(apiAtom);
  const [, setPrimaryColor] = useAtom(itemThemeColorAtom);

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
    if (isTv) return;
    if (disabled) return;
    if (source?.uri) {
      const _primary = storage.getString(`${source.uri}-primary`);
      const _text = storage.getString(`${source.uri}-text`);

      if (_primary && _text) {
        setPrimaryColor({
          primary: _primary,
          text: _text,
        });
        return;
      }

      Colors.getColors(source.uri, {
        fallback: "#fff",
        cache: false,
      })
        .then(
          (colors: {
            platform: string;
            dominant: string;
            vibrant: string;
            detail: string;
            primary: string;
          }) => {
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

            setPrimaryColor({
              primary,
              text,
            });

            if (source.uri && primary) {
              storage.set(`${source.uri}-primary`, primary);
              storage.set(`${source.uri}-text`, text);
            }
          },
        )
        .catch((error: any) => {
          console.error("Error getting colors", error);
        });
    }
  }, [isTv, source?.uri, setPrimaryColor, disabled]);

  if (isTv) return;
};
