import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useMemo } from "react";
import type { TextProps } from "react-native";
import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";

interface DownloadSizeProps extends TextProps {
  items: BaseItemDto[];
}

export const DownloadSize: React.FC<DownloadSizeProps> = ({
  items,
  ...props
}) => {
  const { getDownloadedItemSize, downloadedItems } = useDownload();

  // Keyed by the ids, not by the array: the downloads header builds `items`
  // inside its render function, so the same items arrive as a new array on
  // every header render. An effect that set state on each of those is where
  // React stopped with "Maximum update depth exceeded" when something kept
  // re-rendering the header; derived during render there is nothing to set.
  const idsKey = items.map((item) => item.Id ?? "").join(",");
  const size = useMemo(() => {
    if (!downloadedItems) return undefined;
    let bytes = 0;
    for (const id of idsKey.split(",")) {
      if (id) bytes += getDownloadedItemSize(id) || 0;
    }
    return bytes.bytesToReadable();
  }, [idsKey, downloadedItems, getDownloadedItemSize]);

  return (
    <Text className='text-xs text-neutral-500' {...props}>
      {size ?? "..."}
    </Text>
  );
};
