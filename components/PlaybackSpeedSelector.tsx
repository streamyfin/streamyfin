import { tc } from "@/utils/textTools";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useSettings } from "@/utils/atoms/settings";
import { useTranslation } from "react-i18next";
import { Text } from "./common/Text";
import { PLAYBACK_SPEEDS } from "./video-player/controls/dropdown/DropdownView";

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const PlaybackSpeedSelector: React.FC<Props> = ({
  onChange,
  selected,
  ...props
}) => {
  const { t } = useTranslation();

  const [settings, updateSettings, pluginSettings] = useSettings();
  return (
    <View
      className='flex col shrink justify-start place-self-start items-start'
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className='flex flex-col ' {...props}>
            <Text numberOfLines={1} className='opacity-50 mb-1 text-xs'>
              {t("item_card.playback_speed")}
            </Text>
            <TouchableOpacity className='bg-neutral-900  h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
              <Text className=' '>{`${selected}x`}</Text>
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
          <DropdownMenu.Label>Playback Speed</DropdownMenu.Label>
          <DropdownMenu.Item
            key={"-1"}
            onSelect={() => {
              onChange(-1);
            }}
          >
            <DropdownMenu.ItemTitle>None</DropdownMenu.ItemTitle>
          </DropdownMenu.Item>
          {PLAYBACK_SPEEDS?.map((speed, idx: number) => (
            <DropdownMenu.Item
              key={speed.value.toString()}
              onSelect={() => {
                onChange(speed.value);
              }}
            >
              <DropdownMenu.ItemTitle>{speed.label}</DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
