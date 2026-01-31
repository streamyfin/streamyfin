import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  TextInput,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv";

interface TVPasswordEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  username: string;
}

// TV Submit Button
const TVSubmitButton: React.FC<{
  onPress: () => void;
  label: string;
  loading?: boolean;
  disabled?: boolean;
}> = ({ onPress, label, loading = false, disabled = false }) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05, duration: 120 });

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={isDisabled}
      focusable={!isDisabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "#fff"
              : isDisabled
                ? "#4a4a4a"
                : "rgba(255,255,255,0.15)",
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minWidth: 120,
            opacity: isDisabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size='small' color={focused ? "#000" : "#fff"} />
        ) : (
          <>
            <Ionicons
              name='log-in-outline'
              size={20}
              color={focused ? "#000" : "#fff"}
            />
            <Text
              style={{
                fontSize: 16,
                color: focused ? "#000" : "#fff",
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
};

// TV Focusable Password Input
const TVPasswordInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmitEditing: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  hasTVPreferredFocus,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02, duration: 120 });
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      onFocus={() => {
        handleFocus();
        inputRef.current?.focus();
      }}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: "#1F2937",
            borderRadius: 12,
            borderWidth: 2,
            borderColor: focused ? "#fff" : "#374151",
            paddingHorizontal: 16,
            paddingVertical: 14,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor='#6B7280'
          secureTextEntry
          autoCapitalize='none'
          autoCorrect={false}
          style={{
            color: "#fff",
            fontSize: 18,
          }}
          onSubmitEditing={onSubmitEditing}
          returnKeyType='done'
        />
      </Animated.View>
    </Pressable>
  );
};

export const TVPasswordEntryModal: React.FC<TVPasswordEntryModalProps> = ({
  visible,
  onClose,
  onSubmit,
  username,
}) => {
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    if (visible) {
      // Reset state when opening
      setPassword("");
      setError(null);
      setIsLoading(false);

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

  const handleSubmit = async () => {
    if (!password) {
      setError(t("password.enter_password"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSubmit(password);
      setPassword("");
    } catch {
      setError(t("password.invalid_password"));
    } finally {
      setIsLoading(false);
    }
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
              <Text style={styles.title}>{t("password.enter_password")}</Text>
              <Text style={styles.subtitle}>
                {t("password.enter_password_for", { username })}
              </Text>
            </View>

            {/* Password Input */}
            {isReady && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  {t("login.password_placeholder")}
                </Text>
                <TVPasswordInput
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError(null);
                  }}
                  placeholder={t("login.password_placeholder")}
                  onSubmitEditing={handleSubmit}
                  hasTVPreferredFocus
                />
                {error && <Text style={styles.errorText}>{error}</Text>}
              </View>
            )}

            {/* Submit Button */}
            {isReady && (
              <View style={styles.buttonContainer}>
                <TVSubmitButton
                  onPress={handleSubmit}
                  label={t("login.login")}
                  loading={isLoading}
                  disabled={!password}
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
  inputContainer: {
    paddingHorizontal: 48,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    marginTop: 8,
  },
  buttonContainer: {
    paddingHorizontal: 48,
    alignItems: "flex-start",
  },
});
