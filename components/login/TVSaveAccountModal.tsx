import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVPinInput, type TVPinInputRef } from "@/components/inputs/TVPinInput";
import { TVOptionCard, useTVFocusAnimation } from "@/components/tv";
import type { AccountSecurityType } from "@/utils/secureCredentials";

interface TVSaveAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (securityType: AccountSecurityType, pinCode?: string) => void;
  username: string;
}

interface SecurityOption {
  type: AccountSecurityType;
  titleKey: string;
  descriptionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SECURITY_OPTIONS: SecurityOption[] = [
  {
    type: "none",
    titleKey: "save_account.no_protection",
    descriptionKey: "save_account.no_protection_desc",
    icon: "flash-outline",
  },
  {
    type: "pin",
    titleKey: "save_account.pin_code",
    descriptionKey: "save_account.pin_code_desc",
    icon: "keypad-outline",
  },
  {
    type: "password",
    titleKey: "save_account.password",
    descriptionKey: "save_account.password_desc",
    icon: "lock-closed-outline",
  },
];

// Custom Save Button with TV focus
const TVSaveButton: React.FC<{
  onPress: () => void;
  label: string;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
}> = ({ onPress, label, disabled = false, hasTVPreferredFocus = false }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05, duration: 120 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "#a855f7"
              : disabled
                ? "#4a4a4a"
                : "#7c3aed",
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Ionicons name='checkmark' size={20} color='#fff' />
        <Text
          style={{
            fontSize: 16,
            color: "#fff",
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// Back Button for PIN step
const TVBackButton: React.FC<{
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
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.15)",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
        ]}
      >
        <Ionicons
          name='chevron-back'
          size={20}
          color={focused ? "#000" : "rgba(255,255,255,0.8)"}
        />
        <Text
          style={{
            fontSize: 16,
            color: focused ? "#000" : "rgba(255,255,255,0.8)",
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const TVSaveAccountModal: React.FC<TVSaveAccountModalProps> = ({
  visible,
  onClose,
  onSave,
  username,
}) => {
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [step, setStep] = useState<"select" | "pin">("select");
  const [selectedType, setSelectedType] = useState<AccountSecurityType>("none");
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const pinInputRef = useRef<TVPinInputRef>(null);

  // Use useState for focus tracking (per TV focus guide)
  const [firstCardRef, setFirstCardRef] = useState<View | null>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    if (visible) {
      // Reset state when opening
      setStep("select");
      setSelectedType("none");
      setPinCode("");
      setPinError(null);

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

  // Focus the first card when ready
  useEffect(() => {
    if (isReady && firstCardRef && step === "select") {
      const timer = setTimeout(() => {
        (firstCardRef as any)?.requestTVFocus?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isReady, firstCardRef, step]);

  useEffect(() => {
    if (step === "pin" && isReady) {
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [step, isReady]);

  const handleOptionSelect = (type: AccountSecurityType) => {
    setSelectedType(type);
    if (type === "pin") {
      setStep("pin");
      setPinCode("");
      setPinError(null);
    } else {
      // For "none" or "password", save immediately
      onSave(type);
      resetAndClose();
    }
  };

  const handlePinSave = () => {
    if (pinCode.length !== 4) {
      setPinError(t("pin.enter_4_digits"));
      return;
    }
    onSave("pin", pinCode);
    resetAndClose();
  };

  const handleBack = () => {
    setStep("select");
    setPinCode("");
    setPinError(null);
  };

  const resetAndClose = () => {
    setStep("select");
    setSelectedType("none");
    setPinCode("");
    setPinError(null);
    onClose();
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
              <Text style={styles.title}>{t("save_account.title")}</Text>
              <Text style={styles.subtitle}>{username}</Text>
            </View>

            {step === "select" ? (
              // Security selection step
              <>
                <Text style={styles.sectionTitle}>
                  {t("save_account.security_option")}
                </Text>
                {isReady && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                  >
                    {SECURITY_OPTIONS.map((option, index) => (
                      <TVOptionCard
                        key={option.type}
                        ref={index === 0 ? setFirstCardRef : undefined}
                        label={t(option.titleKey)}
                        sublabel={t(option.descriptionKey)}
                        selected={selectedType === option.type}
                        hasTVPreferredFocus={index === 0}
                        onPress={() => handleOptionSelect(option.type)}
                        width={220}
                        height={100}
                      />
                    ))}
                  </ScrollView>
                )}
              </>
            ) : (
              // PIN entry step
              <>
                <Text style={styles.sectionTitle}>{t("pin.setup_pin")}</Text>
                <View style={styles.pinContainer}>
                  <TVPinInput
                    ref={pinInputRef}
                    value={pinCode}
                    onChangeText={(text) => {
                      setPinCode(text);
                      setPinError(null);
                    }}
                    length={4}
                    autoFocus
                  />
                  {pinError && <Text style={styles.errorText}>{pinError}</Text>}
                </View>

                {isReady && (
                  <View style={styles.buttonRow}>
                    <TVBackButton
                      onPress={handleBack}
                      label={t("common.back")}
                      hasTVPreferredFocus
                    />
                    <TVSaveButton
                      onPress={handlePinSave}
                      label={t("save_account.save_button")}
                      disabled={pinCode.length !== 4}
                    />
                  </View>
                )}
              </>
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
    marginBottom: 20,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    paddingHorizontal: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 10,
    gap: 12,
  },
  buttonRow: {
    marginTop: 20,
    paddingHorizontal: 48,
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  pinContainer: {
    paddingHorizontal: 48,
    alignItems: "center",
    marginBottom: 10,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
});
