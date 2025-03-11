import React, { useMemo } from "react";
import { ViewProps } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { Stepper } from "@/components/inputs/Stepper";

interface Props extends ViewProps {}

export const MediaToggles: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const [settings, updateSettings, pluginSettings] = useSettings();

  if (!settings) return null;

  const disabled = useMemo(
    () =>
      pluginSettings?.forwardSkipTime?.locked === true &&
      pluginSettings?.rewindSkipTime?.locked === true,
    [pluginSettings],
  );

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup title={t("home.settings.media_controls.media_controls_title")}>
        <ListItem
          title={t("home.settings.media_controls.forward_skip_length")}
          disabled={pluginSettings?.forwardSkipTime?.locked}
        >
          <Stepper
            value={settings.forwardSkipTime}
            disabled={pluginSettings?.forwardSkipTime?.locked}
            step={5}
            appendValue={t("home.settings.media_controls.seconds_unit")}
            min={0}
            max={60}
            onUpdate={(forwardSkipTime) => updateSettings({ forwardSkipTime })}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.media_controls.rewind_length")}
          disabled={pluginSettings?.rewindSkipTime?.locked}
        >
          <Stepper
            value={settings.rewindSkipTime}
            disabled={pluginSettings?.rewindSkipTime?.locked}
            step={5}
            appendValue={t("home.settings.media_controls.seconds_unit")}
            min={0}
            max={60}
            onUpdate={(rewindSkipTime) => updateSettings({ rewindSkipTime })}
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
