import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import { FilterSheet } from "./filters/FilterSheet";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  onChange: (value: MediaSourceInfo) => void;
  selected?: MediaSourceInfo | null;
}

export const MediaSourceSheet: React.FC<Props> = ({
  item,
  onChange,
  selected,
  ...props
}) => {
  const isTv = Platform.isTV;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const getDisplayName = useCallback((source: MediaSourceInfo) => {
    const videoStream = source.MediaStreams?.find((x) => x.Type === "Video");
    if (videoStream?.DisplayTitle) return videoStream.DisplayTitle;
    if (source.Name) return source.Name;
    return `Source ${source.Id}`;
  }, []);

  const selectedName = useMemo(() => {
    if (!selected) return "";
    return getDisplayName(selected);
  }, [selected, getDisplayName]);

  if (isTv || (item.MediaStreams && item.MediaStreams.length <= 1)) return null;

  return (
    <View className='flex shrink' style={{ minWidth: 75 }}>
      <View className='flex flex-col' {...props}>
        <Text className='opacity-50 mb-1 text-xs'>{t("item_card.video")}</Text>
        <TouchableOpacity
          className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center'
          onPress={() => setOpen(true)}
        >
          <Text numberOfLines={1}>{selectedName}</Text>
        </TouchableOpacity>
      </View>

      <FilterSheet
        open={open}
        setOpen={setOpen}
        title={t("item_card.video")}
        data={item.MediaSources || []}
        values={selected ? [selected] : []}
        multiple={false}
        searchFilter={(src, query) =>
          getDisplayName(src as MediaSourceInfo)
            .toLowerCase()
            .includes(query.toLowerCase())
        }
        renderItemLabel={(src) => (
          <Text>{getDisplayName(src as MediaSourceInfo)}</Text>
        )}
        set={(vals) => {
          const chosen = vals[0] as MediaSourceInfo | undefined;
          if (chosen) onChange(chosen);
        }}
      />
    </View>
  );
};
