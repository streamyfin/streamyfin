import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import { FilterSheet } from "./filters/FilterSheet";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
  streamType?: string;
  title: string;
}

export const TrackSheet: React.FC<Props> = ({
  source,
  onChange,
  selected,
  streamType,
  title,
  ...props
}) => {
  const isTv = Platform.isTV;
  const { t } = useTranslation();

  const streams = useMemo(
    () => source?.MediaStreams?.filter((x) => x.Type === streamType),
    [source],
  );

  const selectedSteam = useMemo(
    () => streams?.find((x) => x.Index === selected),
    [streams, selected],
  );

  const noneOption = useMemo(
    () => ({ Index: -1, DisplayTitle: t("common.none") }),
    [t],
  );

  // Creates a modified data array that includes a "None" option for subtitles
  // We might want to possibly do this for other places, like audio?
  const addNoneToSubtitles = useMemo(() => {
    if (streamType === "Subtitle") {
      const result = streams ? [noneOption, ...streams] : [noneOption];
      return result;
    }
    return streams;
  }, [streams, streamType, noneOption]);
  const [open, setOpen] = useState(false);

  if (isTv || (streams && streams.length === 0)) return null;

  return (
    <View className='flex shrink' style={{ minWidth: 60 }} {...props}>
      <View className='flex flex-col'>
        <Text className='opacity-50 mb-1 text-xs'>{title}</Text>
        <TouchableOpacity
          className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
          onPress={() => setOpen(true)}
        >
          <Text numberOfLines={1}>
            {selected === -1 && streamType === "Subtitle"
              ? t("common.none")
              : selectedSteam?.DisplayTitle || t("common.select", "Select")}
          </Text>
        </TouchableOpacity>
      </View>
      <FilterSheet
        open={open}
        setOpen={setOpen}
        title={title}
        data={addNoneToSubtitles || []}
        values={
          selected === -1 && streamType === "Subtitle"
            ? [{ Index: -1, DisplayTitle: t("common.none") }]
            : selectedSteam
              ? [selectedSteam]
              : []
        }
        multiple={false}
        searchFilter={(item, query) => {
          const label = (item as any).DisplayTitle || "";
          return label.toLowerCase().includes(query.toLowerCase());
        }}
        renderItemLabel={(item) => (
          <Text>{(item as any).DisplayTitle || ""}</Text>
        )}
        set={(vals) => {
          const chosen = vals[0] as any;
          if (chosen && chosen.Index !== null && chosen.Index !== undefined) {
            onChange(chosen.Index);
          }
        }}
      />
    </View>
  );
};
