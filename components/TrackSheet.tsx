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
  const [open, setOpen] = useState(false);

  if (isTv || (streams && streams.length === 0)) return null;

  return (
    <View className='flex shrink' style={{ minWidth: 25 }} {...props}>
      <View className='flex flex-col'>
        <Text className='opacity-50 mb-1 text-xs'>{title}</Text>
        <TouchableOpacity
          className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
          onPress={() => setOpen(true)}
        >
          <Text numberOfLines={1}>
            {selectedSteam?.DisplayTitle || t("common.select", "Select")}
          </Text>
        </TouchableOpacity>
      </View>
      <FilterSheet
        open={open}
        setOpen={setOpen}
        title={title}
        data={streams || []}
        values={selectedSteam ? [selectedSteam] : []}
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
