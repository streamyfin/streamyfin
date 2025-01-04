import { Stepper } from "@/components/inputs/Stepper";
import { useDownload } from "@/providers/DownloadProvider";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Switch, TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";

export const DownloadSettings: React.FC = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();
  const { setProcesses } = useDownload();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <View {...props} className="mb-4">
      <ListGroup title={t("home.settings.downloads.downloads_title")}>
        <ListItem title={t("home.settings.downloads.download_method")}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings.downloadMethod === "remux"
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
              <DropdownMenu.Label>Methods</DropdownMenu.Label>
              <DropdownMenu.Item
                key="1"
                onSelect={() => {
                  updateSettings({ downloadMethod: "remux" });
                  setProcesses([]);
                }}
              >
                <DropdownMenu.ItemTitle>Default</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                key="2"
                onSelect={() => {
                  updateSettings({ downloadMethod: "optimized" });
                  setProcesses([]);
                  queryClient.invalidateQueries({ queryKey: ["search"] });
                }}
              >
                <DropdownMenu.ItemTitle>Optimized</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </ListItem>

        <ListItem
          title={t("home.settings.downloads.remux_max_download")}
          disabled={settings.downloadMethod !== "remux"}
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
          disabled={settings.downloadMethod !== "optimized"}
        >
          <Switch
            disabled={settings.downloadMethod !== "optimized"}
            value={settings.autoDownload}
            onValueChange={(value) => updateSettings({ autoDownload: value })}
          />
        </ListItem>

        <ListItem
          disabled={settings.downloadMethod !== "optimized"}
          onPress={() => router.push("/settings/optimized-server/page")}
          showArrow
          title={t("home.settings.downloads.optimized_versions_server")}
        ></ListItem>
      </ListGroup>
    </View>
  );
};
