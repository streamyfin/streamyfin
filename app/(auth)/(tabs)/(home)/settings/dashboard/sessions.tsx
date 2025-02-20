import { Text } from "@/components/common/Text";
import { useSessions, useSessionsProps } from "@/hooks/useSessions";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Loader } from "@/components/Loader";
import { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import Poster from "@/components/posters/Poster";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { useInterval } from "@/hooks/useInterval";
import React, { useEffect, useMemo, useState } from "react";
import { formatTimeString } from "@/utils/time";
import { Entypo, AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";

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
          {t("home.settings.dashboard.no_active_sessions")}
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
              <Text className="font-bold">{session.NowPlayingItem?.Name}</Text>
              {!session.NowPlayingItem?.SeriesName && (
                <Text className="text-xs opacity-50">
                  {session.NowPlayingItem?.ProductionYear}
                </Text>
              )}
              {session.NowPlayingItem?.SeriesName && (
                <Text className="text-xs opacity-50">
                  {session.NowPlayingItem?.SeriesName}
                </Text>
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
            <View className="flex flex-row justify-between align-bottom">
              <Text className="-ml-1 text-xs opacity-50 align-left text-left">
                {!session.PlayState?.IsPaused ? (
                  <Entypo name="controller-play" size={14} color="white" />
                ) : (
                  <AntDesign name="pause" size={14} color="white" />
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
                  width: getProgressPercentage() + "%",
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

interface TranscodingStreamViewProps {
  title: String | undefined;
  value: String;
  isTranscoding: Boolean;
  transcodeValue: String | undefined | null;
}

const TranscodingStreamView = ({
  title,
  value,
  isTranscoding,
  transcodeValue,
}: TranscodingStreamViewProps) => {
  return (
    <View className="flex flex-col">
      <View className="flex flex-row">
        <Text className="text-xs opacity-50 w-20 font-bold text-right pr-4">
          {title}
        </Text>
        <Text className="flex-1 text-xs">{value}</Text>
      </View>
      {isTranscoding && (
        <>
          <View className="flex flex-row">
            <Text className="-mt-1 text-xs opacity-50 w-20 font-bold text-right pr-4">
              <MaterialCommunityIcons
                name="arrow-right-bottom"
                size={14}
                color="white"
              />
            </Text>
            <Text className="flex-1 text-xs">{transcodeValue}</Text>
          </View>
        </>
      )}
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
    return session.PlayState?.PlayMethod == "Transcode";
  }, [session.PlayState?.PlayMethod]);

  const videoStreamTitle = () => {
    return videoStream?.DisplayTitle?.split(" ")[0];
  };

  const toMbps = (val: number) => {
    return Math.round(val / 1000000);
  };

  return (
    <View className="flex flex-col bg-neutral-800 p-4">
      <TranscodingStreamView
        title="Video"
        isTranscoding={
          isTranscoding && !session.TranscodingInfo?.IsVideoDirect
            ? true
            : false
        }
        value={`${videoStreamTitle()} (${
          videoStream?.Codec
        } ${videoStream?.VideoRange?.toUpperCase()} ${Math.round(
          (videoStream?.BitRate || 0) / 1000000
        )}Mbps)`}
        transcodeValue={`${videoStreamTitle()} (${session.TranscodingInfo?.VideoCodec?.toUpperCase()} ${toMbps(
          session.TranscodingInfo?.Bitrate || 0
        )}Mbps)}`}
      />

      <TranscodingStreamView
        title="Audio"
        isTranscoding={
          isTranscoding && !session.TranscodingInfo?.IsVideoDirect
            ? true
            : false
        }
        value={`${
          audioStream?.Language
        } (${audioStream?.Codec?.toUpperCase()} ${
          audioStream?.ChannelLayout
        } ${toMbps(audioStream?.BitRate || 0)}Mbps)`}
        transcodeValue={`${session.TranscodingInfo?.AudioCodec?.toUpperCase()} ${
          session.TranscodingInfo?.AudioChannels
        } ${toMbps(session.TranscodingInfo?.Bitrate || 0)}Mbps`}
      />
      {subtitleStream && (
        <>
          <TranscodingStreamView
            title="Subtitle"
            isTranscoding={false}
            value={`${subtitleStream.DisplayTitle}`}
            transcodeValue={null}
          />
        </>
      )}
    </View>
  );
};
