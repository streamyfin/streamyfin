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
import { BlurView } from "expo-blur";

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
        //paddingLeft: insets.left,
        //paddingRight: insets.right,
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
  //const [remainingTime, setRemainingTime] = useState<string>("");
  const [remainingTicks, setRemainingTicks] = useState<number>(0);

  const tick = () => {
    if (session.PlayState?.IsPaused) return;
    setRemainingTicks(remainingTicks - 10000000);
  };

  const getRemainingTime = () => {
    const remainingTimeTicks = remainingTicks;
    const hours = Math.floor(remainingTimeTicks / 36000000000);
    const minutes = Math.floor((remainingTimeTicks % 36000000000) / 600000000);
    const seconds = Math.floor((remainingTimeTicks % 600000000) / 10000000);
    const r = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    return r;
  };
  
  const getProgressPercentage = () => {
    return Math.round(100 / session.NowPlayingItem?.RunTimeTicks * (session.NowPlayingItem?.RunTimeTicks - remainingTicks));
  //}, [remainingTicks]);
  };

  useEffect(() => {
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    const remainingTimeTicks = duration - currentTime;
    setRemainingTicks(remainingTimeTicks);
  }, [session]);

  useInterval(tick, 1000);

  return (
    <View className="flex flex-col shadow-md rounded-lg m-2">
     <ImageBackground 
     className="flex"
  resizeMode="cover" 
  source={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
  blurRadius={1} 
>
    <View className="flex-row w-full p-5">
        <View className="w-20 pr-4">
          <Poster
            id={session.NowPlayingItem.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className="w-full">
          <Text className="font-bold">
            {session.NowPlayingItem?.Name}
          </Text>
          <Text className="text-sm font-bold">{session.UserName}</Text>
          <Text className="">{getRemainingTime()} left</Text>
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
      <TranscodingView session={session} />
      </ImageBackground>
    </View>
  );
};

interface transcodingInfoProps {
  transcodingInfo: TranscodingInfo;
  item: BaseItemDto;
}

const TranscodingView = ({ session }: SessionCardProps) => {
  const videoStream = useMemo(() => {
    return session.NowPlayingItem?.MediaStreams?.filter(
      (s) => s.Type == "Video"
    )[0];
  }, [session]);

  const audioStream = useMemo(() => {
    return session.NowPlayingItem?.MediaStreams?.filter(
      (s) => s.Type == "Audio"
    )[0];
  }, [session]);


  const subtitleStream = useMemo(() => {
    const subtitleIndex = session.PlayState?.SubtitleStreamIndex;
    return subtitleIndex !== null && subtitleIndex !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[subtitleIndex]
      : undefined;
  }, [session]);


  const isTranscoding = useMemo(() => {
    return session.PlayState?.PlayMethod == "Transcode";
  }, [session]);

  return (
      <View className="flex flex-col p-4 bg-gray-900">
        <View className="flex flex-row" >
          <Text className="text-sm w-20 font-bold text-right pr-4">Video</Text>
          
          <Text className="text-sm">
            {videoStream?.DisplayTitle}
            {isTranscoding && (
                <>
                {'\n'} -> {session.TranscodingInfo?.Height}p ({session.TranscodingInfo?.VideoCodec} {Math.round(session.TranscodingInfo?.Bitrate / 1000000)} Mbps)
                </>
            )}
          </Text>
        </View>

        <View className="flex mt-1 flex-row">
            <Text className="text-sm w-20 font-bold text-right pr-4">Audio</Text>
            
          <Text className="text-sm">
            {/* {audioStream?.DisplayTitle} */}
            {audioStream?.Codec}
            {!session.TranscodingInfo?.IsAudioDirect && (
                <>
                {'\n'} -> {session.TranscodingInfo?.AudioCodec}
                </>
            )}
          </Text>
      </View>
      {subtitleStream && (
      <>
      <View className="flex mt-1 flex-row">
          <Text className="text-sm w-20 font-bold text-right pr-4">Subtitle</Text>

            <Text className="text-sm">
              {subtitleStream.DisplayTitle}
              {/* {!session.TranscodingInfo?.IsAudioDirect && (
                <>
                  {'\n'} -> {session.TranscodingInfo?.AudioCodec}
                </>
              )} */}
            </Text>
          </View></>
        )}
        
      </View>
  );
};



// const StreamValue = ({ mediaSource, transcodeInfo }: SessionCardProps) => {
//   const mediaSource = useMemo(() => {
//     return session.NowPlayingItem?.MediaStreams?.filter(
//       (s) => s.Type == "Video"
//     )[0];
//   }, [session]);
//   console.log(mediaSource);
//   return (
//       <View className="flex-row w-full pr-4">
//         <View className="pr-4">
//           <Text className="text-lg font-bold">Video</Text>
//         </View>
//         <View className="pr-4">
//         <Text className="text-lg font-bold">
//           { mediaSource?.DisplayTitle }
//             { session.PlayState?.PlayMethod} 

//             {/* {mediaSource.Name} */}
//             {session.TranscodingInfo?.VideoCodec} */}
//           </Text>
//         </View>
//       </View>
//   );
// };
