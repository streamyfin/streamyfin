import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "./common/Text";
import { useTranslation } from "react-i18next";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const AudioTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  ...props
}) => {
  const audioStreams = useMemo(
    () => source?.MediaStreams?.filter((x) => x.Type === "Audio"),
    [source]
  );

  const selectedAudioSteam = useMemo(
    () => audioStreams?.find((x) => x.Index === selected),
    [audioStreams, selected]
  );

  const { t } = useTranslation();

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
            <Text className="opacity-50 mb-1 text-xs">{t("series.audio")}</Text>
            <TouchableOpacity className="bg-neutral-900  h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between">
              <Text className="" numberOfLines={1}>
                {selectedAudioSteam?.DisplayTitle}
              </Text>
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
          <DropdownMenu.Label>Audio streams</DropdownMenu.Label>
          {audioStreams?.map((audio, idx: number) => (
            <DropdownMenu.Item
              key={idx.toString()}
              onSelect={() => {
                if (audio.Index !== null && audio.Index !== undefined)
                  onChange(audio.Index);
              }}
            >
              <DropdownMenu.ItemTitle>
                {audio.DisplayTitle}
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
