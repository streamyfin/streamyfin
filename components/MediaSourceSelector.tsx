import { tc } from "@/utils/textTools";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "./common/Text";
import { convertBitsToMegabitsOrGigabits } from "@/utils/bToMb";

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
  const selectedName = useMemo(
    () =>
      item.MediaSources?.find((x) => x.Id === selected?.Id)?.MediaStreams?.find(
        (x) => x.Type === "Video"
      )?.DisplayTitle || "",
    [item, selected]
  );

  const commonPrefix = useMemo(() => {
    const mediaSources = item.MediaSources || [];
    if (!mediaSources.length) return "";

    let commonPrefix = "";
    for (let i = 0; i < mediaSources[0].Name.length; i++) {
      const char = mediaSources[0].Name[i];
      if (mediaSources.every((source) => source.Name[i] === char)) {
        commonPrefix += char;
      } else {
        commonPrefix = commonPrefix.slice(0, -1);
        break;
      }
    }
    return commonPrefix;
  }, [item.MediaSources]);

  const name = (name?: string | null) => {
    return name?.replace(commonPrefix, "").toLowerCase();
  };

  return (
    <View
      className="flex shrink"
      style={{
        minWidth: 50,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className="flex flex-col" {...props}>
            <Text className="opacity-50 mb-1 text-xs">Video</Text>
            <TouchableOpacity className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center">
              <Text numberOfLines={1}>{selectedName}</Text>
            </TouchableOpacity>
          </View>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={true}
          side="bottom"
          align="start"
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
                {`${name(source.Name)}`}
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
