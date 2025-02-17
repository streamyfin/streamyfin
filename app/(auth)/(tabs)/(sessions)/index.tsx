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

export default function index() {
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

export const SessionCard = ({
  session
}: SessionCardProps) => {
  const api = useAtomValue(apiAtom);

return (
    <View className='flex flex-row p-4 shadow-md rounded-lg m-2'>
    <View className='h-16 w-24 pr-4'>
      <Poster id={session.NowPlayingItem.Id} url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })} />
 </View>
      <View className='flex-1'>
        <Text className='text-lg font-bold'>{session.NowPlayingItem?.Name}</Text>
        <Text className='text-gray-600'>date</Text>
      </View>
    </View>
  );
};

