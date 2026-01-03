import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  track: BaseItemDto | null;
  onAddToPlaylist: () => void;
}

export const TrackOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  track,
  onAddToPlaylist,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const { playNext, addToQueue } = useMusicPlayer();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const snapPoints = useMemo(() => ["45%"], []);

  const imageUrl = useMemo(() => {
    if (!track) return null;
    const albumId = track.AlbumId || track.ParentId;
    if (albumId) {
      return `${api?.basePath}/Items/${albumId}/Images/Primary?maxHeight=200&maxWidth=200`;
    }
    return getPrimaryImageUrl({ api, item: track });
  }, [api, track]);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

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

  const handlePlayNext = useCallback(() => {
    if (track) {
      playNext(track);
      setOpen(false);
    }
  }, [track, playNext, setOpen]);

  const handleAddToQueue = useCallback(() => {
    if (track) {
      addToQueue(track);
      setOpen(false);
    }
  }, [track, addToQueue, setOpen]);

  const handleAddToPlaylist = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      onAddToPlaylist();
    }, 300);
  }, [onAddToPlaylist, setOpen]);

  if (!track) return null;

  return (
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
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom,
        }}
      >
        {/* Track Info Header */}
        <View className='flex-row items-center mb-6 px-2'>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              overflow: "hidden",
              backgroundColor: "#1a1a1a",
              marginRight: 12,
            }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
                cachePolicy='memory-disk'
              />
            ) : (
              <View className='flex-1 items-center justify-center bg-neutral-800'>
                <Ionicons name='musical-note' size={24} color='#737373' />
              </View>
            )}
          </View>
          <View className='flex-1'>
            <Text
              numberOfLines={1}
              className='text-white font-semibold text-base'
            >
              {track.Name}
            </Text>
            <Text numberOfLines={1} className='text-neutral-400 text-sm mt-0.5'>
              {track.Artists?.join(", ") || track.AlbumArtist}
            </Text>
          </View>
        </View>

        {/* Options */}
        <View className='flex-col rounded-xl overflow-hidden bg-neutral-800'>
          <TouchableOpacity
            onPress={handlePlayNext}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='play-forward' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.play_next")}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={handleAddToQueue}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='list' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.add_to_queue")}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={handleAddToPlaylist}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='albums-outline' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.add_to_playlist")}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
