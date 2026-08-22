import { t } from "i18next";
import React, { useCallback, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { TVCustomHeaderEditor } from "@/components/tv/settings";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { type CustomHeader, usableCustomHeaders } from "@/utils/customHeaders";
import { scaleSize } from "@/utils/scaleSize";
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
  // An editor with nothing usable in it passes `undefined` so it keeps whatever
  // is already saved for the server instead of clearing it (see
  // checkJellyfinServer).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingHeaders, setPendingHeaders] = useState<CustomHeader[]>([]);

  const handleConnect = async () => {
    if (serverURL.trim()) {
      const usableHeaders = usableCustomHeaders(pendingHeaders);
      await onConnect(
        serverURL.trim(),
        usableHeaders.length > 0 ? usableHeaders : undefined,
      );
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

        {/* Custom proxy auth headers, needed before the first request when the
            server sits behind an access gateway. */}
        <View style={{ marginBottom: scaleSize(24) }}>
          <Button
            onPress={() => setShowAdvanced(!showAdvanced)}
            disabled={isDisabled}
            className='bg-neutral-800 border border-neutral-700'
          >
            {`${showAdvanced ? "▼" : "▶"} ${t("custom_headers.advanced_title")}`}
          </Button>
        </View>

        {showAdvanced && (
          <TVCustomHeaderEditor
            serviceLabel={t("custom_headers.title")}
            headers={pendingHeaders}
            onHeadersChange={setPendingHeaders}
            disabled={isDisabled}
          />
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
