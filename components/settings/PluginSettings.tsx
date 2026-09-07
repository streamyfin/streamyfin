import * as Sentry from "@sentry/react-native";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import useRouter from "@/hooks/useAppRouter";
import { useSettings } from "@/utils/atoms/settings";
import { sentryDebugInDev } from "@/utils/sentry";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PluginSettings = () => {
  const { settings, updateSettings, pluginSettings } = useSettings();

  // The lock must be visible: updateSettings drops the write for locked keys,
  // so an unlocked-looking switch would read as broken rather than pinned.
  const sentryLocked = pluginSettings?.sentryEnabled?.locked === true;

  const router = useRouter();

  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <ListGroup
      title={t("home.settings.plugins.plugins_title")}
      className='mb-4'
    >
      <ListItem
        onPress={() => router.push("/settings/plugins/jellyseerr/page")}
        title='Jellyseerr'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/streamystats/page")}
        title='Streamystats'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/marlin-search/page")}
        title='Marlin Search'
        showArrow
      />
      <ListItem
        onPress={() => router.push("/settings/plugins/kefinTweaks/page")}
        title='KefinTweaks'
        showArrow
      />
      {/* Lookups the client makes directly, without going through Jellyfin. */}
      <ListItem
        title={t("home.settings.plugins.wikidata_awards")}
        subtitle={t("home.settings.plugins.wikidata_awards_hint")}
      >
        <SettingSwitch
          value={settings.wikidataAwardsEnabled}
          onValueChange={(value) =>
            updateSettings({ wikidataAwardsEnabled: value })
          }
        />
      </ListItem>
      <ListItem
        title={t("home.settings.plugins.opensubtitles_enabled")}
        subtitle={t("home.settings.plugins.opensubtitles_enabled_hint")}
      >
        <SettingSwitch
          value={settings.openSubtitlesEnabled}
          onValueChange={(value) =>
            updateSettings({ openSubtitlesEnabled: value })
          }
        />
      </ListItem>
      <ListItem
        title={t("home.settings.plugins.crash_reports")}
        subtitle={t("home.settings.plugins.crash_reports_hint")}
        disabledByAdmin={sentryLocked}
      >
        <SettingSwitch
          value={settings.sentryEnabled}
          disabled={sentryLocked}
          onValueChange={(value) => updateSettings({ sentryEnabled: value })}
        />
      </ListItem>
      {/* Dev-only smoke test for the Sentry pipeline; never ships in release.
          Dev builds don't report unless EXPO_PUBLIC_SENTRY_DEBUG=1, so the
          button is hidden when the event would go nowhere. */}
      {__DEV__ && sentryDebugInDev && settings.sentryEnabled && (
        <ListItem
          title='Send test error to Sentry'
          textColor='blue'
          onPress={() => {
            Sentry.captureException(
              new Error("Sentry test error — safe to ignore"),
            );
            toast.success("Test error sent");
          }}
        />
      )}
    </ListGroup>
  );
};
