import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformOptionsMenu } from "./PlatformOptionsMenu";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  onChange: (value: MediaSourceInfo) => void;
  selected?: MediaSourceInfo | null;
}

export const MediaSourceSelector: React.FC<Props> = ({
  item,
  onChange,
  selected,
  ...props
}) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const getDisplayName = useCallback((source: MediaSourceInfo) => {
    const videoStream = source.MediaStreams?.find((x) => x.Type === "Video");
    if (videoStream?.DisplayTitle) {
      return videoStream.DisplayTitle;
    }

    // Fallback to source name
    if (source.Name) {
      return source.Name;
    }

    // Last resort fallback
    return `Source ${source.Id}`;
  }, []);

  const selectedName = useMemo(() => {
    if (!selected) return "";
    return getDisplayName(selected);
  }, [selected, getDisplayName]);

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        id: "media-sources",
        title: "Media sources",
        options:
          item.MediaSources?.map((source, idx) => ({
            id: `${source.Id || idx}`,
            type: "radio" as const,
            groupId: "media-sources",
            label: getDisplayName(source),
            selected: source.Id === selected?.Id,
          })) || [],
      },
    ],
    [item.MediaSources, selected, getDisplayName],
  );

  const handleOptionSelect = (optionId: string) => {
    const selectedSource = item.MediaSources?.find(
      (source, idx) => `${source.Id || idx}` === optionId,
    );
    if (selectedSource) {
      onChange(selectedSource);
    }
    setOpen(false);
  };

  const trigger = (
    <View className='flex flex-col' {...props}>
      <Text className='opacity-50 mb-1 text-xs'>{t("item_card.video")}</Text>
      <TouchableOpacity
        className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center'
        onPress={() => setOpen(true)}
      >
        <Text numberOfLines={1}>{selectedName}</Text>
      </TouchableOpacity>
    </View>
  );

  if (isTv) return null;

  return (
    <View
      className='flex shrink'
      style={{
        minWidth: 50,
      }}
    >
      <PlatformOptionsMenu
        groups={optionGroups}
        trigger={trigger}
        title={t("item_card.video")}
        open={open}
        onOpenChange={setOpen}
        onOptionSelect={handleOptionSelect}
        expoUIConfig={{
          hostStyle: { flex: 1 },
        }}
        bottomSheetConfig={{
          enableDynamicSizing: true,
          enablePanDownToClose: true,
        }}
      />
    </View>
  );
};
