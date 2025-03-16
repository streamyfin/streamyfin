import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { TextProps } from "react-native";

interface DownloadSizeProps extends TextProps {
  items: BaseItemDto[];
}

export const DownloadSize: React.FC<DownloadSizeProps> = ({
  items,
  ...props
}) => {
  const { downloadedFiles, getDownloadedItemSize } = useDownload();
  const [size, setSize] = useState<string | undefined>();

  const itemIds = useMemo(() => items.map((i) => i.Id), [items]);

  useEffect(() => {
    if (!downloadedFiles) return;

    let s = 0;

    for (const item of items) {
      if (!item.Id) continue;
      const size = getDownloadedItemSize(item.Id);
      if (size) {
        s += size;
      }
    }
    setSize(s.bytesToReadable());
  }, [itemIds]);

  const sizeText = useMemo(() => {
    if (!size) return "...";
    return size;
  }, [size]);

  return (
    <>
      <Text className='text-xs text-neutral-500' {...props}>
        {sizeText}
      </Text>
    </>
  );
};
