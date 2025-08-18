import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useMemo } from "react";
import { Platform, TouchableOpacity, View } from "react-native";

const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;

import { useTranslation } from "react-i18next";
import { Text } from "./common/Text";

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

  if (isTv) return null;

  return (
    <View
      className='flex shrink'
      style={{
        minWidth: 50,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className='flex flex-col' {...props}>
            <Text className='opacity-50 mb-1 text-xs'>
              {t("item_card.video")}
            </Text>
            <TouchableOpacity className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center'>
              <Text numberOfLines={1}>{selectedName}</Text>
            </TouchableOpacity>
          </View>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={true}
          side='bottom'
          align='start'
          alignOffset={0}
          avoidCollisions={true}
          collisionPadding={8}
          sideOffset={8}
        >
          <DropdownMenu.Label>Media sources</DropdownMenu.Label>
          {item.MediaSources?.map((source, idx: number) => (
            <DropdownMenu.Item
              key={idx.toString()}
              onSelect={() => {
                onChange(source);
              }}
            >
              <DropdownMenu.ItemTitle>
                {getDisplayName(source)}
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
