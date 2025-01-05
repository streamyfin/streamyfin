import {TouchableOpacity, View, ViewProps} from "react-native";
import React from "react";
import {Text} from "@/components/common/Text";
import Poster from "@/components/posters/Poster";
import {useRouter, useSegments} from "expo-router";
import {useJellyseerr} from "@/hooks/useJellyseerr";

interface Props {
  id: string
  posterPath?: string
  name: string
  subName?: string
}

const PersonPoster: React.FC<Props & ViewProps> = ({
  id,
  posterPath,
  name,
  subName,
  ...props
}) => {
  const {jellyseerrApi} = useJellyseerr();
  const router = useRouter();
  const segments = useSegments();
  const from = segments[2];

  if (from === "(home)" || from === "(search)" || from === "(libraries)")
    return (
      <TouchableOpacity onPress={() => router.push(`/(auth)/(tabs)/${from}/jellyseerr/${id}`)}>
        <View className="flex flex-col w-28" {...props}>
          <Poster
            id={id}
            url={jellyseerrApi?.imageProxy(posterPath, 'w600_and_h900_bestv2')}
          />
          <Text className="mt-2">{name}</Text>
          {subName && <Text className="text-xs opacity-50">{subName}</Text>}
        </View>
      </TouchableOpacity>
    )
}

export default PersonPoster;