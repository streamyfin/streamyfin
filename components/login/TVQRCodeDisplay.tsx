import { t } from "i18next";
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Text } from "@/components/common/Text";
import { TVButton } from "@/components/tv/TVButton";
import { QUICK_CONNECT_CODE_LIFETIME_MS } from "@/constants/QuickConnect";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { quickConnectPairingUrl } from "@/utils/quickConnectPairing";
import { scaleSize } from "@/utils/scaleSize";

interface TVQRCodeDisplayProps {
  /** The server the TV started Quick Connect on. */
  serverUrl: string;
  /** The Quick Connect code the server handed out. */
  code: string;
  /** The server's id, for the phone to tell a TV on another server apart. */
  serverId?: string;
  /** Asks the server for a new code once this one has expired. */
  onNewCode: () => void;
  onBack?: () => void;
}

/**
 * The TV side of Quick Connect: the code, and a QR code a phone scans to
 * approve it, with the Streamyfin app or with the camera and the server's web
 * client. The TV then signs in by itself; no password crosses the network.
 */
export const TVQRCodeDisplay: React.FC<TVQRCodeDisplayProps> = ({
  serverUrl,
  code,
  serverId,
  onNewCode,
  onBack,
}) => {
  const typography = useScaledTVTypography();

  // The server drops the request after its lifetime; a new code restarts it.
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    const timer = setTimeout(
      () => setExpired(true),
      QUICK_CONNECT_CODE_LIFETIME_MS,
    );
    return () => clearTimeout(timer);
  }, [code]);

  const qrSize = scaleSize(280);
  const cardPadding = scaleSize(16);
  const sectionPadding = scaleSize(32);
  const outerPadding = scaleSize(60);

  const qrData = quickConnectPairingUrl(serverUrl, code, serverId);

  const handleBack = useCallback(() => {
    if (!onBack) return false;
    onBack();
    return true;
  }, [onBack]);

  useTVBackPress(() => handleBack(), [handleBack]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 800,
          paddingHorizontal: outerPadding,
        }}
      >
        {/* QR Code */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: sectionPadding,
            paddingHorizontal: cardPadding,
            borderRadius: scaleSize(16),
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "bold",
              color: "#FFFFFF",
              marginBottom: scaleSize(8),
            }}
          >
            {t("login.quick_connect")}
          </Text>

          {expired ? (
            <>
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#9CA3AF",
                  marginVertical: scaleSize(16),
                  textAlign: "center",
                }}
              >
                {t("pairing.code_expired")}
              </Text>
              <TVButton onPress={onNewCode} hasTVPreferredFocus>
                <Text
                  style={{
                    fontSize: typography.callout,
                    fontWeight: "600",
                    // The default TV button turns white when focused, and this
                    // one is focused from the start.
                    color: "#000000",
                  }}
                >
                  {t("pairing.get_new_code")}
                </Text>
              </TVButton>
            </>
          ) : (
            <>
              <View
                style={{
                  padding: cardPadding,
                  borderRadius: scaleSize(12),
                  backgroundColor: "#FFFFFF",
                }}
              >
                <QRCode
                  value={qrData}
                  size={qrSize}
                  color='#000000'
                  backgroundColor='#FFFFFF'
                />
              </View>

              <Text
                style={{
                  fontSize: typography.heading,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  letterSpacing: scaleSize(8),
                  marginTop: scaleSize(16),
                }}
              >
                {code}
              </Text>

              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#9CA3AF",
                  marginTop: scaleSize(8),
                  textAlign: "center",
                }}
              >
                {/* Over http the camera would open the web client and have the
                password typed in clear on the local network. */}
                {/^https:\/\//i.test(serverUrl)
                  ? t("pairing.scan_quick_connect")
                  : t("pairing.scan_with_app")}
              </Text>

              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#9CA3AF",
                  marginTop: scaleSize(4),
                  textAlign: "center",
                }}
              >
                {t("login.quick_connect_instructions")}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
};
