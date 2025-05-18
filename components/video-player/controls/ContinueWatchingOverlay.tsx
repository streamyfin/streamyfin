import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { useRouter } from "expo-router";
import { t } from "i18next";
import React from "react";
import { View } from "react-native";

export interface ContinueWatchingOverlayProps {
  goToNextItem: (options: {
    isAutoPlay: boolean;
    resetWatchCount: boolean;
  }) => void;
}

const ContinueWatchingOverlay: React.FC<ContinueWatchingOverlayProps> = ({
  goToNextItem,
}) => {
  const [settings] = useSettings();
  const router = useRouter();

  return settings.autoPlayEpisodeCount >=
    settings.maxAutoPlayEpisodeCount.value ? (
    <View
      className={
        "absolute top-0 bottom-0 left-0 right-0 flex flex-col px-4 items-center justify-center bg-[#000000B3]"
      }
    >
      <Text className='text-2xl font-bold text-white py-4 '>
        Are you still watching ?
      </Text>
      <Button
        onPress={() => {
          goToNextItem({ isAutoPlay: false, resetWatchCount: true });
        }}
        color={"purple"}
        className='my-4 w-2/3'
      >
        {t("player.continue_watching")}
      </Button>

      <Button onPress={router.back} color={"transparent"} className='w-2/3'>
        {t("player.go_back")}
      </Button>
    </View>
  ) : null;
};

export default ContinueWatchingOverlay;
