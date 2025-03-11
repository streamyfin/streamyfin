import { Stepper } from "@/components/inputs/Stepper";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadMethod, Settings, useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Platform, Switch, TouchableOpacity } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";
import DisabledSetting from "@/components/settings/DisabledSetting";

export default function DownloadSettings({ ...props }) {
  const [settings, updateSettings, pluginSettings] = useSettings();
  const { setProcesses } = useDownload();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const allDisabled = useMemo(
    () =>
      pluginSettings?.downloadMethod?.locked === true &&
      pluginSettings?.remuxConcurrentLimit?.locked === true &&
      pluginSettings?.autoDownload.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={allDisabled} {...props} className="mb-4">
      <ListGroup title={t("home.settings.downloads.downloads_title")}>
        <ListItem
          title={t("home.settings.downloads.download_method")}
          disabled={pluginSettings?.downloadMethod?.locked}
        >
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings.downloadMethod === DownloadMethod.Remux
                    ? t("home.settings.downloads.default")
                    : t("home.settings.downloads.optimized")}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              loop={true}
              side="bottom"
              align="start"
              alignOffset={0}
              avoidCollisions={true}
              collisionPadding={8}
              sideOffset={8}
            >
              <DropdownMenu.Label>
                {t("home.settings.downloads.download_method")}
              </DropdownMenu.Label>
              <DropdownMenu.Item
                key="1"
                onSelect={() => {
                  updateSettings({ downloadMethod: DownloadMethod.Remux });
                  setProcesses([]);
                }}
              >
                <DropdownMenu.ItemTitle>
                  {t("home.settings.downloads.default")}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                key="2"
                onSelect={() => {
                  updateSettings({ downloadMethod: DownloadMethod.Optimized });
                  setProcesses([]);
                  queryClient.invalidateQueries({ queryKey: ["search"] });
                }}
              >
                <DropdownMenu.ItemTitle>
                  {t("home.settings.downloads.optimized")}
                </DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </ListItem>

        <ListItem
          title={t("home.settings.downloads.remux_max_download")}
          disabled={
            pluginSettings?.remuxConcurrentLimit?.locked ||
            settings.downloadMethod !== DownloadMethod.Remux
          }
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

        <ListItem
          title={t("home.settings.downloads.auto_download")}
          disabled={
            pluginSettings?.autoDownload?.locked ||
            settings.downloadMethod !== DownloadMethod.Optimized
          }
        >
          <Switch
            disabled={
              pluginSettings?.autoDownload?.locked ||
              settings.downloadMethod !== DownloadMethod.Optimized
            }
            value={settings.autoDownload}
            onValueChange={(value) => updateSettings({ autoDownload: value })}
          />
        </ListItem>

        <ListItem
          disabled={
            pluginSettings?.optimizedVersionsServerUrl?.locked ||
            settings.downloadMethod !== DownloadMethod.Optimized
          }
          onPress={() => router.push("/settings/optimized-server/page")}
          showArrow
          title={t("home.settings.downloads.optimized_versions_server")}
        ></ListItem>
      </ListGroup>
    </DisabledSetting>
  );
}
