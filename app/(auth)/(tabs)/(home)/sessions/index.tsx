import { Text } from "@/components/common/Text";
import { useSessions, useSessionsProps } from "@/hooks/useSessions";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Loader } from "@/components/Loader";
import { HardwareAccelerationType, SessionInfoDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import Poster from "@/components/posters/Poster";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { useInterval } from "@/hooks/useInterval";
import React, { useEffect, useMemo, useState } from "react";
import { formatTimeString } from "@/utils/time";
import { formatBitrate } from "@/utils/bitrate";
import {
  Ionicons,
  Entypo,
  AntDesign,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { Badge } from "@/components/Badge";

export default function page() {
  const { sessions, isLoading } = useSessions({} as useSessionsProps);
  const { t } = useTranslation();

  if (isLoading)
    return (
      <View className="justify-center items-center h-full">
        <Loader />
      </View>
    );

  if (!sessions || sessions.length == 0)
    return (
      <View className="h-full w-full flex justify-center items-center">
        <Text className="text-lg text-neutral-500">
          {t("home.sessions.no_active_sessions")}
        </Text>
      </View>
    );

  return (
    <FlashList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingTop: 17,
        paddingHorizontal: 17,
        paddingBottom: 150,
      }}
      data={sessions}
      renderItem={({ item }) => <SessionCard session={item} />}
      keyExtractor={(item) => item.Id || ""}
      estimatedItemSize={200}
    />
  );
}

interface SessionCardProps {
  session: SessionInfoDto;
}

const SessionCard = ({ session }: SessionCardProps) => {
  const api = useAtomValue(apiAtom);
  const [remainingTicks, setRemainingTicks] = useState<number>(0);

  const tick = () => {
    if (session.PlayState?.IsPaused) return;
    setRemainingTicks(remainingTicks - 10000000);
  };

  const getProgressPercentage = () => {
    if (!session.NowPlayingItem || !session.NowPlayingItem.RunTimeTicks) {
      return 0;
    }

    return Math.round(
      (100 / session.NowPlayingItem?.RunTimeTicks) *
        (session.NowPlayingItem?.RunTimeTicks - remainingTicks)
    );
  };

  useEffect(() => {
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    if (
      duration !== null &&
      duration !== undefined &&
      currentTime !== null &&
      currentTime !== undefined
    ) {
      const remainingTimeTicks = duration - currentTime;
      setRemainingTicks(remainingTimeTicks);
    }
  }, [session]);

  useInterval(tick, 1000);

  return (
    <View className="flex flex-col shadow-md bg-neutral-900 rounded-2xl mb-4">
      <View className="flex flex-row p-4">
        <View className="w-20 pr-4">
          <Poster
            id={session.NowPlayingItem?.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className="w-full flex-1">
          <View className="flex flex-row justify-between">
            <View className="flex-1 pr-4">
              {session.NowPlayingItem?.Type === "Episode" ? (
                <>
                  <Text className="font-bold">
                    {session.NowPlayingItem?.Name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs opacity-50">
                    {`S${session.NowPlayingItem.ParentIndexNumber?.toString()}:E${session.NowPlayingItem.IndexNumber?.toString()}`}
                    {" - "}
                    {session.NowPlayingItem.SeriesName}
                  </Text>
                </>
              ) : (
                <>
                  <Text className="font-bold">
                    {session.NowPlayingItem?.Name}
                  </Text>
                  <Text className="text-xs opacity-50">
                    {session.NowPlayingItem?.ProductionYear}
                  </Text>
                  <Text className="text-xs opacity-50">
                    {session.NowPlayingItem?.SeriesName}
                  </Text>
                </>
              )}
            </View>
            <Text className="text-xs opacity-50 align-right text-right">
              {session.UserName}
              {"\n"}
              {session.Client}
              {"\n"}
              {session.DeviceName}
            </Text>
          </View>
          <View className="flex-1" />
          <View className="flex flex-col align-bottom">
            <View className="flex flex-row justify-between align-bottom mb-1">
              <Text className="-ml-0.5 text-xs opacity-50 align-left text-left">
                {!session.PlayState?.IsPaused ? (
                  <Ionicons name="play" size={14} color="white" />
                ) : (
                  <Ionicons name="pause" size={14} color="white" />
                )}
              </Text>
              <Text className="text-xs opacity-50 align-right text-right">
                {formatTimeString(remainingTicks, "tick")} left
              </Text>
            </View>
            <View className="align-bottom bg-gray-800 h-1">
              <View
                className={`bg-purple-600 h-full`}
                style={{
                  width: `${getProgressPercentage()}%`,
                }}
              />
            </View>
          </View>
        </View>
      </View>
      <TranscodingView session={session} />
    </View>
  );
};

interface TranscodingBadgesProps {
  properties: StreamProps;
}

const TranscodingBadges = ({ properties }: TranscodingBadgesProps) => {
  const iconMap = {
    bitrate: <Ionicons name="speedometer-outline" size={12} color="white" />,
    codec: <Ionicons name="layers-outline" size={12} color="white" />,
    videoRange: (
      <Ionicons name="color-palette-outline" size={12} color="white" />
    ),
    resolution: <Ionicons name="film-outline" size={12} color="white" />,
    language: <Ionicons name="language-outline" size={12} color="white" />,
    audioChannels: <Ionicons name="mic-outline" size={12} color="white" />,
    hwType: <Ionicons name="hardware-chip-outline" size={12} color="white" />,
  } as const;

  const icon = (val: string) => {
    return (
      iconMap[val as keyof typeof iconMap] ?? (
        <Ionicons name="layers-outline" size={12} color="white" />
      )
    );
  };

  const formatVal = (key: string, val: any) => {
    switch (key) {
      case "bitrate":
        return formatBitrate(val);
      case "hwType":
        return val === HardwareAccelerationType.None ? "sw" : "hw";
      default:
        return val;
    }
  };

  return Object.entries(properties)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key]) => (
      <Badge
        key={key}
        variant="gray"
        className="m-0 p-0 pt-0.5 mr-1"
        text={formatVal(key, properties[key as keyof StreamProps])}
        iconLeft={icon(key)}
      />
    ));
};

