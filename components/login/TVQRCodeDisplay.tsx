import { t } from "i18next";
import React, { useCallback } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { scaleSize } from "@/utils/scaleSize";

interface TVQRCodeDisplayProps {
  code: string;
  onBack?: () => void;
}

export const TVQRCodeDisplay: React.FC<TVQRCodeDisplayProps> = ({
  code,
  onBack,
}) => {
  const typography = useScaledTVTypography();

  const qrSize = scaleSize(280);
  const cardPadding = scaleSize(16);
  const sectionPadding = scaleSize(32);
  const outerPadding = scaleSize(60);

  const qrData = JSON.stringify({
    action: "streamyfin-pair",
    code,
  });

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
            {t("pairing.waiting_for_phone")}
          </Text>

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
            }}
          >
            {t("pairing.scan_with_phone")}
          </Text>
        </View>
      </View>
    </View>
  );
};
