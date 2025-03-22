import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { HourHeader } from "@/components/livetv/HourHeader";
import { LiveTVGuideRow } from "@/components/livetv/LiveTVGuideRow";
import { TAB_HEIGHT } from "@/constants/Values";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { Ionicons } from "@expo/vector-icons";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HOUR_HEIGHT = 30;
const ITEMS_PER_PAGE = 20;

const MemoizedLiveTVGuideRow = React.memo(LiveTVGuideRow);

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState<Date>(new Date());
  const [currentPage, setCurrentPage] = useState(1);

  const { data: guideInfo } = useQuery({
    queryKey: ["livetv", "guideInfo"],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getGuideInfo();
      return res.data;
    },
  });

  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels", currentPage],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: (currentPage - 1) * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
  });

  const { data: programs } = useQuery({
    queryKey: ["livetv", "programs", date, currentPage],
    queryFn: async () => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const now = new Date();
      const isToday = startOfDay.toDateString() === now.toDateString();

      const res = await getLiveTvApi(api!).getPrograms({
        getProgramsDto: {
          MaxStartDate: endOfDay.toISOString(),
          MinEndDate: isToday ? now.toISOString() : startOfDay.toISOString(),
          ChannelIds: channels?.Items?.map((c) => c.Id).filter(
            Boolean,
          ) as string[],
          ImageTypeLimit: 1,
          EnableImages: false,
          SortBy: ["StartDate"],
          EnableTotalRecordCount: false,
          EnableUserData: false,
        },
      });
      return res.data;
    },
    enabled: !!channels,
  });

  const screenWidth = Dimensions.get("window").width;

  const [scrollX, setScrollX] = useState(0);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      key={"home"}
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <PageButtons
        currentPage={currentPage}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        isNextDisabled={
          !channels || (channels?.Items?.length || 0) < ITEMS_PER_PAGE
        }
      />

      <View className='flex flex-row'>
        <View className='flex flex-col w-[64px]'>
          <View
            style={{
              height: HOUR_HEIGHT,
            }}
            className='bg-neutral-800'
          />
          {channels?.Items?.map((c, i) => (
            <View className='h-16 w-16 mr-4 rounded-lg overflow-hidden' key={i}>
              <ItemImage
                style={{
                  width: "100%",
                  height: "100%",
                  resizeMode: "contain",
                }}
                item={c}
              />
            </View>
          ))}
        </View>
        <ScrollView
          style={{
            width: screenWidth - 64,
          }}
          horizontal
          scrollEnabled
          onScroll={(e) => {
            setScrollX(e.nativeEvent.contentOffset.x);
          }}
        >
          <View className='flex flex-col'>
            <HourHeader height={HOUR_HEIGHT} />
            {channels?.Items?.map((c, i) => (
              <MemoizedLiveTVGuideRow
                channel={c}
                programs={programs?.Items}
                key={c.Id}
                scrollX={scrollX}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

interface PageButtonsProps {
  currentPage: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  isNextDisabled: boolean;
}

const PageButtons: React.FC<PageButtonsProps> = ({
  currentPage,
  onPrevPage,
  onNextPage,
  isNextDisabled,
}) => {
  const { t } = useTranslation();
  return (
    <View className='flex flex-row justify-between items-center bg-neutral-800 w-full px-4 py-2'>
      <TouchableOpacity
        onPress={onPrevPage}
        disabled={currentPage === 1}
        className='flex flex-row items-center'
      >
        <Ionicons
          name='chevron-back'
          size={24}
          color={currentPage === 1 ? "gray" : "white"}
        />
        <Text
          className={`ml-1 ${
            currentPage === 1 ? "text-gray-500" : "text-white"
          }`}
        >
          {t("live_tv.previous")}
        </Text>
      </TouchableOpacity>
      <Text className='text-white'>Page {currentPage}</Text>
      <TouchableOpacity
        onPress={onNextPage}
        disabled={isNextDisabled}
        className='flex flex-row items-center'
      >
        <Text
          className={`mr-1 ${isNextDisabled ? "text-gray-500" : "text-white"}`}
        >
          {t("live_tv.next")}
        </Text>
        <Ionicons
          name='chevron-forward'
          size={24}
          color={isNextDisabled ? "gray" : "white"}
        />
      </TouchableOpacity>
    </View>
  );
};
