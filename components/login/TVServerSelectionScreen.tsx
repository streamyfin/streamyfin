import { Image } from "expo-image";
import { t } from "i18next";
import React, { useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import type { SavedServer } from "@/utils/secureCredentials";
import { TVAddIcon } from "./TVAddIcon";
import { TVServerIcon } from "./TVServerIcon";

interface TVServerSelectionScreenProps {
  onServerSelect: (server: SavedServer) => void;
  onAddServer: () => void;
  onDeleteServer: (server: SavedServer) => void;
  disabled?: boolean;
}

export const TVServerSelectionScreen: React.FC<
  TVServerSelectionScreenProps
> = ({ onServerSelect, onAddServer, onDeleteServer, disabled = false }) => {
  const typography = useScaledTVTypography();
  const [_previousServers] = useMMKVString("previousServers");

  const previousServers = useMemo(() => {
    try {
      return JSON.parse(_previousServers || "[]") as SavedServer[];
    } catch {
      return [];
    }
  }, [_previousServers]);

  const hasServers = previousServers.length > 0;

  const handleDeleteServer = (server: SavedServer) => {
    Alert.alert(
      t("server.remove_server"),
      t("server.remove_server_description", {
        server: server.name || server.address,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => onDeleteServer(server),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: scaleSize(60),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          width: "100%",
          alignItems: "center",
          paddingHorizontal: scaleSize(60),
        }}
      >
        {/* Logo */}
        <View style={{ alignItems: "center", marginBottom: scaleSize(16) }}>
          <Image
            source={require("@/assets/images/icon-ios-plain.png")}
            style={{ width: scaleSize(150), height: scaleSize(150) }}
            contentFit='contain'
          />
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: typography.title,
            fontWeight: "bold",
            color: "#FFFFFF",
            textAlign: "center",
            marginBottom: scaleSize(8),
          }}
        >
          Streamyfin
        </Text>
        <Text
          style={{
            fontSize: typography.body,
            color: "#9CA3AF",
            textAlign: "center",
            marginBottom: scaleSize(48),
          }}
        >
          {hasServers
            ? t("server.select_your_server")
            : t("server.add_server_to_get_started")}
        </Text>

        {/* Server Icons Grid */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: scaleSize(20),
            gap: scaleSize(24),
          }}
          style={{ overflow: "visible" }}
        >
          {previousServers.map((server, index) => (
            <TVServerIcon
              key={server.address}
              name={server.name || ""}
              address={server.address}
              onPress={() => onServerSelect(server)}
              onLongPress={() => handleDeleteServer(server)}
              hasTVPreferredFocus={index === 0}
              disabled={disabled}
            />
          ))}

          {/* Add Server Button */}
          <TVAddIcon
            label={t("server.add_server")}
            onPress={onAddServer}
            hasTVPreferredFocus={!hasServers}
            disabled={disabled}
          />
        </ScrollView>
      </View>
    </ScrollView>
  );
};
