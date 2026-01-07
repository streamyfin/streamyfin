import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter } from "expo-router";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
} from "@/hooks/useWatchlistMutations";
import {
  useItemInWatchlists,
  useMyWatchlistsQuery,
} from "@/hooks/useWatchlists";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

export interface WatchlistSheetRef {
  open: (item: BaseItemDto) => void;
  close: () => void;
}

interface WatchlistRowProps {
  watchlist: StreamystatsWatchlist;
  isInWatchlist: boolean;
  isCompatible: boolean;
  onToggle: () => void;
  isLoading: boolean;
}

const WatchlistRow: React.FC<WatchlistRowProps> = ({
  watchlist,
  isInWatchlist,
  isCompatible,
  onToggle,
  isLoading,
}) => {
  const disabled = !isCompatible && !isInWatchlist;

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled || isLoading}
      className={`bg-neutral-800 px-4 py-3 flex-row items-center justify-between ${disabled ? "opacity-40" : ""}`}
      activeOpacity={0.7}
    >
      <View className='flex-1 mr-4'>
        <View className='flex-row items-center gap-2'>
          <Text className='text-base font-medium flex-shrink' numberOfLines={1}>
            {watchlist.name}
          </Text>
          {watchlist.allowedItemType && (
            <View className='bg-neutral-700 px-1.5 py-0.5 rounded'>
              <Text className='text-xs text-neutral-400'>
                {watchlist.allowedItemType}
              </Text>
            </View>
          )}
        </View>
        {watchlist.description && (
          <Text className='text-sm text-neutral-400 mt-0.5' numberOfLines={1}>
            {watchlist.description}
          </Text>
        )}
        <Text className='text-xs text-neutral-500 mt-1'>
          {watchlist.itemCount ?? 0} items
        </Text>
      </View>
      <View className='w-8 h-8 items-center justify-center'>
        {isLoading ? (
          <ActivityIndicator size='small' color='#a78bfa' />
        ) : isInWatchlist ? (
          <Ionicons name='checkmark-circle' size={26} color='#a78bfa' />
        ) : isCompatible ? (
          <Ionicons name='add-circle-outline' size={26} color='#9ca3af' />
        ) : (
          <Ionicons name='ban-outline' size={22} color='#525252' />
        )}
      </View>
    </TouchableOpacity>
  );
};

interface WatchlistSheetContentProps {
  item: BaseItemDto;
  onClose: () => void;
}