interface StreamProps {
  hwType?: HardwareAccelerationType | null | undefined;
  resolution?: string | null | undefined;
  language?: string | null | undefined;
  codec?: string | null | undefined;
  bitrate?: number | null | undefined;
  videoRange?: string | null | undefined;
  audioChannels?: string | null | undefined;
}

interface TranscodingStreamViewProps {
  title: string | undefined;
  value?: string;
  isTranscoding: Boolean;
  transcodeValue?: string | undefined | null;
  properties: StreamProps;
  transcodeProperties?: StreamProps;
}

const TranscodingStreamView = ({
  title,
  isTranscoding,
  properties,
  transcodeProperties,
  value,
  transcodeValue,
}: TranscodingStreamViewProps) => {
  return (
    <View className="flex flex-col pt-2 first:pt-0">
      <View className="flex flex-row">
        <Text className="text-xs opacity-50 w-20 font-bold text-right pr-4">
          {title}
        </Text>
        <Text className="flex-1">
          <TranscodingBadges properties={properties} />
        </Text>
      </View>
      {isTranscoding && transcodeProperties ? (
        <>
          <View className="flex flex-row">
            <Text className="-mt-0 text-xs opacity-50 w-20 font-bold text-right pr-4">
              <MaterialCommunityIcons
                name="arrow-right-bottom"
                size={14}
                color="white"
              />
            </Text>
            <Text className="flex-1 text-sm mt-1">
              <TranscodingBadges properties={transcodeProperties} />
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
};

const TranscodingView = ({ session }: SessionCardProps) => {
  const videoStream = useMemo(() => {
    return session.NowPlayingItem?.MediaStreams?.filter(
      (s) => s.Type == "Video"
    )[0];
  }, [session]);

  const audioStream = useMemo(() => {
    const index = session.PlayState?.AudioStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.AudioStreamIndex]);

  const subtitleStream = useMemo(() => {
    const index = session.PlayState?.SubtitleStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.SubtitleStreamIndex]);

  const isTranscoding = useMemo(() => {
    return session.PlayState?.PlayMethod == "Transcode" && session.TranscodingInfo;
  }, [session.PlayState?.PlayMethod, session.TranscodingInfo]);

  const videoStreamTitle = () => {
    return videoStream?.DisplayTitle?.split(" ")[0];
  };

  return (
    <View className="flex flex-col bg-neutral-800 rounded-b-2xl p-4 pt-2">
      <TranscodingStreamView
        title="Video"
        properties={{
          resolution: videoStreamTitle(),
          bitrate: videoStream?.BitRate,
          codec: videoStream?.Codec,
        }}
        transcodeProperties={{
          hwType: session.TranscodingInfo?.HardwareAccelerationType,
          bitrate: session.TranscodingInfo?.Bitrate,
          codec: session.TranscodingInfo?.VideoCodec,
        }}
        isTranscoding={
          isTranscoding && !session.TranscodingInfo?.IsVideoDirect
            ? true
            : false
        }
      />

      <TranscodingStreamView
        title="Audio"
        properties={{
          language: audioStream?.Language,
          bitrate: audioStream?.BitRate,
          codec: audioStream?.Codec,
          audioChannels: audioStream?.ChannelLayout,
        }}
        transcodeProperties={{
          codec: session.TranscodingInfo?.AudioCodec,
          audioChannels: session.TranscodingInfo?.AudioChannels?.toString(),
        }}
        isTranscoding={
          isTranscoding && !session.TranscodingInfo?.IsVideoDirect
            ? true
            : false
        }
      />

      {subtitleStream && (
        <>
          <TranscodingStreamView
            title="Subtitle"
            isTranscoding={false}
            properties={{
              language: subtitleStream?.Language,
              codec: subtitleStream?.Codec,
            }}
            transcodeValue={null}
          />
        </>
      )}
    </View>
  );
};
