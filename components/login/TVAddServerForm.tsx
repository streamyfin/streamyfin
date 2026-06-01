import { t } from "i18next";
import React, { useCallback, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { HEADER_PRESETS } from "@/utils/customHeaderPresets";
import { scaleSize } from "@/utils/scaleSize";
import type { CustomHeader } from "@/utils/secureCredentials";
import { TVInput } from "./TVInput";

interface TVAddServerFormProps {
  onConnect: (url: string, headers?: CustomHeader[]) => Promise<void>;
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingHeaders, setPendingHeaders] = useState<CustomHeader[]>([]);

  const handleConnect = async () => {
    if (serverURL.trim()) {
      await onConnect(serverURL.trim(), pendingHeaders);
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

        {/* Advanced: Custom Headers */}
        <View style={{ marginBottom: scaleSize(24) }}>
          <Button
            onPress={() => setShowAdvanced(!showAdvanced)}
            className='bg-neutral-800 border border-neutral-700'
          >
            {showAdvanced ? "▼ " : "▶ "}
            {t("custom_headers.advanced_title")}
          </Button>
        </View>

        {showAdvanced && (
          <View style={{ marginBottom: scaleSize(24) }}>
            {/* Presets */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: scaleSize(12),
                marginBottom: scaleSize(16),
              }}
            >
              {HEADER_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  onPress={() => setPendingHeaders(preset.headers)}
                  className='bg-neutral-800'
                >
                  <Text style={{ fontSize: typography.body * 0.8 }}>
                    {preset.label}
                  </Text>
                </Button>
              ))}
            </View>

            {/* Header inputs */}
            {pendingHeaders.map((header, index) => (
              <View
                key={index}
                style={{ marginBottom: scaleSize(12), gap: scaleSize(8) }}
              >
                <TVInput
                  placeholder={t("custom_headers.header_name_placeholder")}
                  value={header.key}
                  onChangeText={(text) => {
                    const updated = [...pendingHeaders];
                    updated[index] = { ...header, key: text };
                    setPendingHeaders(updated);
                  }}
                  autoCapitalize='none'
                  autoCorrect={false}
                />
                <TVInput
                  placeholder={t("custom_headers.header_value_placeholder")}
                  value={header.value}
                  onChangeText={(text) => {
                    const updated = [...pendingHeaders];
                    updated[index] = { ...header, value: text };
                    setPendingHeaders(updated);
                  }}
                  autoCapitalize='none'
                  autoCorrect={false}
                />
              </View>
            ))}

            {/* Add header */}
            <View style={{ marginBottom: scaleSize(12) }}>
              <Button
                onPress={() =>
                  setPendingHeaders([
                    ...pendingHeaders,
                    { key: "", value: "", enabled: true },
                  ])
                }
                className='bg-neutral-800'
              >
                {t("custom_headers.add_header")}
              </Button>
            </View>

            {/* Clear headers */}
            {pendingHeaders.length > 0 && (
              <Button
                onPress={() => setPendingHeaders([])}
                className='bg-red-900'
              >
                {t("custom_headers.clear_headers")}
              </Button>
            )}
          </View>
        )}

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
