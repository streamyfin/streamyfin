import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

/** Additional tracks to keep alongside the primary download audio. */
interface Props {
  /** The selected version of the media. */
  source: MediaSourceInfo;
  /** Audio already included with the video. */
  primaryIndex?: number;
  /** Jellyfin indices of the additional tracks. */
  selected: number[];
  /** Updates the additional-track selection. */
  onChange: (indices: number[]) => void;
}

/** Keeps the primary track mandatory and exposes extras as independent toggles. */
export const AdditionalAudioTracksSelector = memo(
  function AdditionalAudioTracksSelector({
    source,
    primaryIndex,
    selected,
    onChange,
  }: Props) {
    const { t } = useTranslation();
    const { hideModal } = useGlobalModal();
    const streams =
      source.MediaStreams?.filter(
        (stream) =>
          stream.Type === "Audio" &&
          stream.Index != null &&
          stream.Index !== primaryIndex,
      ) ?? [];
    if (streams.length === 0) return null;

    const groups: OptionGroup[] = [
      {
        options: streams.flatMap((stream) => {
          const index = stream.Index;
          if (index == null) return [];
          return [
            {
              type: "toggle" as const,
              label: stream.DisplayTitle || stream.Language || `#${index}`,
              value: selected.includes(index),
              onToggle: () =>
                onChange(
                  selected.includes(index)
                    ? selected.filter(
                        (selectedIndex) => selectedIndex !== index,
                      )
                    : [...selected, index],
                ),
            },
          ];
        }),
      },
    ];

    return (
      <View className='w-full gap-2'>
        <PlatformDropdown
          title={t("item_card.download.additional_audio")}
          groups={groups}
          // Android's modal holds a snapshot of the options; reopen with the updated selection.
          onOptionSelect={Platform.OS === "android" ? hideModal : undefined}
          trigger={
            <View className='bg-neutral-900 rounded-xl border-neutral-800 border px-3 py-2'>
              <Text>
                {t("item_card.download.additional_audio_count", {
                  count: selected.length,
                })}
              </Text>
            </View>
          }
        />
        {selected.length > 0 && (
          <Text className='text-xs text-neutral-400'>
            {t("item_card.download.multitrack_hint")}
          </Text>
        )}
      </View>
    );
  },
);
