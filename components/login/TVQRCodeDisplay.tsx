import { Ionicons } from "@expo/vector-icons";
import { t } from "i18next";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

interface TVQRCodeDisplayProps {
  code: string;
  mode: "pairing";
  onBack?: () => void;
}

export const TVQRCodeDisplay: React.FC<TVQRCodeDisplayProps> = ({
  code,
  mode,
  onBack,
}) => {
  const typography = useScaledTVTypography();
  const handledRef = useRef(false);

  const qrSize = scaleSize(280);
  const cardPadding = scaleSize(16);
  const sectionPadding = scaleSize(32);
  const outerPadding = scaleSize(60);

  const qrData = JSON.stringify({
    action: "streamyfin-pair",
    code,
  });

  // Handle Android TV back button
  useEffect(() => {
    if (!Platform.isTV || !onBack) return;

    const handleBackPress = () => {
      if (handledRef.current) return true;

      handledRef.current = true;
      setTimeout(() => {
        handledRef.current = false;
      }, 100);

      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );

    return () => subscription.remove();
  }, [onBack]);

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
        {/* Back Button */}
        {onBack && <TVBackButton onPress={onBack} />}

        {/* QR Code */}
        <View
          style={{
            alignItems: "center",
            paddingVertical: sectionPadding,
            paddingHorizontal: cardPadding,
            borderRadius: 16,
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "bold",
              color: "#FFFFFF",
              marginBottom: 8,
            }}
          >
            {t("pairing.waiting_for_phone")}
          </Text>

          <View
            style={{
              padding: cardPadding,
              borderRadius: 12,
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

const TVBackButton: React.FC<{
  onPress: () => void;
}> = ({ onPress }) => {
  const [isFocused, setIsFocused] = React.useState(false);
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
      focusable
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
          {t("common.back")}
        </Text>
      </Animated.View>
    </Pressable>
  );
};
