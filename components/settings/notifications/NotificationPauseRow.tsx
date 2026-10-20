import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { PAUSE_HOURS } from "@/constants/Notifications";
import type { NotificationPause } from "@/utils/notificationPreferences";
import { pauseState, pauseUntilText } from "./pause";

const PAUSE_LABELS: Record<string, string> = {
  "1": "home.settings.notifications.pause.one_hour",
  "8": "home.settings.notifications.pause.eight_hours",
  "24": "home.settings.notifications.pause.one_day",
  null: "home.settings.notifications.pause.until_on",
};

type Props = {
  pause: NotificationPause | null;
  onPause: (hours: number | null) => void;
  onResume: () => void;
};

/** Pauses every notification for a while, or until turned back on. */
export const NotificationPauseRow: React.FC<Props> = ({
  pause,
  onPause,
  onResume,
}) => {
  const { t, i18n } = useTranslation();
  const { paused, until } = pauseState(pause, new Date());

  const current = !paused
    ? t("home.settings.notifications.pause.off")
    : until
      ? t("home.settings.notifications.pause.until", {
          when: pauseUntilText(until, new Date(), i18n?.language),
        })
      : t("home.settings.notifications.pause.until_on");

  const groups = useMemo(
    () => [
      {
        options: [
          {
            type: "radio" as const,
            label: t("home.settings.notifications.pause.off"),
            value: "off",
            selected: !paused,
            onPress: () => {
              if (paused) onResume();
            },
          },
          // A timed pause is not shown as chosen: picking one starts it again from now.
          ...PAUSE_HOURS.map((hours) => ({
            type: "radio" as const,
            label: t(PAUSE_LABELS[String(hours)]),
            value: String(hours),
            selected: hours === null && paused && until === null,
            onPress: () => onPause(hours),
          })),
        ],
      },
    ],
    [paused, until, onPause, onResume, t],
  );

  return (
    <ListGroup>
      <ListItem title={t("home.settings.notifications.pause.title")}>
        <PlatformDropdown
          groups={groups}
          title={t("home.settings.notifications.pause.title")}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text
                className={`mr-1 ${paused ? "text-purple-500" : "text-[#8E8D91]"}`}
              >
                {current}
              </Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
        />
      </ListItem>
    </ListGroup>
  );
};
