import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { TVInput } from "./TVInput";

interface TVAddServerFormProps {
  onConnect: (url: string) => Promise<void>;
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
      style={{ alignSelf: "flex-start", marginBottom: 24 }}
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

export const TVAddServerForm: React.FC<TVAddServerFormProps> = ({
  onConnect,
  onBack,
  loading = false,
  disabled = false,
}) => {
  const typography = useScaledTVTypography();
  const [serverURL, setServerURL] = useState("");

  const handleConnect = async () => {
    if (serverURL.trim()) {
      await onConnect(serverURL.trim());
    }
  };

  const isDisabled = disabled || loading;

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

        {/* Server URL Input */}
        <View style={{ marginBottom: 24, paddingHorizontal: 8 }}>
          <TVInput
            placeholder={t("server.server_url_placeholder")}
            value={serverURL}
            onChangeText={setServerURL}
            keyboardType='url'
            autoCapitalize='none'
            textContentType='URL'
            returnKeyType='done'
            hasTVPreferredFocus
            disabled={isDisabled}
          />
        </View>

        {/* Connect Button */}
        <View style={{ marginBottom: 24 }}>
          <Button
            onPress={handleConnect}
            loading={loading}
            disabled={loading || !serverURL.trim()}
            color='white'
          >
            {t("server.connect_button")}
          </Button>
        </View>

        {/* Hint text */}
        <Text
          style={{
            fontSize: typography.callout,
            color: "#6B7280",
            textAlign: "left",
            paddingHorizontal: 8,
          }}
        >
          {t("server.enter_url_to_jellyfin_server")}
        </Text>
      </View>
    </ScrollView>
  );
};
