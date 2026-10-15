import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";

interface Props {
  onRetry: () => void;
}

/**
 * Shown in place of a music list whose first page failed to load. Without it
 * the list would read as empty, with no pull to refresh to try again.
 */
export const MusicLoadError: React.FC<Props> = ({ onRetry }) => {
  const { t } = useTranslation();

  return (
    <View className='flex-1 justify-center items-center bg-black px-6'>
      <Text className='text-neutral-500 text-center mb-4'>
        {t("common.something_went_wrong")}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole='button'
        className='bg-purple-600 px-6 py-3 rounded-full'
      >
        <Text className='text-white font-semibold'>{t("home.retry")}</Text>
      </TouchableOpacity>
    </View>
  );
};
