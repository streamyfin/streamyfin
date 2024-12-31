import { useGlobalSearchParams, useNavigation } from "expo-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Button, Dimensions } from "react-native";
import { Alert, View } from "react-native";
import YoutubePlayer, { PLAYER_STATES } from "react-native-youtube-iframe";

export default function page() {
  const searchParams = useGlobalSearchParams();
  const navigation = useNavigation();
  console.log(searchParams);

  const { url } = searchParams as { url: string };

  const videoId = useMemo(() => {
    return url.split("v=")[1];
  }, [url]);

  const [playing, setPlaying] = useState(false);

  const onStateChange = useCallback((state: PLAYER_STATES) => {
    if (state === "ended") {
      setPlaying(false);
      Alert.alert("video has finished playing!");
    }
  }, []);

  const togglePlaying = useCallback(() => {
    setPlaying((prev) => !prev);
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });

    togglePlaying();
  }, []);

  const screenWidth = Dimensions.get("screen").width;
  const screenHeight = Dimensions.get("screen").height;

  return (
    <View className="flex flex-col bg-black items-center justify-center h-full">
      <YoutubePlayer
        height={300}
        play={playing}
        videoId={videoId}
        onChangeState={onStateChange}
        width={screenWidth}
      />
    </View>
  );
}