const WatchlistSheetContent: React.FC<WatchlistSheetContentProps> = ({
  item,
  onClose,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: myWatchlists, isLoading: watchlistsLoading } =
    useMyWatchlistsQuery();
  const { data: watchlistsContainingItem, isLoading: checkingLoading } =
    useItemInWatchlists(item.Id);

  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const isLoading = watchlistsLoading || checkingLoading;

  // Sort watchlists: ones containing item first, then compatible ones, then incompatible
  const sortedWatchlists = useMemo(() => {
    if (!myWatchlists) return [];

    return [...myWatchlists].sort((a, b) => {
      const aInWatchlist = watchlistsContainingItem?.includes(a.id) ?? false;
      const bInWatchlist = watchlistsContainingItem?.includes(b.id) ?? false;

      const aCompatible = !a.allowedItemType || a.allowedItemType === item.Type;
      const bCompatible = !b.allowedItemType || b.allowedItemType === item.Type;

      // Items in watchlist first
      if (aInWatchlist && !bInWatchlist) return -1;
      if (!aInWatchlist && bInWatchlist) return 1;

      // Then compatible items
      if (aCompatible && !bCompatible) return -1;
      if (!aCompatible && bCompatible) return 1;

      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [myWatchlists, watchlistsContainingItem, item.Type]);

  const handleToggle = useCallback(
    async (watchlist: StreamystatsWatchlist) => {
      if (!item.Id) return;

      const isInWatchlist = watchlistsContainingItem?.includes(watchlist.id);

      if (isInWatchlist) {
        await removeFromWatchlist.mutateAsync({
          watchlistId: watchlist.id,
          itemId: item.Id,
          watchlistName: watchlist.name,
        });
      } else {
        await addToWatchlist.mutateAsync({
          watchlistId: watchlist.id,
          itemId: item.Id,
          watchlistName: watchlist.name,
        });
      }
    },
    [item.Id, watchlistsContainingItem, addToWatchlist, removeFromWatchlist],
  );

  const handleCreateNew = useCallback(() => {
    onClose();
    router.push("/(auth)/(tabs)/(watchlists)/create");
  }, [onClose, router]);

  const isItemCompatible = useCallback(
    (watchlist: StreamystatsWatchlist) => {
      if (!watchlist.allowedItemType) return true;
      return watchlist.allowedItemType === item.Type;
    },
    [item.Type],
  );

  if (isLoading) {
    return (
      <View className='py-12 items-center justify-center'>
        <ActivityIndicator size='large' color='#a78bfa' />
        <Text className='text-neutral-400 mt-4'>{t("watchlists.loading")}</Text>
      </View>
    );
  }

  return (
    <View
      className='flex-1'
      style={{
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
      }}
    >
      {/* Header */}
      <View className='mb-4'>
        <Text className='font-bold text-2xl'>
          {t("watchlists.select_watchlist")}
        </Text>
        <Text className='text-neutral-400 mt-1' numberOfLines={1}>
          {item.Name}
        </Text>
      </View>

      {/* Watchlist List */}
      {sortedWatchlists.length === 0 ? (
        <View className='py-8 items-center'>
          <Ionicons name='list-outline' size={48} color='#4b5563' />
          <Text className='text-neutral-400 text-center mt-4'>
            {t("watchlists.empty_title")}
          </Text>
          <Text className='text-neutral-500 text-center text-sm mt-1'>
            {t("watchlists.empty_description")}
          </Text>
        </View>
      ) : (
        <View className='rounded-xl overflow-hidden mb-4'>
          {sortedWatchlists.map((watchlist, index) => (
            <React.Fragment key={watchlist.id}>
              <WatchlistRow
                watchlist={watchlist}
                isInWatchlist={
                  watchlistsContainingItem?.includes(watchlist.id) ?? false
                }
                isCompatible={isItemCompatible(watchlist)}
                onToggle={() => handleToggle(watchlist)}
                isLoading={
                  addToWatchlist.isPending || removeFromWatchlist.isPending
                }
              />
              {index < sortedWatchlists.length - 1 && (
                <View
                  style={{ height: StyleSheet.hairlineWidth }}
                  className='bg-neutral-700'
                />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Create New Button */}
      <TouchableOpacity
        onPress={handleCreateNew}
        className='flex-row items-center justify-center py-4 bg-neutral-800 rounded-xl'
        activeOpacity={0.7}
      >
        <Ionicons name='add' size={20} color='#a78bfa' />
        <Text className='text-purple-400 font-medium'>
          {t("watchlists.create_new")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export const WatchlistSheet = forwardRef<WatchlistSheetRef, object>(
  (_props, ref) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [currentItem, setCurrentItem] = React.useState<BaseItemDto | null>(
      null,
    );
    const insets = useSafeAreaInsets();

    useImperativeHandle(ref, () => ({
      open: (item: BaseItemDto) => {
        setCurrentItem(item);
        bottomSheetModalRef.current?.present();
      },
      close: () => {
        bottomSheetModalRef.current?.dismiss();
      },
    }));

    const handleClose = useCallback(() => {
      bottomSheetModalRef.current?.dismiss();
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

    return (
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        maxDynamicContentSize={600}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
      >
        <BottomSheetView style={{ paddingBottom: insets.bottom }}>
          {currentItem && (
            <WatchlistSheetContent item={currentItem} onClose={handleClose} />
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
