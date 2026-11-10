import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TVFocusGuideView, View } from "react-native";
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
  // Tabs switch on focus, so moving across the row would rebuild every tab
  // passed on the way. A visited tab stays mounted and is only hidden.
  const [visitedTabs, setVisitedTabs] = useState<TabId[]>(["programs"]);

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
    setVisitedTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
  }, []);

  const programsContent = useMemo(
    () => (
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
    ),
    [sections, insets.bottom, insets.left],
  );

  // Stable elements: a switch only changes which tab is shown, so React
  // skips the content of every tab, visible or not.
  const tabContents = useMemo<Record<TabId, React.ReactNode>>(
    () => ({
      programs: programsContent,
      guide: <TVLiveTVGuide />,
      channels: <TVChannelsGrid />,
      recordings: (
        <TVLiveTVPlaceholder tabName={t("live_tv.tabs.recordings")} />
      ),
      schedule: <TVLiveTVPlaceholder tabName={t("live_tv.tabs.schedule")} />,
      series: <TVLiveTVPlaceholder tabName={t("live_tv.tabs.series")} />,
    }),
    [programsContent, t],
  );

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
          {t("live_tv.title")}
        </Text>

        {/* Tab Bar: a tab switches on focus, so focus entering the row must
            land on the active tab rather than on the tab nearest to it. */}
        <TVFocusGuideView
          autoFocus
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
        </TVFocusGuideView>
      </View>

      {/* Tab Content */}
      {visitedTabs.map((tabId) => (
        <View
          key={tabId}
          style={{ flex: 1, display: tabId === activeTab ? "flex" : "none" }}
        >
          {tabContents[tabId]}
        </View>
      ))}
    </View>
  );
};
