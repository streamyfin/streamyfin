import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { useAddToPlaylist } from "@/hooks/usePlaylistMutations";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  trackToAdd: BaseItemDto | null;
  onCreateNew: () => void;
}

export const PlaylistPickerSheet: React.FC<Props> = ({
  open,
  setOpen,
  trackToAdd,
  onCreateNew,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const addToPlaylist = useAddToPlaylist();

  const [search, setSearch] = useState("");
  const snapPoints = useMemo(() => ["75%"], []);

  // Fetch all playlists
  const { data: playlists, isLoading } = useQuery({
    queryKey: ["music-playlists-picker", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        includeItemTypes: ["Playlist"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        recursive: true,
        mediaTypes: ["Audio"],
      });

      return response.data.Items || [];
    },
    enabled: Boolean(api && user?.Id && open),
  });

  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];
    if (!search) return playlists;
    return playlists.filter((playlist) =>
      playlist.Name?.toLowerCase().includes(search.toLowerCase()),
    );
  }, [playlists, search]);

  const showSearch = (playlists?.length || 0) > 10;

  useEffect(() => {
    if (open) {
      setSearch("");
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
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

  const handleSelectPlaylist = useCallback(
    async (playlist: BaseItemDto) => {
      if (!trackToAdd?.Id || !playlist.Id) return;

      await addToPlaylist.mutateAsync({
        playlistId: playlist.Id,
        trackIds: [trackToAdd.Id],
        playlistName: playlist.Name || undefined,
      });

      setOpen(false);
    },
    [trackToAdd, addToPlaylist, setOpen],
  );

  const handleCreateNew = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      onCreateNew();
    }, 300);
  }, [onCreateNew, setOpen]);

  const getPlaylistImageUrl = useCallback(
    (playlist: BaseItemDto) => {
      if (!api) return null;
      return `${api.basePath}/Items/${playlist.Id}/Images/Primary?maxHeight=100&maxWidth=100`;
    },
    [api],
  );

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
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom + 16,
        }}
      >
        <Text className='font-bold text-2xl mb-2'>
          {t("music.track_options.add_to_playlist")}
        </Text>
        <Text className='text-neutral-500 mb-4'>{trackToAdd?.Name}</Text>

        {showSearch && (
          <Input
            placeholder={t("music.playlists.search_playlists")}
            className='mb-4 border-neutral-800 border'
            value={search}
            onChangeText={setSearch}
            returnKeyType='done'
          />
        )}

        {/* Create New Playlist Button */}
        <TouchableOpacity
          onPress={handleCreateNew}
          className='flex-row items-center bg-purple-900/30 rounded-xl px-4 py-3.5 mb-4'
        >
          <View className='w-12 h-12 rounded-lg bg-purple-600 items-center justify-center mr-3'>
            <Ionicons name='add' size={28} color='white' />
          </View>
          <Text className='text-purple-400 font-semibold text-base'>
            {t("music.playlists.create_new")}
          </Text>
        </TouchableOpacity>

        {isLoading ? (
          <View className='py-8 items-center'>
            <ActivityIndicator color='#9334E9' />
          </View>
        ) : filteredPlaylists.length === 0 ? (
          <View className='py-8 items-center'>
            <Text className='text-neutral-500'>
              {search ? t("search.no_results") : t("music.no_playlists")}
            </Text>
          </View>
        ) : (
          <View className='rounded-xl overflow-hidden bg-neutral-800'>
            {filteredPlaylists.map((playlist, index) => (
              <View key={playlist.Id}>
                <TouchableOpacity
                  onPress={() => handleSelectPlaylist(playlist)}
                  className='flex-row items-center px-4 py-3'
                  disabled={addToPlaylist.isPending}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 6,
                      overflow: "hidden",
                      backgroundColor: "#1a1a1a",
                      marginRight: 12,
                    }}
                  >
                    <Image
                      source={{
                        uri: getPlaylistImageUrl(playlist) || undefined,
                      }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit='cover'
                      cachePolicy='memory-disk'
                    />
                  </View>
                  <View className='flex-1'>
                    <Text numberOfLines={1} className='text-white text-base'>
                      {playlist.Name}
                    </Text>
                    <Text className='text-neutral-500 text-sm'>
                      {playlist.ChildCount} {t("music.tabs.tracks")}
                    </Text>
                  </View>
                  {addToPlaylist.isPending && (
                    <ActivityIndicator size='small' color='#9334E9' />
                  )}
                </TouchableOpacity>
                {index < filteredPlaylists.length - 1 && (
                  <View style={styles.separator} />
                )}
              </View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
