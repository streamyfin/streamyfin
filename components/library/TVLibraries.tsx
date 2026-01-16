import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Loader } from "@/components/Loader";
import {
  TV_LIBRARY_CARD_WIDTH,
  TVLibraryCard,
} from "@/components/library/TVLibraryCard";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

const HORIZONTAL_PADDING = 60;
const ITEM_GAP = 24;
const SCALE_PADDING = 20;

export const TVLibraries: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  const { data, isLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return response.data.Items || null;
    },
    staleTime: 60,
    enabled: !!api && !!user?.Id,
  });

  const libraries = useMemo(
    () =>
      data
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        .filter((l) => l.CollectionType !== "books") || [],
    [data, settings?.hiddenLibraries],
  );

  // Scroll back to start when section loses focus
  useEffect(() => {
    if (prevFocusedCount.current > 0 && focusedCount === 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    prevFocusedCount.current = focusedCount;
  }, [focusedCount]);

  const handleItemFocus = useCallback(() => {
    setFocusedCount((c) => c + 1);
  }, []);

  const handleItemBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
  }, []);

  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, "(libraries)");
      router.push(navigation as any);
    },
    [router],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: TV_LIBRARY_CARD_WIDTH + ITEM_GAP,
      offset: (TV_LIBRARY_CARD_WIDTH + ITEM_GAP) * index,
      index,
    }),
    [],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const isFirstItem = index === 0;

      return (
        <View style={{ marginRight: ITEM_GAP }}>
          <TVFocusablePoster
            onPress={() => handleItemPress(item)}
            hasTVPreferredFocus={isFirstItem}
            onFocus={handleItemFocus}
            onBlur={handleItemBlur}
          >
            <TVLibraryCard library={item} />
          </TVFocusablePoster>
        </View>
      );
    },
    [handleItemPress, handleItemFocus, handleItemBlur],
  );

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader />
      </View>
    );
  }

  if (!libraries || libraries.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 20, color: "#737373" }}>
          {t("library.no_libraries_found")}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingLeft: insets.left + HORIZONTAL_PADDING,
        paddingRight: insets.right + HORIZONTAL_PADDING,
      }}
    >
      <FlatList
        ref={flatListRef}
        horizontal
        data={libraries}
        keyExtractor={(item) => item.Id || ""}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        style={{ overflow: "visible", flexGrow: 0 }}
        contentContainerStyle={{
          paddingVertical: SCALE_PADDING,
          paddingHorizontal: SCALE_PADDING,
        }}
      />
    </View>
  );
};
