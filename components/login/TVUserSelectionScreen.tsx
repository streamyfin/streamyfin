import { t } from "i18next";
import React, { useCallback } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { scaleSize } from "@/utils/scaleSize";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";
import { TVAddIcon } from "./TVAddIcon";
import { TVBackIcon } from "./TVBackIcon";
import { TVUserIcon } from "./TVUserIcon";

interface TVUserSelectionScreenProps {
  server: SavedServer;
  onUserSelect: (account: SavedServerAccount) => void;
  onAddUser: () => void;
  onChangeServer: () => void;
  disabled?: boolean;
}

export const TVUserSelectionScreen: React.FC<TVUserSelectionScreenProps> = ({
  server,
  onUserSelect,
  onAddUser,
  onChangeServer,
  disabled = false,
}) => {
  const typography = useScaledTVTypography();

  const accounts = server.accounts || [];
  const hasAccounts = accounts.length > 0;

  const handleBackPress = useCallback(() => {
    if (disabled) return false;
    onChangeServer();
    return true;
  }, [disabled, onChangeServer]);

  useTVBackPress(handleBackPress, [handleBackPress]);

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
        {/* Server Info Header */}
        <View style={{ marginBottom: scaleSize(48), alignItems: "center" }}>
          <Text
            style={{
              fontSize: typography.title,
              fontWeight: "bold",
              color: "#FFFFFF",
              textAlign: "center",
              marginBottom: scaleSize(8),
            }}
          >
            {server.name || server.address}
          </Text>
          {server.name && (
            <Text
              style={{
                fontSize: typography.body,
                color: "#9CA3AF",
                textAlign: "center",
              }}
            >
              {server.address.replace(/^https?:\/\//, "")}
            </Text>
          )}
          <Text
            style={{
              fontSize: typography.body,
              color: "#6B7280",
              textAlign: "center",
              marginTop: scaleSize(16),
            }}
          >
            {hasAccounts
              ? t("login.select_user")
              : t("login.add_user_to_login")}
          </Text>
        </View>

        {/* User Icons Grid with Back and Add buttons */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: scaleSize(20),
            gap: scaleSize(24),
          }}
          style={{ overflow: "visible" }}
        >
          {/* Back/Change Server Button (left) */}
          <TVBackIcon
            label={t("server.change_server")}
            onPress={onChangeServer}
            disabled={disabled}
          />

          {/* User Icons */}
          {accounts.map((account, index) => (
            <TVUserIcon
              key={account.userId}
              username={account.username}
              securityType={account.securityType}
              onPress={() => onUserSelect(account)}
              hasTVPreferredFocus={index === 0}
              disabled={disabled}
              serverAddress={server.address}
              userId={account.userId}
              primaryImageTag={account.primaryImageTag}
            />
          ))}

          {/* Add User Button (right) */}
          <TVAddIcon
            label={t("login.add_user")}
            onPress={onAddUser}
            hasTVPreferredFocus={!hasAccounts}
            disabled={disabled}
          />
        </ScrollView>
      </View>
    </ScrollView>
  );
};
