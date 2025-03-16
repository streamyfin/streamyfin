import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { TAB_HEIGHT } from "@/constants/Values";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom } from "jotai";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      key={"home"}
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
        paddingTop: 8,
      }}
    >
      <View className='flex flex-col space-y-2'>
        <ScrollingCollectionList
          queryKey={["livetv", "recommended"]}
          title={t("live_tv.on_now")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getRecommendedPrograms({
              userId: user?.Id,
              isAiring: true,
              limit: 24,
              imageTypeLimit: 1,
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
              enableTotalRecordCount: false,
              fields: ["ChannelInfo", "PrimaryImageAspectRatio"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
        <ScrollingCollectionList
          queryKey={["livetv", "shows"]}
          title={t("live_tv.shows")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getLiveTvPrograms({
              userId: user?.Id,
              hasAired: false,
              limit: 9,
              isMovie: false,
              isSeries: true,
              isSports: false,
              isNews: false,
              isKids: false,
              enableTotalRecordCount: false,
              fields: ["ChannelInfo", "PrimaryImageAspectRatio"],
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
        <ScrollingCollectionList
          queryKey={["livetv", "movies"]}
          title={t("live_tv.movies")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getLiveTvPrograms({
              userId: user?.Id,
              hasAired: false,
              limit: 9,
              isMovie: true,
              enableTotalRecordCount: false,
              fields: ["ChannelInfo"],
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
        <ScrollingCollectionList
          queryKey={["livetv", "sports"]}
          title={t("live_tv.sports")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getLiveTvPrograms({
              userId: user?.Id,
              hasAired: false,
              limit: 9,
              isSports: true,
              enableTotalRecordCount: false,
              fields: ["ChannelInfo"],
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
        <ScrollingCollectionList
          queryKey={["livetv", "kids"]}
          title={t("live_tv.for_kids")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getLiveTvPrograms({
              userId: user?.Id,
              hasAired: false,
              limit: 9,
              isKids: true,
              enableTotalRecordCount: false,
              fields: ["ChannelInfo"],
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
        <ScrollingCollectionList
          queryKey={["livetv", "news"]}
          title={t("live_tv.news")}
          queryFn={async () => {
            if (!api) return [] as BaseItemDto[];
            const res = await getLiveTvApi(api).getLiveTvPrograms({
              userId: user?.Id,
              hasAired: false,
              limit: 9,
              isNews: true,
              enableTotalRecordCount: false,
              fields: ["ChannelInfo"],
              enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            });
            return res.data.Items || [];
          }}
          orientation='horizontal'
        />
      </View>
    </ScrollView>
  );
}
