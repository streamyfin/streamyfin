import { Stepper } from "@/components/inputs/Stepper";
import { useDownload } from "@/providers/DownloadProvider";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Switch, TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "@/components/DropdownMenu";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const DownloadSettings: React.FC = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();
  const { setProcesses } = useDownload();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (!settings) return null;

  return (
    <View {...props} className="mb-4">
      <ListGroup title="Downloads">
        <ListItem title="Download method">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings.downloadMethod === "remux"
                    ? "Default"
                    : "Optimized"}
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
          title="Remux max download"
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
          title="Auto download"
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
          title="Optimized Versions Server"
        ></ListItem>
      </ListGroup>
    </View>
  );
};
