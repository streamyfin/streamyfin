import { Text } from "@/components/common/Text";
import { useSessions } from "@/hooks/useSessions";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View } from "react-native";
import { Loader } from "@/components/Loader";
import { ImageBackground } from "react-native";
import {
  MediaSourceType,
  SessionInfoDto,
  TranscodingInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemImage } from "@/utils/getItemImage";
import { useAtom, useAtomValue } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import Poster from "@/components/posters/Poster";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { useNavigation } from "expo-router";
import { useInterval } from "@/hooks/useInterval";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatTimeString, msToTicks, ticksToSeconds } from '@/utils/time';
import { Entypo, AntDesign } from '@expo/vector-icons';

export default function page() {
  const navigation = useNavigation();
  const { sessions, isLoading } = useSessions({});
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
          {t("sessions.no_active_sessions")}
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
    return Math.round(100 / session.NowPlayingItem?.RunTimeTicks * (session.NowPlayingItem?.RunTimeTicks - remainingTicks));
  };

  useEffect(() => {
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    const remainingTimeTicks = duration - currentTime;
    setRemainingTicks(remainingTimeTicks);
  }, [session]);

  useInterval(tick, 1000);

  return (
    <View className="flex flex-col shadow-md bg-neutral-900 rounded-2xl mb-4">
    
    <View className="flex flex-row p-4">
        <View className="w-20 pr-4">
          <Poster
            id={session.NowPlayingItem.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className="w-full flex-1">
         <View className="flex flex-row justify-between">
          <View className="flex-1 pr-4">
           <Text className="font-bold">
            {session.NowPlayingItem?.Name}
           </Text>
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
           {session.UserName}{"\n"}
           {session.Client}{"\n"}
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
                width: getProgressPercentage() + "%"
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
    return videoStream?.DisplayTitle.split(" ")[0];
  }; 
  
  return (
      <View className="flex flex-col bg-neutral-800 p-4">
        <View className="flex flex-row" >
          <Text className="pt-[2.5px] text-xs opacity-50 w-20 font-bold text-right pr-4">Video</Text>
          
          <Text className="flex-1 text-sm">
            {videoStreamTitle()} ({videoStream?.Codec} {videoStream?.VideoRange.toUpperCase()} {Math.round(videoStream?.BitRate / 1000000)}Mbps)
            {isTranscoding && (
                <>
                {'\n'} -> {videoStreamTitle()} ({session.TranscodingInfo?.VideoCodec.toUpperCase()} {Math.round(session.TranscodingInfo?.Bitrate / 1000000)}Mbps)
                </>
            )}
          </Text>
        </View>

        <View className="flex mt-1 flex-row">
          <Text className="pt-[2.5px] text-xs opacity-50 font-bold w-20 text-right pr-4">Audio</Text>
          <Text className="flex-1 text-sm">
            <Text className="capitalize">{audioStream?.Language}</Text> ({audioStream?.Codec.toUpperCase()} {audioStream?.ChannelLayout})
            {isTranscoding && !session.TranscodingInfo?.IsAudioDirect && (
                <>
                {'\n'} -> {session.TranscodingInfo?.AudioCodec.toUpperCase()} {session.TranscodingInfo?.AudioChannels}
                </>
            )}
          </Text>
      </View>
      {subtitleStream && (
      <>
      <View className="flex mt-1 text-wrap flex-row">
          <Text className="pt-[2.5px] text-xs opacity-50 w-20 font-bold text-right pr-4">Subtitle</Text>
            <Text numberOfLines={1} className="flex-1 text-top text-sm">
              {subtitleStream.DisplayTitle}
            </Text>
          </View>
          </>
        )}
        
      </View>
  );
};

