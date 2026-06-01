import { Ionicons } from "@expo/vector-icons";
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
import { scaleSize } from "@/utils/scaleSize";
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

// Number pad button
const NumberPadButton: React.FC<{
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  isBackspace?: boolean;
  disabled?: boolean;
}> = ({ value, onPress, hasTVPreferredFocus, isBackspace, disabled }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.1);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          styles.numberButton,
          {
            transform: [{ scale }],
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        {isBackspace ? (
          <Ionicons
            name='backspace-outline'
            size={28}
            color={focused ? "#000" : "#fff"}
          />
        ) : (
          <Text
            style={[styles.numberText, { color: focused ? "#000" : "#fff" }]}
          >
            {value}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

// PIN dot indicator
const PinDot: React.FC<{ filled: boolean; error: boolean }> = ({
  filled,
  error,
}) => (
  <View
    style={[
      styles.pinDot,
      filled && styles.pinDotFilled,
      error && styles.pinDotError,
    ]}
  />
);

// Forgot PIN link
const ForgotPINLink: React.FC<{
  onPress: () => void;
  label: string;
}> = ({ onPress, label }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          paddingHorizontal: scaleSize(16),
          paddingVertical: scaleSize(10),
          borderRadius: scaleSize(8),
          backgroundColor: focused ? "rgba(255,255,255,0.15)" : "transparent",
        }}
      >
        <Text
          style={{
            fontSize: scaleSize(16),
            color: focused ? "#fff" : "rgba(255,255,255,0.5)",
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
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.9)).current;
  const shakeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPinCode("");
      setError(false);
      setIsVerifying(false);

      overlayOpacity.setValue(0);
      contentScale.setValue(0.9);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [visible, overlayOpacity, contentScale]);

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

  const handleNumberPress = async (num: string) => {
    if (isVerifying || pinCode.length >= 4) return;

    setError(false);
    const newPin = pinCode + num;
    setPinCode(newPin);

    // Auto-verify when 4 digits entered
    if (newPin.length === 4) {
      setIsVerifying(true);
      try {
        const isValid = await verifyAccountPIN(serverUrl, userId, newPin);
        if (isValid) {
          onSuccess();
          setPinCode("");
        } else {
          setError(true);
          shake();
          setTimeout(() => setPinCode(""), 300);
        }
      } catch {
        setError(true);
        shake();
        setTimeout(() => setPinCode(""), 300);
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleBackspace = () => {
    if (isVerifying) return;
    setError(false);
    setPinCode((prev) => prev.slice(0, -1));
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
          styles.contentContainer,
          { transform: [{ scale: contentScale }] },
        ]}
      >
        <BlurView intensity={60} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            {/* Header */}
            <Text style={styles.title}>{t("pin.enter_pin")}</Text>
            <Text style={styles.subtitle}>{username}</Text>

            {/* PIN Dots */}
            <Animated.View
              style={[
                styles.pinDotsContainer,
                { transform: [{ translateX: shakeAnimation }] },
              ]}
            >
              {[0, 1, 2, 3].map((i) => (
                <PinDot key={i} filled={pinCode.length > i} error={error} />
              ))}
            </Animated.View>

            {/* Number Pad */}
            {isReady && (
              <View style={styles.numberPad}>
                {/* Row 1: 1-3 */}
                <View style={styles.numberRow}>
                  <NumberPadButton
                    value='1'
                    onPress={() => handleNumberPress("1")}
                    hasTVPreferredFocus
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='2'
                    onPress={() => handleNumberPress("2")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='3'
                    onPress={() => handleNumberPress("3")}
                    disabled={isVerifying}
                  />
                </View>
                {/* Row 2: 4-6 */}
                <View style={styles.numberRow}>
                  <NumberPadButton
                    value='4'
                    onPress={() => handleNumberPress("4")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='5'
                    onPress={() => handleNumberPress("5")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='6'
                    onPress={() => handleNumberPress("6")}
                    disabled={isVerifying}
                  />
                </View>
                {/* Row 3: 7-9 */}
                <View style={styles.numberRow}>
                  <NumberPadButton
                    value='7'
                    onPress={() => handleNumberPress("7")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='8'
                    onPress={() => handleNumberPress("8")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value='9'
                    onPress={() => handleNumberPress("9")}
                    disabled={isVerifying}
                  />
                </View>
                {/* Row 4: empty, 0, backspace */}
                <View style={styles.numberRow}>
                  <View style={styles.numberButtonPlaceholder} />
                  <NumberPadButton
                    value='0'
                    onPress={() => handleNumberPress("0")}
                    disabled={isVerifying}
                  />
                  <NumberPadButton
                    value=''
                    onPress={handleBackspace}
                    isBackspace
                    disabled={isVerifying || pinCode.length === 0}
                  />
                </View>
              </View>
            )}

            {/* Forgot PIN */}
            {isReady && onForgotPIN && (
              <View style={styles.forgotContainer}>
                <ForgotPINLink
                  onPress={handleForgotPIN}
                  label={t("pin.forgot_pin")}
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  contentContainer: {
    width: "100%",
    maxWidth: 400,
  },
  blurContainer: {
    borderRadius: scaleSize(24),
    overflow: "hidden",
  },
  content: {
    padding: scaleSize(40),
    alignItems: "center",
  },
  title: {
    fontSize: scaleSize(28),
    fontWeight: "bold",
    color: "#fff",
    marginBottom: scaleSize(8),
    textAlign: "center",
  },
  subtitle: {
    fontSize: scaleSize(18),
    color: "rgba(255,255,255,0.6)",
    marginBottom: scaleSize(32),
    textAlign: "center",
  },
  pinDotsContainer: {
    flexDirection: "row",
    gap: scaleSize(16),
    marginBottom: scaleSize(32),
  },
  pinDot: {
    width: scaleSize(20),
    height: scaleSize(20),
    borderRadius: scaleSize(10),
    borderWidth: scaleSize(2),
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "transparent",
  },
  pinDotFilled: {
    backgroundColor: "#fff",
    borderColor: "#fff",
  },
  pinDotError: {
    borderColor: "#ef4444",
    backgroundColor: "#ef4444",
  },
  numberPad: {
    gap: scaleSize(12),
    marginBottom: scaleSize(24),
  },
  numberRow: {
    flexDirection: "row",
    gap: scaleSize(12),
  },
  numberButton: {
    width: scaleSize(72),
    height: scaleSize(72),
    borderRadius: scaleSize(36),
    justifyContent: "center",
    alignItems: "center",
  },
  numberButtonPlaceholder: {
    width: scaleSize(72),
    height: scaleSize(72),
  },
  numberText: {
    fontSize: scaleSize(28),
    fontWeight: "600",
  },
  forgotContainer: {
    marginTop: 8,
  },
});
