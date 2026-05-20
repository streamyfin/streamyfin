import { t } from "i18next";
import React, { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { TVInput } from "./TVInput";
import { TVSaveAccountToggle } from "./TVSaveAccountToggle";

interface TVAddUserFormProps {
  serverName: string;
  serverAddress: string;
  onLogin: (
    username: string,
    password: string,
    saveAccount: boolean,
  ) => Promise<void>;
  onQuickConnect: () => Promise<void>;
  onBack: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const TVAddUserForm: React.FC<TVAddUserFormProps> = ({
  serverName,
  serverAddress,
  onLogin,
  onQuickConnect,
  onBack,
  loading = false,
  disabled = false,
}) => {
  const typography = useScaledTVTypography();
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [saveAccount, setSaveAccount] = useState(false);

  const handleLogin = async () => {
    if (credentials.username.trim()) {
      await onLogin(credentials.username, credentials.password, saveAccount);
    }
  };

  const isDisabled = disabled || loading;

  const handleBack = useCallback(() => {
    if (isDisabled) return false;
    onBack();
    return true;
  }, [isDisabled, onBack]);

  useTVBackPress(() => handleBack(), [handleBack]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 800,
          paddingHorizontal: 60,
        }}
      >
        {/* Title */}
        <Text
          style={{
            fontSize: typography.title,
            fontWeight: "bold",
            color: "#FFFFFF",
            marginBottom: 8,
          }}
        >
          {serverName ? (
            <>
              {`${t("login.login_to_title")} `}
              <Text style={{ color: "#fff" }}>{serverName}</Text>
            </>
          ) : (
            t("login.login_title")
          )}
        </Text>
        <Text
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginBottom: 40,
          }}
        >
          {serverAddress}
        </Text>

        {/* Username Input */}
        <View style={{ marginBottom: 24, paddingHorizontal: 8 }}>
          <TVInput
            placeholder={t("login.username_placeholder")}
            value={credentials.username}
            onChangeText={(text) =>
              setCredentials((prev) => ({ ...prev, username: text }))
            }
            autoCapitalize='none'
            autoCorrect={false}
            textContentType='username'
            returnKeyType='next'
            hasTVPreferredFocus
            disabled={isDisabled}
          />
        </View>

        {/* Password Input */}
        <View style={{ marginBottom: 32, paddingHorizontal: 8 }}>
          <TVInput
            placeholder={t("login.password_placeholder")}
            value={credentials.password}
            onChangeText={(text) =>
              setCredentials((prev) => ({ ...prev, password: text }))
            }
            secureTextEntry
            autoCapitalize='none'
            textContentType='password'
            returnKeyType='done'
            disabled={isDisabled}
          />
        </View>

        {/* Save Account Toggle */}
        <View style={{ marginBottom: 40, paddingHorizontal: 8 }}>
          <TVSaveAccountToggle
            value={saveAccount}
            onValueChange={setSaveAccount}
            label={t("save_account.save_for_later")}
            disabled={isDisabled}
          />
        </View>

        {/* Login Button */}
        <View style={{ marginBottom: 16 }}>
          <Button
            onPress={handleLogin}
            loading={loading}
            disabled={!credentials.username.trim() || loading}
            color='white'
          >
            {t("login.login_button")}
          </Button>
        </View>

        {/* Quick Connect Button */}
        <Button
          onPress={onQuickConnect}
          color='black'
          className='bg-neutral-800 border border-neutral-700'
        >
          {t("login.quick_connect")}
        </Button>
      </View>
    </ScrollView>
  );
};
