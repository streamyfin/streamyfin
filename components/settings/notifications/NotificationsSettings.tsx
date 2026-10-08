import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { NOTIFICATION_FAMILIES } from "@/constants/Notifications";
import { useAwaitedTitles } from "@/hooks/useAwaitedTitles";
import { useMyNotifications } from "@/hooks/useMyNotifications";
import {
  type MyEvent,
  withEvent,
  withFollow,
  withLibrary,
} from "@/utils/notificationPreferences";
import { openNotificationSettings } from "@/utils/openNotificationSettings";
import { EVENT_LABELS } from "./eventLabels";
import { NotificationPauseRow } from "./NotificationPauseRow";
import { NotificationPermissionBanner } from "./NotificationPermissionBanner";

const footer = (text: string) => (
  <Text className='text-xs text-neutral-500'>{text}</Text>
);

/**
 * What the signed in person gets from this server: a pause, then the events by theme. The
 * plugin only describes what can reach them, so a group with nothing in it is not shown.
 */
export const NotificationsSettings: React.FC = () => {
  const { t } = useTranslation();
  const {
    mine,
    supported,
    isLoading,
    isError,
    update,
    pause,
    resume,
    unmute,
    refetch,
  } = useMyNotifications();
  const awaited = useAwaitedTitles();

  if (!supported) {
    return (
      <Text className='px-4 text-neutral-500'>
        {t("home.settings.notifications.unsupported")}
      </Text>
    );
  }

  if (!mine) {
    if (isLoading) return <Loader />;
    if (!isError) return null;
    return (
      <View>
        <Text className='mb-4 px-4 text-neutral-500'>
          {t("home.settings.notifications.load_failed")}
        </Text>
        <ListGroup>
          <ListItem
            title={t("home.settings.notifications.try_again")}
            textColor='blue'
            onPress={() => void refetch()}
          />
        </ListGroup>
      </View>
    );
  }

  const family = (name: string) =>
    mine.events.filter((event) => event.family === name);
  const eventRow = (event: MyEvent) => {
    const label = EVENT_LABELS[event.key];
    return (
      <ListItem
        key={event.key}
        title={t(label?.title ?? event.key)}
        subtitle={label?.help ? t(label.help) : undefined}
      >
        <SettingSwitch
          testID={`event-${event.key}`}
          value={event.enabled}
          onValueChange={(on) => update(withEvent(mine, event.key, on))}
        />
      </ListItem>
    );
  };

  const newContent = family(NOTIFICATION_FAMILIES.newContent);
  const newContentOn = newContent.some((event) => event.enabled);
  const yours = [
    ...family(NOTIFICATION_FAMILIES.requests),
    ...family(NOTIFICATION_FAMILIES.account),
  ];
  const server = family(NOTIFICATION_FAMILIES.serverAlerts);

  return (
    <View>
      <NotificationPermissionBanner />

      <View className='mb-4'>
        <NotificationPauseRow
          pause={mine.pause}
          onPause={pause}
          onResume={resume}
        />
      </View>

      {newContent.length > 0 && (
        <>
          <View className='mb-4'>
            <ListGroup title={t("home.settings.notifications.groups.new")}>
              {newContent.map(eventRow)}
            </ListGroup>
          </View>

          {mine.libraries.length > 0 && (
            <View className='mb-4'>
              <ListGroup
                description={footer(
                  t("home.settings.notifications.libraries_footer"),
                )}
              >
                {mine.libraries.map((library) => (
                  <ListItem
                    key={library.id}
                    title={library.name}
                    disabled={!newContentOn}
                  >
                    <SettingSwitch
                      testID={`library-${library.id}`}
                      value={library.enabled}
                      disabled={!newContentOn}
                      onValueChange={(on) =>
                        update(withLibrary(mine, library.id, on))
                      }
                    />
                  </ListItem>
                ))}
              </ListGroup>
            </View>
          )}

          <View className='mb-4'>
            <ListGroup
              title={t("home.settings.notifications.groups.follow")}
              description={footer(
                t("home.settings.notifications.follow.footer"),
              )}
            >
              <ListItem
                title={t("home.settings.notifications.follow.favorites")}
                subtitle={t(
                  "home.settings.notifications.follow.favorites_help",
                )}
              >
                <SettingSwitch
                  value={mine.follow.favorites}
                  onValueChange={(on) =>
                    update(withFollow(mine, { ...mine.follow, favorites: on }))
                  }
                />
              </ListItem>
              <ListItem
                title={t("home.settings.notifications.follow.started")}
                subtitle={t("home.settings.notifications.follow.started_help")}
              >
                <SettingSwitch
                  value={mine.follow.started}
                  onValueChange={(on) =>
                    update(withFollow(mine, { ...mine.follow, started: on }))
                  }
                />
              </ListItem>
            </ListGroup>
          </View>
        </>
      )}

      {mine.mutedShows.length > 0 && (
        <View className='mb-4'>
          <ListGroup title={t("home.settings.notifications.groups.muted")}>
            {mine.mutedShows.map((show) => (
              <ListItem
                key={show.id}
                title={show.name}
                onPress={() => unmute(show.id)}
              >
                <Text className='text-purple-500'>
                  {t("home.settings.notifications.muted.turn_back_on")}
                </Text>
              </ListItem>
            ))}
          </ListGroup>
        </View>
      )}

      {yours.length > 0 && (
        <View className='mb-4'>
          <ListGroup title={t("home.settings.notifications.groups.yours")}>
            {yours.map(eventRow)}
          </ListGroup>
        </View>
      )}

      {awaited.supported && !!awaited.titles?.length && (
        <View className='mb-4'>
          <ListGroup title={t("home.settings.notifications.groups.awaited")}>
            {awaited.titles.map((title) => (
              <ListItem
                key={`${title.mediaType}-${title.tmdbId}`}
                title={title.title}
                subtitle={
                  title.arrived
                    ? t("home.settings.notifications.awaited.arrived")
                    : title.year?.toString()
                }
                onPress={() => awaited.remove(title.mediaType, title.tmdbId)}
              >
                <Text className='text-purple-500'>
                  {t("home.settings.notifications.awaited.stop")}
                </Text>
              </ListItem>
            ))}
          </ListGroup>
        </View>
      )}

      {server.length > 0 && (
        <View className='mb-4'>
          <ListGroup title={t("home.settings.notifications.groups.server")}>
            {server.map(eventRow)}
          </ListGroup>
        </View>
      )}

      {Platform.OS === "android" && (
        <View className='mb-4'>
          <ListGroup>
            <ListItem
              title={t("home.settings.notifications.sound.title")}
              subtitle={t("home.settings.notifications.sound.help")}
              showArrow
              onPress={() => void openNotificationSettings()}
            />
          </ListGroup>
        </View>
      )}

      <Text className='px-4 text-xs text-neutral-500'>
        {t("home.settings.notifications.account_footer")}
      </Text>
    </View>
  );
};
