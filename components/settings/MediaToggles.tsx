import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { SettingsStepperRow } from "@/components/settings/index/SettingsStepperRow";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";

interface Props extends ViewProps {}

export const MediaToggles: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const { settings, updateSettings, pluginSettings } = useSettings();

  const disabled = useMemo(
    () =>
      pluginSettings?.forwardSkipTime?.locked === true &&
      pluginSettings?.rewindSkipTime?.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup title={t("home.settings.media_controls.media_controls_title")}>
        <SettingsStepperRow
          title={t("home.settings.media_controls.forward_skip_length")}
          disabled={pluginSettings?.forwardSkipTime?.locked}
          value={settings.forwardSkipTime}
          step={5}
          appendValue={t("home.settings.media_controls.seconds_unit")}
          min={0}
          max={60}
          onUpdate={(forwardSkipTime) => updateSettings({ forwardSkipTime })}
        />

        <SettingsStepperRow
          title={t("home.settings.media_controls.rewind_length")}
          disabled={pluginSettings?.rewindSkipTime?.locked}
          value={settings.rewindSkipTime}
          step={5}
          appendValue={t("home.settings.media_controls.seconds_unit")}
          min={0}
          max={60}
          onUpdate={(rewindSkipTime) => updateSettings({ rewindSkipTime })}
        />
      </ListGroup>
    </DisabledSetting>
  );
};
