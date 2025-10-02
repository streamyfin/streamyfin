import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";

const DropdownView = () => {
  const videoContext = useVideoContext();
  const { subtitleTracks, audioTracks } = videoContext;
  const ControlContext = useControlContext();
  const [item, mediaSource] = [
    ControlContext?.item,
    ControlContext?.mediaSource,
  ];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["75%"], []);

  const { subtitleIndex, audioIndex, bitrateValue, playbackPosition, offline } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
      offline: string;
    }>();

  const isOffline = offline === "true";

  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "",
        bitrateValue: bitrate.toString(),
        playbackPosition: playbackPosition,
      }).toString();
      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [item, mediaSource, subtitleIndex, audioIndex, playbackPosition],
  );

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setOpen(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const handleOpen = () => {
    setOpen(true);
    bottomSheetModalRef.current?.present();
  };

  const handleClose = () => {
    setOpen(false);
    bottomSheetModalRef.current?.dismiss();
  };

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <>
      <TouchableOpacity
        className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        onPress={handleOpen}
      >
        <Ionicons name='ellipsis-horizontal' size={24} color={"white"} />
      </TouchableOpacity>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
      >
        <BottomSheetScrollView
          style={{
            flex: 1,
          }}
        >
          <View
            className='mt-2 mb-8'
            style={{
              paddingLeft: Math.max(16, insets.left),
              paddingRight: Math.max(16, insets.right),
            }}
          >
            <Text className='font-bold text-2xl mb-6'>Playback Options</Text>

            {/* Quality Section */}
            {!isOffline && (
              <View className='mb-6'>
                <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                  Quality
                </Text>
                <View
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                  className='flex flex-col rounded-xl overflow-hidden'
                >
                  {BITRATES?.map((bitrate, idx: number) => (
                    <View key={`quality-item-${idx}`}>
                      <TouchableOpacity
                        onPress={() => {
                          changeBitrate(bitrate.value?.toString() ?? "");
                          setTimeout(() => handleClose(), 250);
                        }}
                        className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                      >
                        <Text className='flex shrink'>{bitrate.key}</Text>
                        {bitrateValue === (bitrate.value?.toString() ?? "") ? (
                          <Ionicons
                            name='radio-button-on'
                            size={24}
                            color='white'
                          />
                        ) : (
                          <Ionicons
                            name='radio-button-off'
                            size={24}
                            color='white'
                          />
                        )}
                      </TouchableOpacity>
                      {idx < BITRATES.length - 1 && (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                          }}
                          className='bg-neutral-700'
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Subtitle Section */}
            <View className='mb-6'>
              <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                Subtitles
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                }}
                className='flex flex-col rounded-xl overflow-hidden'
              >
                {subtitleTracks?.map((sub, idx: number) => (
                  <View key={`subtitle-item-${idx}`}>
                    <TouchableOpacity
                      onPress={() => {
                        sub.setTrack();
                        setTimeout(() => handleClose(), 250);
                      }}
                      className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                    >
                      <Text className='flex shrink'>{sub.name}</Text>
                      {subtitleIndex === sub.index.toString() ? (
                        <Ionicons
                          name='radio-button-on'
                          size={24}
                          color='white'
                        />
                      ) : (
                        <Ionicons
                          name='radio-button-off'
                          size={24}
                          color='white'
                        />
                      )}
                    </TouchableOpacity>
                    {idx < (subtitleTracks?.length ?? 0) - 1 && (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                        }}
                        className='bg-neutral-700'
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Audio Section */}
            {(audioTracks?.length ?? 0) > 0 && (
              <View className='mb-6'>
                <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                  Audio
                </Text>
                <View
                  style={{
                    borderRadius: 20,
                    overflow: "hidden",
                  }}
                  className='flex flex-col rounded-xl overflow-hidden'
                >
                  {audioTracks?.map((track, idx: number) => (
                    <View key={`audio-item-${idx}`}>
                      <TouchableOpacity
                        onPress={() => {
                          track.setTrack();
                          setTimeout(() => handleClose(), 250);
                        }}
                        className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                      >
                        <Text className='flex shrink'>{track.name}</Text>
                        {audioIndex === track.index.toString() ? (
                          <Ionicons
                            name='radio-button-on'
                            size={24}
                            color='white'
                          />
                        ) : (
                          <Ionicons
                            name='radio-button-off'
                            size={24}
                            color='white'
                          />
                        )}
                      </TouchableOpacity>
                      {idx < (audioTracks?.length ?? 0) - 1 && (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                          }}
                          className='bg-neutral-700'
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
};

export default DropdownView;
