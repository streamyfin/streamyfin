import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
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

const TVBackButton: React.FC<{
  onPress: () => void;
  label: string;
  disabled?: boolean;
}> = ({ onPress, label, disabled = false }) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateFocus = (focused: boolean) => {
    Animated.timing(scale, {
      toValue: focused ? 1.05 : 1,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setIsFocused(true);
        animateFocus(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        animateFocus(false);
      }}
      style={{ alignSelf: "flex-start", marginBottom: 40 }}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: isFocused ? "#fff" : "rgba(255, 255, 255, 0.15)",
        }}
      >
        <Ionicons
          name='chevron-back'
          size={28}
          color={isFocused ? "#000" : "#fff"}
        />
        <Text
          style={{
            color: isFocused ? "#000" : "#fff",
            fontSize: 20,
            marginLeft: 4,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

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

  // Handle Android TV back button, needed as an "override"
  useEffect(() => {
    if (!Platform.isTV) return;

    const handleBackPress = () => {
      if (disabled) return false;
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );

    return () => subscription.remove();
  }, [onBack, disabled]);

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
        {/* Back Button */}
        <TVBackButton
          onPress={onBack}
          label={t("common.back")}
          disabled={isDisabled}
        />

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
