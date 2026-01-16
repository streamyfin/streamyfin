import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { BlurView } from "expo-blur";
import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";

interface TVSeasonSelectorProps {
  visible: boolean;
  seasons: BaseItemDto[];
  selectedSeasonIndex: number | string | null | undefined;
  onSelect: (seasonIndex: number) => void;
  onClose: () => void;
}

const TVSeasonCard: React.FC<{
  season: BaseItemDto;
  isSelected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ season, isSelected, hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const seasonName = useMemo(() => {
    if (season.Name) return season.Name;
    if (season.IndexNumber !== undefined) return `Season ${season.IndexNumber}`;
    return "Season";
  }, [season]);

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
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          width: 180,
          height: 85,
          backgroundColor: focused
            ? "#fff"
            : isSelected
              ? "rgba(255,255,255,0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            color: focused ? "#000" : "#fff",
            fontWeight: focused || isSelected ? "600" : "400",
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {seasonName}
        </Text>
        {isSelected && !focused && (
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
            }}
          >
            <Ionicons
              name='checkmark'
              size={18}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

export const TVSeasonSelector: React.FC<TVSeasonSelectorProps> = ({
  visible,
  seasons,
  selectedSeasonIndex,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();

  const initialFocusIndex = useMemo(() => {
    const idx = seasons.findIndex(
      (s) =>
        s.IndexNumber === selectedSeasonIndex ||
        s.Name === String(selectedSeasonIndex),
    );
    return idx >= 0 ? idx : 0;
  }, [seasons, selectedSeasonIndex]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={80}
        tint='dark'
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingTop: 24,
            paddingBottom: 50,
            overflow: "visible",
          }}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: "500",
              color: "rgba(255,255,255,0.6)",
              marginBottom: 16,
              paddingHorizontal: 48,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {t("item_card.select_season")}
          </Text>

          {/* Horizontal season cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ overflow: "visible" }}
            contentContainerStyle={{
              paddingHorizontal: 48,
              paddingVertical: 10,
              gap: 12,
            }}
          >
            {seasons.map((season, index) => (
              <TVSeasonCard
                key={season.Id || index}
                season={season}
                isSelected={
                  season.IndexNumber === selectedSeasonIndex ||
                  season.Name === String(selectedSeasonIndex)
                }
                hasTVPreferredFocus={index === initialFocusIndex}
                onPress={() => {
                  onSelect(season.IndexNumber ?? index);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};
