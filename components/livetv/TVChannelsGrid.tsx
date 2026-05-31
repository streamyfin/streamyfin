import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { TVChannelCard } from "./TVChannelCard";

const HORIZONTAL_PADDING = 60;
const GRID_GAP = 16;

export const TVChannelsGrid: React.FC = () => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Fetch all channels
  const { data: channelsData, isLoading } = useQuery({
    queryKey: ["livetv", "channels-grid", "all"],
    queryFn: async () => {
      if (!api || !user?.Id) return null;
      const res = await getLiveTvApi(api).getLiveTvChannels({
        enableFavoriteSorting: true,
        userId: user.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const channels = channelsData?.Items ?? [];

  const handleChannelPress = useCallback(
    (channelId: string | undefined) => {
      if (channelId) {
        // Navigate directly to the player to start the channel
        const queryParams = new URLSearchParams({
          itemId: channelId,
          audioIndex: "",
          subtitleIndex: "",
          mediaSourceId: "",
          bitrateValue: "",
        });
        router.push(`/player/direct-player?${queryParams.toString()}`);
      }
    },
    [router],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#FFFFFF' />
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { fontSize: typography.body }]}>
          {t("live_tv.no_channels")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingLeft: insets.left + HORIZONTAL_PADDING,
          paddingRight: insets.right + HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 60,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.grid}>
        {channels.map((channel, index) => (
          <TVChannelCard
            key={channel.Id ?? index}
            channel={channel}
            api={api}
            onPress={() => handleChannelPress(channel.Id)}
            // No hasTVPreferredFocus - tab buttons handle initial focus
          />
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: GRID_GAP,
    overflow: "visible",
    paddingVertical: 10, // Extra padding for focus scale animation
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.6)",
  },
});
