import { t } from "i18next";
import React, { useCallback, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { scaleSize } from "@/utils/scaleSize";
import { TVInput } from "./TVInput";

interface TVAddServerFormProps {
  onConnect: (url: string) => Promise<void>;
  onStartPairing?: () => void;
  onBack: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const TVAddServerForm: React.FC<TVAddServerFormProps> = ({
  onConnect,
  onStartPairing,
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
        paddingVertical: scaleSize(60),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 800,
          paddingHorizontal: scaleSize(60),
        }}
      >
        {/* Title */}
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            color: "#FFFFFF",
            textAlign: "left",
            marginBottom: scaleSize(24),
            paddingHorizontal: scaleSize(8),
          }}
        >
          {t("server.enter_url_to_jellyfin_server")}
        </Text>

        {/* Server URL Input */}
        <View
          style={{
            marginBottom: scaleSize(24),
            paddingHorizontal: scaleSize(8),
          }}
        >
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
        <View style={{ marginBottom: scaleSize(24) }}>
          <Button
            onPress={handleConnect}
            loading={loading}
            disabled={loading || !serverURL.trim()}
            color='white'
          >
            {t("server.connect_button")}
          </Button>
        </View>

        {/* Pair with Phone */}
        {Platform.OS !== "ios" && onStartPairing && (
          <View>
            <Button
              onPress={onStartPairing}
              className='bg-neutral-800 border border-neutral-700'
            >
              {t("pairing.pair_with_phone")}
            </Button>
          </View>
        )}
      </View>
    </ScrollView>
  );
};
