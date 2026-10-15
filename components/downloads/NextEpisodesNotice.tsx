import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { NEXT_EPISODES_MIN_FREE_BYTES } from "@/constants/Downloads";
import useRouter from "@/hooks/useAppRouter";
import { nextEpisodesHoldAtom } from "@/providers/Downloads/nextEpisodesHold";

/**
 * Says why the next episodes of series with a rule are not downloading, so a
 * user who finds nothing new downloaded is not left guessing. Renders nothing
 * while nothing holds them back.
 */
export const NextEpisodesNotice: React.FC<ViewProps> = (props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const hold = useAtomValue(nextEpisodesHoldAtom);

  if (!hold) return null;

  const { title, message } =
    hold === "low_space"
      ? {
          title: t("home.downloads.next_episodes.low_space_title"),
          message: t("home.downloads.next_episodes.low_space", {
            size: NEXT_EPISODES_MIN_FREE_BYTES.bytesToReadable(0),
          }),
        }
      : {
          title: t("home.downloads.next_episodes.waiting_for_wifi_title"),
          message: t("home.downloads.next_episodes.waiting_for_wifi"),
        };

  return (
    <View {...props}>
      <TouchableOpacity
        accessibilityRole='button'
        accessibilityHint={t("home.downloads.next_episodes.open_settings")}
        onPress={() => router.push("/settings/downloads/page")}
        className='bg-neutral-900 p-4 rounded-2xl flex flex-row items-center'
      >
        <Ionicons
          name={hold === "low_space" ? "warning-outline" : "wifi-outline"}
          size={22}
          color='#f59e0b'
        />
        <View className='flex-1 ml-3'>
          <Text className='font-bold'>{title}</Text>
          <Text className='opacity-70 text-sm'>{message}</Text>
        </View>
        <Ionicons name='chevron-forward' size={18} color='#5A5960' />
      </TouchableOpacity>
    </View>
  );
};
