import * as Sentry from "@sentry/react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

/**
 * Fallback UI for render-phase crashes, exported as `ErrorBoundary` from
 * route layouts so expo-router mounts it instead of a blank screen. Kept
 * free of app providers and styling systems (plain RN primitives, inline
 * styles, no TVTypography) so it still renders when the crash happened
 * inside a provider or the style pipeline itself.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "black",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        gap: 16,
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: "white",
          fontSize: Platform.isTV ? 32 : 18,
          fontWeight: "600",
        }}
      >
        {t("common.something_went_wrong")}
      </Text>
      {error?.message ? (
        <Text
          allowFontScaling={false}
          numberOfLines={4}
          style={{
            color: "#9ca3af",
            fontSize: Platform.isTV ? 22 : 13,
            textAlign: "center",
            maxWidth: 600,
          }}
        >
          {error.message}
        </Text>
      ) : null}
      <Pressable
        onPress={retry}
        hasTVPreferredFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => ({
          marginTop: 8,
          paddingHorizontal: Platform.isTV ? 40 : 28,
          paddingVertical: Platform.isTV ? 16 : 12,
          borderRadius: 999,
          backgroundColor: "white",
          opacity: pressed ? 0.7 : focused || !Platform.isTV ? 1 : 0.8,
        })}
      >
        <Text
          allowFontScaling={false}
          style={{
            color: "black",
            fontSize: Platform.isTV ? 24 : 15,
            fontWeight: "600",
          }}
        >
          {t("home.retry")}
        </Text>
      </Pressable>
    </View>
  );
}
