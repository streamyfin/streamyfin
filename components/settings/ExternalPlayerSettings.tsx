import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { EXTERNAL_PLAYER_MODES } from "@/constants/ExternalPlayer";
import { isExternalPlayerSupported, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { EXTERNAL_PLAYER_MODE_LABEL_KEYS } from "./externalPlayerModeLabel";

/**
 * Lets the user play downloaded items, or every item, in another player app.
 * Renders nothing on a platform that cannot hand media over.
 */
export const ExternalPlayerSettings: React.FC<ViewProps> = ({ ...props }) => {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const locked = pluginSettings?.externalPlayerMode?.locked;

  const modeOptions = useMemo(
    () => [
      {
        options: EXTERNAL_PLAYER_MODES.map((mode) => ({
          type: "radio" as const,
          label: t(EXTERNAL_PLAYER_MODE_LABEL_KEYS[mode]),
          value: mode,
          selected: mode === settings?.externalPlayerMode,
          onPress: () => updateSettings({ externalPlayerMode: mode }),
        })),
      },
    ],
    [settings?.externalPlayerMode, updateSettings, t],
  );

  if (!isExternalPlayerSupported || !settings) return null;

  // A mode this build does not know (the plugin can push one) plays as off.
  const currentLabelKey =
    EXTERNAL_PLAYER_MODE_LABEL_KEYS[settings.externalPlayerMode] ??
    EXTERNAL_PLAYER_MODE_LABEL_KEYS.off;

  return (
    <ListGroup
      title={t("home.settings.external_player.title")}
      description={
        <Text className='text-[#8E8D91] text-xs'>
          {t("home.settings.external_player.note")}{" "}
          {t("home.settings.external_player.choose_app_hint")}
        </Text>
      }
      {...props}
    >
      <ListItem
        title={t("home.settings.external_player.mode")}
        disabled={locked}
      >
        <PlatformDropdown
          // A locked setting is not written, so the menu must not open on
          // choices that would do nothing.
          disabled={locked}
          groups={modeOptions}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>{t(currentLabelKey)}</Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
          title={t("home.settings.external_player.mode")}
        />
      </ListItem>
    </ListGroup>
  );
};
