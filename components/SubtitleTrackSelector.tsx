import { tc } from "@/utils/textTools";
import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { Text } from "./common/Text";
import { useTranslation } from "react-i18next";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const SubtitleTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  ...props
}) => {
  if (Platform.isTV) return null;
  const subtitleStreams = useMemo(() => {
    return source?.MediaStreams?.filter((x) => x.Type === "Subtitle");
  }, [source]);

  const selectedSubtitleSteam = useMemo(
    () => subtitleStreams?.find((x) => x.Index === selected),
    [subtitleStreams, selected]
  );

  if (subtitleStreams?.length === 0) return null;

  const { t } = useTranslation();

  return (
    <View
      className="flex col shrink justify-start place-self-start items-start"
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className="flex flex-col " {...props}>
            <Text className="opacity-50 mb-1 text-xs">
              {t("item_card.subtitles")}
            </Text>
            <TouchableOpacity className="bg-neutral-900  h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between">
              <Text className=" ">
                {selectedSubtitleSteam
                  ? tc(selectedSubtitleSteam?.DisplayTitle, 7)
                  : t("item_card.none")}
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
          <DropdownMenu.Label>Subtitle tracks</DropdownMenu.Label>
          <DropdownMenu.Item
            key={"-1"}
            onSelect={() => {
              onChange(-1);
            }}
          >
            <DropdownMenu.ItemTitle>None</DropdownMenu.ItemTitle>
          </DropdownMenu.Item>
          {subtitleStreams?.map((subtitle, idx: number) => (
            <DropdownMenu.Item
              key={idx.toString()}
              onSelect={() => {
                if (subtitle.Index !== undefined && subtitle.Index !== null)
                  onChange(subtitle.Index);
              }}
            >
              <DropdownMenu.ItemTitle>
                {subtitle.DisplayTitle}
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
