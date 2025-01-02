import { useGlobalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, View } from "react-native";
import YoutubePlayer, { PLAYER_STATES } from "react-native-youtube-iframe";
import { useTranslation } from "react-i18next";

export default function page() {
  const searchParams = useGlobalSearchParams();
  const { t } = useTranslation();
  console.log(searchParams);

  const { url } = searchParams as { url: string };

  const videoId = useMemo(() => {
    return url.split("v=")[1];
  }, [url]);

  const [playing, setPlaying] = useState(false);

  const onStateChange = useCallback((state: PLAYER_STATES) => {
    if (state === "ended") {
      setPlaying(false);
      Alert.alert(t("player.video_has_finished_playing"));
    }
  }, []);

  const togglePlaying = useCallback(() => {
    setPlaying((prev) => !prev);
  }, []);

  useEffect(() => {
    togglePlaying();
  }, []);

  const screenWidth = Dimensions.get("screen").width;

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
