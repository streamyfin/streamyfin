import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, {useEffect, useMemo, useState} from "react";
import {Text} from "@/components/common/Text";
import useDownloadHelper from "@/utils/download";

interface DownloadSizeProps {
  items: BaseItemDto[];
}

export const DownloadSize: React.FC<DownloadSizeProps> = ({ items }) => {
  const { getDownloadSize } = useDownloadHelper();
  const [size, setSize] = useState<string | undefined>();

  useEffect(() => {
      getDownloadSize(...items).then(setSize)
    },
    [items]
  );

  const sizeText = useMemo(() => {
    if (!size)
      return "reading size..."
    return size
  }, [size])

  return (
    <>
      <Text className="text-xs text-neutral-500">{sizeText}</Text>
    </>
  );
};