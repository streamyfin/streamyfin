import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import type { SubtitleSearchResult } from "@/hooks/useRemoteSubtitles";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVSubtitleResultCardProps {
  result: SubtitleSearchResult;
  hasTVPreferredFocus?: boolean;
  isDownloading?: boolean;
  onPress: () => void;
}

export const TVSubtitleResultCard = React.forwardRef<
  View,
  TVSubtitleResultCardProps
>(({ result, hasTVPreferredFocus, isDownloading, onPress }, ref) => {
  const typography = useScaledTVTypography();
  const styles = createStyles(typography);
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.03 });

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={isDownloading}
    >
      <Animated.View
        style={[
          styles.resultCard,
          animatedStyle,
          {
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)",
            borderColor: focused
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        {/* Provider/Source badge */}
        <View
          style={[
            styles.providerBadge,
            {
              backgroundColor: focused
                ? "rgba(0,0,0,0.1)"
                : "rgba(255,255,255,0.1)",
            },
          ]}
        >
          <Text
            style={[
              styles.providerText,
              { color: focused ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)" },
            ]}
          >
            {result.providerName}
          </Text>
        </View>

        {/* Name */}
        <Text
          style={[styles.resultName, { color: focused ? "#000" : "#fff" }]}
          numberOfLines={2}
        >
          {result.name}
        </Text>

        {/* Meta info row */}
        <View style={styles.resultMeta}>
          {/* Format */}
          <Text
            style={[
              styles.resultMetaText,
              { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
            ]}
          >
            {result.format?.toUpperCase()}
          </Text>

          {/* Rating if available */}
          {result.communityRating !== undefined &&
            result.communityRating > 0 && (
              <View style={styles.ratingContainer}>
                <Ionicons
                  name='star'
                  size={12}
                  color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
                />
                <Text
                  style={[
                    styles.resultMetaText,
                    {
                      color: focused
                        ? "rgba(0,0,0,0.6)"
                        : "rgba(255,255,255,0.5)",
                    },
                  ]}
                >
                  {result.communityRating.toFixed(1)}
                </Text>
              </View>
            )}

          {/* Download count if available */}
          {result.downloadCount !== undefined && result.downloadCount > 0 && (
            <View style={styles.downloadCountContainer}>
              <Ionicons
                name='download-outline'
                size={12}
                color={focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.resultMetaText,
                  {
                    color: focused
                      ? "rgba(0,0,0,0.6)"
                      : "rgba(255,255,255,0.5)",
                  },
                ]}
              >
                {result.downloadCount.toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Flags */}
        <View style={styles.flagsContainer}>
          {result.isHashMatch && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,150,0,0.2)"
                    : "rgba(0,200,0,0.2)",
                },
              ]}
            >
              <Text style={styles.flagText}>Hash Match</Text>
            </View>
          )}
          {result.hearingImpaired && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,0,0,0.1)"
                    : "rgba(255,255,255,0.1)",
                },
              ]}
            >
              <Ionicons
                name='ear-outline'
                size={12}
                color={focused ? "#000" : "#fff"}
              />
            </View>
          )}
          {result.aiTranslated && (
            <View
              style={[
                styles.flag,
                {
                  backgroundColor: focused
                    ? "rgba(0,0,150,0.2)"
                    : "rgba(100,100,255,0.2)",
                },
              ]}
            >
              <Text style={styles.flagText}>AI</Text>
            </View>
          )}
        </View>

        {/* Loading indicator when downloading */}
        {isDownloading && (
          <View style={styles.downloadingOverlay}>
            <ActivityIndicator size='small' color='#fff' />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

const createStyles = (typography: ReturnType<typeof useScaledTVTypography>) =>
  StyleSheet.create({
    resultCard: {
      width: scaleSize(220),
      minHeight: scaleSize(120),
      borderRadius: scaleSize(14),
      padding: scaleSize(14),
      borderWidth: scaleSize(1),
    },
    providerBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: scaleSize(8),
      paddingVertical: scaleSize(3),
      borderRadius: scaleSize(6),
      marginBottom: scaleSize(8),
    },
    providerText: {
      fontSize: typography.callout,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    resultName: {
      fontSize: typography.callout,
      fontWeight: "500",
      marginBottom: scaleSize(8),
      lineHeight: scaleSize(18),
    },
    resultMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: scaleSize(12),
      marginBottom: scaleSize(8),
    },
    resultMetaText: {
      fontSize: typography.callout,
    },
    ratingContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: scaleSize(3),
    },
    downloadCountContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: scaleSize(3),
    },
    flagsContainer: {
      flexDirection: "row",
      gap: scaleSize(6),
      flexWrap: "wrap",
    },
    flag: {
      paddingHorizontal: scaleSize(6),
      paddingVertical: scaleSize(2),
      borderRadius: scaleSize(4),
    },
    flagText: {
      fontSize: typography.callout,
      fontWeight: "600",
      color: "#fff",
    },
    downloadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: scaleSize(14),
      justifyContent: "center",
      alignItems: "center",
    },
  });
