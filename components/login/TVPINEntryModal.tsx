import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVPinInput, type TVPinInputRef } from "@/components/inputs/TVPinInput";
import { useTVFocusAnimation } from "@/components/tv";
import { verifyAccountPIN } from "@/utils/secureCredentials";

interface TVPINEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onForgotPIN?: () => void;
  serverUrl: string;
  userId: string;
  username: string;
}

// Forgot PIN Button
const TVForgotPINButton: React.FC<{
  onPress: () => void;
  label: string;
  hasTVPreferredFocus?: boolean;
}> = ({ onPress, label, hasTVPreferredFocus = false }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05, duration: 120 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "transparent",
          },
        ]}
      >
        <Text
          style={{
            fontSize: 16,
            color: focused ? "#fff" : "rgba(255,255,255,0.6)",
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const TVPINEntryModal: React.FC<TVPINEntryModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onForgotPIN,
  serverUrl,
  userId,
  username,
}) => {
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const pinInputRef = useRef<TVPinInputRef>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset state when opening
      setPinCode("");
      setError(null);
      setIsVerifying(false);

      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(200);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, sheetTranslateY]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [visible]);

  useEffect(() => {
    if (visible && isReady) {
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, isReady]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 15,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -15,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 15,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePinChange = async (value: string) => {
    setPinCode(value);
    setError(null);

    // Auto-verify when 4 digits entered
    if (value.length === 4) {
      setIsVerifying(true);
      try {
        const isValid = await verifyAccountPIN(serverUrl, userId, value);
        if (isValid) {
          onSuccess();
          setPinCode("");
        } else {
          setError(t("pin.invalid_pin"));
          shake();
          setPinCode("");
        }
      } catch {
        setError(t("pin.invalid_pin"));
        shake();
        setPinCode("");
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleForgotPIN = () => {
    Alert.alert(t("pin.forgot_pin"), t("pin.forgot_pin_desc"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.continue"),
        style: "destructive",
        onPress: () => {
          onClose();
          onForgotPIN?.();
        },
      },
    ]);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <BlurView intensity={80} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t("pin.enter_pin")}</Text>
              <Text style={styles.subtitle}>
                {t("pin.enter_pin_for", { username })}
              </Text>
            </View>

            {/* PIN Input */}
            {isReady && (
              <Animated.View
                style={[
                  styles.pinContainer,
                  { transform: [{ translateX: shakeAnimation }] },
                ]}
              >
                <TVPinInput
                  ref={pinInputRef}
                  value={pinCode}
                  onChangeText={handlePinChange}
                  length={4}
                  autoFocus
                />
                {error && <Text style={styles.errorText}>{error}</Text>}
                {isVerifying && (
                  <Text style={styles.verifyingText}>
                    {t("common.verifying")}
                  </Text>
                )}
              </Animated.View>
            )}

            {/* Forgot PIN */}
            {isReady && onForgotPIN && (
              <View style={styles.forgotContainer}>
                <TVForgotPINButton
                  onPress={handleForgotPIN}
                  label={t("pin.forgot_pin")}
                  hasTVPreferredFocus
                />
              </View>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  sheetContainer: {
    width: "100%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 50,
    overflow: "visible",
  },
  header: {
    paddingHorizontal: 48,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
  },
  pinContainer: {
    paddingHorizontal: 48,
    alignItems: "center",
    marginBottom: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
  verifyingText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
  forgotContainer: {
    alignItems: "center",
  },
});
