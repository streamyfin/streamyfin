import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
// RNGH Pressable, not RN TouchableOpacity: header buttons don't respond to
// touches on macOS Catalyst with the latter.
import { Pressable } from "react-native-gesture-handler";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerrDownloads } from "@/hooks/useJellyseerrDownloads";

/**
 * Header button that only exists while Jellyseerr has something downloading,
 * badged with how many.
 */
export const JellyseerrDownloadsButton: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { count, enabled } = useJellyseerrDownloads();

  // `enabled` matters as well as the count: a disabled query still hands back
  // whatever it last cached, which would strand a badge on screen after the
  // user disconnects Jellyseerr.
  if (Platform.isTV || !enabled || count === 0) return null;

  return (
    <Pressable
      onPress={() => router.push("/(auth)/(tabs)/(home)/jellyseerr-downloads")}
      className='mr-4 relative'
      accessibilityRole='button'
      accessibilityLabel={t("jellyseerr.downloads.n_downloading", { count })}
      hitSlop={8}
    >
      <Ionicons name='cloud-download-outline' color='white' size={24} />
      {/* Pill, not a fixed circle — "12" and "99+" overflow a 16pt box. */}
      <View className='absolute right-0 top-0 bg-red-600 rounded-full min-w-[16px] h-4 px-1 items-center justify-center'>
        <Text className='text-white text-[10px] font-bold'>
          {count > 99 ? "99+" : count}
        </Text>
      </View>
    </Pressable>
  );
};

export default JellyseerrDownloadsButton;
