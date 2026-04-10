import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList.tv";
import { TVChannelsGrid } from "@/components/livetv/TVChannelsGrid";
import { TVLiveTVGuide } from "@/components/livetv/TVLiveTVGuide";
import { TVLiveTVPlaceholder } from "@/components/livetv/TVLiveTVPlaceholder";
import { TVTabButton } from "@/components/tv/TVTabButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const HORIZONTAL_PADDING = 60;
const TOP_PADDING = 100;
const SECTION_GAP = 24;

type TabId =
  | "programs"
  | "guide"
  | "channels"
  | "recordings"
  | "schedule"
  | "series";

interface Tab {
  id: TabId;
  labelKey: string;
}

const TABS: Tab[] = [
  { id: "programs", labelKey: "live_tv.tabs.programs" },
  { id: "guide", labelKey: "live_tv.tabs.guide" },
  { id: "channels", labelKey: "live_tv.tabs.channels" },
  { id: "recordings", labelKey: "live_tv.tabs.recordings" },
  { id: "schedule", labelKey: "live_tv.tabs.schedule" },
  { id: "series", labelKey: "live_tv.tabs.series" },
];

export const TVLiveTVPage: React.FC = () => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const [activeTab, setActiveTab] = useState<TabId>("programs");

  // Section configurations for Programs tab
  const sections = useMemo(() => {
    if (!api || !user?.Id) return [];

    return [
      {
        title: t("live_tv.on_now"),
        queryKey: ["livetv", "tv", "onNow"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getRecommendedPrograms({
            userId: user.Id,
            isAiring: true,
            limit: 24,
            imageTypeLimit: 1,
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
            enableTotalRecordCount: false,
            fields: ["ChannelInfo", "PrimaryImageAspectRatio"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
      {
        title: t("live_tv.shows"),
        queryKey: ["livetv", "tv", "shows"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getLiveTvPrograms({
            userId: user.Id,
            hasAired: false,
            limit: 24,
            isMovie: false,
            isSeries: true,
            isSports: false,
            isNews: false,
            isKids: false,
            enableTotalRecordCount: false,
            fields: ["ChannelInfo", "PrimaryImageAspectRatio"],
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
      {
        title: t("live_tv.movies"),
        queryKey: ["livetv", "tv", "movies"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getLiveTvPrograms({
            userId: user.Id,
            hasAired: false,
            limit: 24,
            isMovie: true,
            enableTotalRecordCount: false,
            fields: ["ChannelInfo"],
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
      {
        title: t("live_tv.sports"),
        queryKey: ["livetv", "tv", "sports"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getLiveTvPrograms({
            userId: user.Id,
            hasAired: false,
            limit: 24,
            isSports: true,
            enableTotalRecordCount: false,
            fields: ["ChannelInfo"],
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
      {
        title: t("live_tv.for_kids"),
        queryKey: ["livetv", "tv", "kids"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getLiveTvPrograms({
            userId: user.Id,
            hasAired: false,
            limit: 24,
            isKids: true,
            enableTotalRecordCount: false,
            fields: ["ChannelInfo"],
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
      {
        title: t("live_tv.news"),
        queryKey: ["livetv", "tv", "news"],
        queryFn: async ({ pageParam = 0 }: { pageParam?: number }) => {
          const res = await getLiveTvApi(api).getLiveTvPrograms({
            userId: user.Id,
            hasAired: false,
            limit: 24,
            isNews: true,
            enableTotalRecordCount: false,
            fields: ["ChannelInfo"],
            enableImageTypes: ["Primary", "Thumb", "Backdrop"],
          });
          const items = res.data.Items || [];
          return items.slice(pageParam, pageParam + 10);
        },
      },
    ];
  }, [api, user?.Id, t]);

  const handleTabSelect = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);

  const renderProgramsContent = () => (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: 24,
        paddingBottom: insets.bottom + 60,
      }}
    >
      <View
        style={{
          gap: SECTION_GAP,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
        }}
      >
        {sections.map((section) => (
          <InfiniteScrollingCollectionList
            key={section.queryKey.join("-")}
            title={section.title}
            queryKey={section.queryKey}
            queryFn={section.queryFn}
            orientation='horizontal'
            hideIfEmpty
            pageSize={10}
            enabled={true}
            isFirstSection={false}
          />
        ))}
      </View>
    </ScrollView>
  );

  const renderTabContent = () => {
    if (activeTab === "programs") {
      return renderProgramsContent();
    }

    if (activeTab === "guide") {
      return <TVLiveTVGuide />;
    }

    if (activeTab === "channels") {
      return <TVChannelsGrid />;
    }

    // Placeholder for other tabs
    const tab = TABS.find((t) => t.id === activeTab);
    return <TVLiveTVPlaceholder tabName={t(tab?.labelKey || "")} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Header with Title and Tabs */}
      <View
        style={{
          paddingTop: insets.top + TOP_PADDING,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
          paddingBottom: 24,
        }}
      >
        {/* Title */}
        <Text
          style={{
            fontSize: typography.display,
            fontWeight: "bold",
            color: "#FFFFFF",
            marginBottom: 24,
          }}
        >
          Live TV
        </Text>

        {/* Tab Bar */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
          }}
        >
          {TABS.map((tab) => (
            <TVTabButton
              key={tab.id}
              label={t(tab.labelKey)}
              active={activeTab === tab.id}
              onSelect={() => handleTabSelect(tab.id)}
              hasTVPreferredFocus={activeTab === tab.id}
              switchOnFocus={true}
            />
          ))}
        </View>
      </View>

      {/* Tab Content */}
      <View style={{ flex: 1 }}>{renderTabContent()}</View>
    </View>
  );
};
