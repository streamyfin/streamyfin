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

  const { title, message, icon } = {
    low_space: {
      title: t("home.downloads.next_episodes.low_space_title"),
      message: t("home.downloads.next_episodes.low_space", {
        size: NEXT_EPISODES_MIN_FREE_BYTES.bytesToReadable(0),
      }),
      icon: "warning-outline" as const,
    },
    waiting_for_wifi: {
      title: t("home.downloads.next_episodes.waiting_for_wifi_title"),
      message: t("home.downloads.next_episodes.waiting_for_wifi"),
      icon: "wifi-outline" as const,
    },
    waiting_for_home_network: {
      title: t("home.downloads.next_episodes.waiting_for_home_network_title"),
      message: t("home.downloads.next_episodes.waiting_for_home_network"),
      icon: "home-outline" as const,
    },
    home_network_not_set_up: {
      title: t("home.downloads.next_episodes.home_network_not_set_up_title"),
      message: t("home.downloads.next_episodes.home_network_not_set_up"),
      icon: "home-outline" as const,
    },
  }[hold];
  // What is missing is set up under Network; everything else is a download
  // setting.
  const opensNetworkSettings = hold === "home_network_not_set_up";

  return (
    <View {...props}>
      <TouchableOpacity
        accessibilityRole='button'
        accessibilityHint={
          opensNetworkSettings
            ? t("home.downloads.next_episodes.open_network_settings")
            : t("home.downloads.next_episodes.open_settings")
        }
        onPress={() =>
          router.push(
            opensNetworkSettings
              ? "/settings/network/page"
              : "/settings/downloads/page",
          )
        }
        className='bg-neutral-900 p-4 rounded-2xl flex flex-row items-center'
      >
        <Ionicons name={icon} size={22} color='#f59e0b' />
        <View className='flex-1 ml-3'>
          <Text className='font-bold'>{title}</Text>
          <Text className='opacity-70 text-sm'>{message}</Text>
        </View>
        <Ionicons name='chevron-forward' size={18} color='#5A5960' />
      </TouchableOpacity>
    </View>
  );
};
