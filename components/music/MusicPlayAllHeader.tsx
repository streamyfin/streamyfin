import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";

interface Props {
  onPlayAll: () => void;
  onShuffle: () => void;
  /** A queue is being fetched: the buttons wait for it. */
  isStarting: boolean;
  /** Shown under the buttons, e.g. how many songs the list holds. */
  subtitle?: string;
  /** The folder switch; left out where there are no subfolders to reach. */
  includeSubfolders?: {
    value: boolean;
    onChange: (value: boolean) => void;
  };
}

/** Play all and Shuffle above a song list, in the style of the album and playlist pages. */
export const MusicPlayAllHeader: React.FC<Props> = ({
  onPlayAll,
  onShuffle,
  isStarting,
  subtitle,
  includeSubfolders,
}) => {
  const { t } = useTranslation();

  return (
    <View className='px-4 pt-4 pb-2'>
      <View className='flex flex-row items-center'>
        <TouchableOpacity
          onPress={onPlayAll}
          disabled={isStarting}
          accessibilityRole='button'
          className='flex flex-row items-center bg-purple-600 px-6 py-3 rounded-full mr-3'
        >
          {isStarting ? (
            <ActivityIndicator size={20} color='white' />
          ) : (
            <Ionicons name='play' size={20} color='white' />
          )}
          <Text className='text-white font-medium ml-2'>
            {t("library.play_all")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onShuffle}
          disabled={isStarting}
          accessibilityRole='button'
          className='flex flex-row items-center bg-neutral-800 px-6 py-3 rounded-full'
        >
          <Ionicons name='shuffle' size={20} color='white' />
          <Text className='text-white font-medium ml-2'>
            {t("music.shuffle")}
          </Text>
        </TouchableOpacity>
      </View>
      {includeSubfolders && (
        <View className='flex flex-row items-center justify-between mt-3'>
          <Text className='text-neutral-300'>
            {t("music.include_subfolders")}
          </Text>
          <SettingSwitch
            value={includeSubfolders.value}
            onValueChange={includeSubfolders.onChange}
            accessibilityLabel={t("music.include_subfolders")}
          />
        </View>
      )}
      {subtitle ? (
        <Text className='text-neutral-500 text-sm mt-3'>{subtitle}</Text>
      ) : null}
    </View>
  );
};
