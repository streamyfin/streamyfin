import { Text } from "@/components/common/Text";
import { useSessions } from "@/hooks/useSessions";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View } from "react-native";
import { Loader } from "@/components/Loader";
import { Alert } from "react-native";
import { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client";
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
    //console.log(remainingTicks - 1000);
    setRemainingTicks(remainingTicks - 1000);
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
    //setRemainingTime(r);
  };

  useEffect(() => {
    //console.log(session.TranscodingInfo?.VideoCodec);
    //console.log(session.TranscodingInfo?.IsVideoDirect);
    //console.log(session.PlayState);
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    const remainingTimeTicks = duration - currentTime;
    setRemainingTicks(remainingTimeTicks);
  }, [session]);
  
  const mediaSource = useCallback(() => {
   const Id = session.PlayState?.MediaSourceId;
   return session.NowPlayingItem?.MediaSources.filter((s) => s.Id == Id).first();
  }, [session]);

  //useEffect(() => {
  //  getRemainingTime(session.NowPlayingItem)
  //}, []);

  useInterval(tick, 1000);

  return (
    <View className="flex flex-col p-4 shadow-md rounded-lg m-2">
      <View className="flex-row w-full">
        <View className="w-24 pr-4">
          <Poster
            id={session.NowPlayingItem.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className="">
          <Text className="text-lg font-bold">
            {session.NowPlayingItem?.Name}
          </Text>
          <Text className="text-gray-600">{getRemainingTime()}</Text>
          <Text className="text-lg font-bold">{session.UserName}</Text>
        </View>
      </View>
      <View className="flex-row w-full pr-4">
        <View className="pr-4">
        <Text className="text-lg font-bold">Video</Text>
        </View>
        <View className="pr-4">
           <Text className="text-lg font-bold">
           {session.PlayState?.PlayMethod}
           
           {mediaSource.Name}
           {session.TranscodingInfo?.VideoCodec}
           </Text>
        </View>
      </View>
    </View>
  );
};
