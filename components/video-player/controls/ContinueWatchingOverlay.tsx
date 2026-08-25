import { deactivateKeepAwake } from "expo-keep-awake";
import { t } from "i18next";
import React, { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";

export interface ContinueWatchingOverlayProps {
  goToNextItem: (options: {
    isAutoPlay: boolean;
    resetWatchCount: boolean;
  }) => void;
}

const ContinueWatchingOverlay: React.FC<ContinueWatchingOverlayProps> = ({
  goToNextItem,
}) => {
  const router = useRouter();

  // Let the screen sleep while the prompt waits for an answer. The player's
  // pause handler releases the wake lock too, but mpv can reach EOF without
  // emitting a pause event — this covers that path. Choosing "Continue
  // watching" re-acquires it via the next episode's playing event.
  useEffect(() => {
    deactivateKeepAwake().catch(() => {});
  }, []);

  return (
    <View
      className={
        "absolute top-0 bottom-0 left-0 right-0 z-50 flex flex-col px-4 items-center justify-center bg-[#000000B3]"
      }
    >
      <Text className='text-2xl font-bold text-white py-4 '>
        {t("player.still_watching")}
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
  );
};

export default ContinueWatchingOverlay;
