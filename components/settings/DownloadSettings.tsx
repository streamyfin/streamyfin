import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stepper } from "@/components/inputs/Stepper";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export default function DownloadSettings({ ...props }) {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();

  const allDisabled = useMemo(
    () =>
      pluginSettings?.remuxConcurrentLimit?.locked === true &&
      pluginSettings?.autoDownload.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={allDisabled} {...props} className='mb-4'>
      <ListGroup title={t("home.settings.downloads.downloads_title")}>
        <ListItem
          title={t("home.settings.downloads.remux_max_download")}
          disabled={pluginSettings?.remuxConcurrentLimit?.locked}
        >
          <Stepper
            value={settings.remuxConcurrentLimit}
            step={1}
            min={1}
            max={4}
            onUpdate={(value) =>
              updateSettings({
                remuxConcurrentLimit: value as Settings["remuxConcurrentLimit"],
              })
            }
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
}
