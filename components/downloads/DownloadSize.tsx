import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, {useEffect, useMemo, useState} from "react";
import {Text} from "@/components/common/Text";
import useDownloadHelper from "@/utils/download";
import {useDownload} from "@/providers/DownloadProvider";

interface DownloadSizeProps {
  items: BaseItemDto[];
}

interface DownloadSizes {
  knownSize: number;
  itemsNeedingSize: BaseItemDto[];
}

export const DownloadSize: React.FC<DownloadSizeProps> = ({ items }) => {
  const { downloadedFiles, saveDownloadedItemInfo } = useDownload();
  const { getDownloadSize } = useDownloadHelper();
  const [size, setSize] = useState<string | undefined>();

  const itemIds = useMemo(() => items.map(i => i.Id), [items])

  useEffect(() => {
    if (!downloadedFiles)
      return

    const {knownSize, itemsNeedingSize} = downloadedFiles
      .filter(f => itemIds.includes(f.item.Id))
      ?.reduce<DownloadSizes>((acc, file) => {
        if (file?.size && file.size > 0)
          acc.knownSize += file.size
        else
          acc.itemsNeedingSize.push(file.item)
        return acc
    }, {
        knownSize: 0,
        itemsNeedingSize: []
    })

      getDownloadSize(
        (item, size) => saveDownloadedItemInfo(item, size),
        ...itemsNeedingSize
      ).then(sizeSum => {
        setSize(bytesToReadable((sizeSum + knownSize)))
      })
    },
    [items, itemIds]
  );

  const sizeText = useMemo(() => {
    if (!size)
      return "reading size..."
    return size
  }, [size])

  const bytesToReadable = (bytes: number) => {
    const gb = bytes / 1e+9;

    if (gb >= 1)
      return `${gb.toFixed(2)} GB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  return (
    <>
      <Text className="text-xs text-neutral-500">{sizeText}</Text>
    </>
  );
};