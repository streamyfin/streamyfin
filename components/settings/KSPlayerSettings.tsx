import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Switch } from "react-native";
import { setHardwareDecode } from "@/modules/sf-player";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const KSPlayerSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const handleHardwareDecodeChange = useCallback(
    (value: boolean) => {
      updateSettings({ ksHardwareDecode: value });
      setHardwareDecode(value);
    },
    [updateSettings],
  );

  if (Platform.OS !== "ios" || !settings) return null;

  return (
    <ListGroup
      title={t("home.settings.subtitles.ksplayer_title")}
      className='mt-4'
    >
      <ListItem
        title={t("home.settings.subtitles.hardware_decode")}
        subtitle={t("home.settings.subtitles.hardware_decode_description")}
      >
        <Switch
          value={settings.ksHardwareDecode}
          onValueChange={handleHardwareDecodeChange}
        />
      </ListItem>
    </ListGroup>
  );
};
