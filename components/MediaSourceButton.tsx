import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { useItemQuery } from "@/hooks/useItemQuery";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BitrateSheet } from "./BitRateSheet";
import { Button } from "./Button";
import type { SelectedOptions } from "./ItemContent";
import { MediaSourceSheet } from "./MediaSourceSheet";
import { TrackSheet } from "./TrackSheet";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  setSelectedOptions: React.Dispatch<
    React.SetStateAction<SelectedOptions | undefined>
  >;
  isOffline?: boolean;
  colors?: ThemeColors;
}

export const MediaSourceButton: React.FC<Props> = ({
  item,
  selectedOptions,
  setSelectedOptions,
  isOffline,
  colors,
  ...props
}: Props) => {
  const { t } = useTranslation();
  const _api = useAtomValue(apiAtom);
  const _user = useAtomValue(userAtom);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const {
    data: itemWithSources,
    isError,
    isLoading,
    isFetching,
  } = useItemQuery(item.Id, false, undefined, []);

  const effectiveColors = colors || globalColorAtom;

  useEffect(() => {
    if (!itemWithSources) return;
    setSelectedOptions({
      mediaSource: itemWithSources.MediaSources[0],
    });
  }, [itemWithSources]);

  return (
    <View>
      <TouchableOpacity
        disabled={!item}
        onPress={() => bottomSheetModalRef.current?.present()}
      >
        <View
          style={{ backgroundColor: effectiveColors.secondary }}
          className='w-12 h-12 rounded-full z-10 items-center justify-center overflow-hidden'
        >
          <Ionicons name='list' size={24} color='white' />
        </View>
      </TouchableOpacity>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        snapPoints={["80%"]}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
      >
        <BottomSheetScrollView>
          {!itemWithSources ? (
            <View className='flex-1 items-center justify-center py-8'>
              <ActivityIndicator size='large' />
            </View>
          ) : (
            <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
              <View className='flex flex-col space-y-2 w-ful'>
                <BitrateSheet
                  className='w-full'
                  onChange={(val) =>
                    setSelectedOptions(
                      (prev) => prev && { ...prev, bitrate: val },
                    )
                  }
                  selected={selectedOptions.bitrate}
                />

                <MediaSourceSheet
                  className='w-full'
                  item={itemWithSources}
                  onChange={(val) =>
                    setSelectedOptions(
                      (prev) =>
                        prev && {
                          ...prev,
                          mediaSource: val,
                        },
                    )
                  }
                  selected={selectedOptions.mediaSource}
                />

                <TrackSheet
                  className='w-full'
                  streamType='Audio'
                  title={t("item_card.audio")}
                  source={selectedOptions.mediaSource}
                  onChange={(val) => {
                    setSelectedOptions(
                      (prev) =>
                        prev && {
                          ...prev,
                          audioIndex: val,
                        },
                    );
                  }}
                  selected={selectedOptions.audioIndex}
                />
                <TrackSheet
                  source={selectedOptions.mediaSource}
                  streamType='Subtitle'
                  title={t("item_card.subtitles")}
                  onChange={(val) =>
                    setSelectedOptions(
                      (prev) =>
                        prev && {
                          ...prev,
                          subtitleIndex: val,
                        },
                    )
                  }
                  selected={selectedOptions.subtitleIndex}
                />
              </View>
              <Button
                onPress={() => bottomSheetModalRef.current?.dismiss()}
                color='purple'
              >
                {t("common.select")}
              </Button>

              <View></View>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
};
