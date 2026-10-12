import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { MusicFolderRow } from "@/components/music/MusicFolderRow";
import { MusicPlayAllHeader } from "@/components/music/MusicPlayAllHeader";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { TrackOptionsSheets } from "@/components/music/TrackOptionsSheets";
import { useIncludeSubfolders } from "@/hooks/useIncludeSubfolders";
import { useMusicPlayQueue } from "@/hooks/useMusicPlayQueue";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { buildFolderPageQuery } from "@/utils/music/musicQueries";

const ITEMS_PER_PAGE = 100;

interface Props {
  /** The music library itself for the Folders tab, or a folder inside it. */
  folderId: string | undefined;
  /** Space a transparent header takes above the list. */
  topInset?: number;
}

/** A music folder as it is on disk: its subfolders, then its songs. */
export const MusicFolderContents: React.FC<Props> = ({
  folderId,
  topInset = 0,
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const includeSubfolders = useIncludeSubfolders();
  const [selectedTrack, setSelectedTrack] = useState<BaseItemDto | null>(null);
  const [trackOptionsOpen, setTrackOptionsOpen] = useState(false);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["music-folder", folderId, user?.Id],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getItemsApi(api!).getItems(
        buildFolderPageQuery(user!.Id!, folderId!, {
          startIndex: pageParam,
          limit: ITEMS_PER_PAGE,
        }),
      );
      return {
        items: response.data.Items || [],
        totalCount: response.data.TotalRecordCount || 0,
        startIndex: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextStart = lastPage.startIndex + ITEMS_PER_PAGE;
      return nextStart < lastPage.totalCount ? nextStart : undefined;
    },
    initialPageParam: 0,
    enabled: !!api && !!user?.Id && !!folderId,
  });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) || [],
    [data],
  );
  // Tapping a song plays on through the songs of this folder.
  const tracks = useMemo(() => items.filter((item) => !item.IsFolder), [items]);
  const hasSubfolders = items.length > tracks.length;

  const source = useMemo(
    () =>
      user?.Id && folderId
        ? {
            userId: user.Id,
            parentId: folderId,
            recursive: includeSubfolders.value,
          }
        : null,
    [user?.Id, folderId, includeSubfolders.value],
  );
  const { playAll, shuffle, isStarting } = useMusicPlayQueue(source);

  const handleTrackOptionsPress = useCallback((track: BaseItemDto) => {
    setSelectedTrack(track);
    setTrackOptionsOpen(true);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.folder_empty")}</Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={items}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            tintColor='#9334E9'
          />
        }
        ListHeaderComponent={
          <MusicPlayAllHeader
            onPlayAll={playAll}
            onShuffle={shuffle}
            isStarting={isStarting}
            includeSubfolders={hasSubfolders ? includeSubfolders : undefined}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        getItemType={(item) => (item.IsFolder ? "folder" : "track")}
        renderItem={({ item }) =>
          item.IsFolder ? (
            <MusicFolderRow folder={item} />
          ) : (
            <MusicTrackItem
              track={item}
              queue={tracks}
              onOptionsPress={handleTrackOptionsPress}
            />
          )
        }
        keyExtractor={(item) => item.Id!}
        ListFooterComponent={
          <>
            {isFetchingNextPage && (
              <View className='py-4'>
                <Loader />
              </View>
            )}
            <TrackOptionsSheets
              track={selectedTrack}
              open={trackOptionsOpen}
              setOpen={setTrackOptionsOpen}
            />
          </>
        }
      />
    </View>
  );
};
