import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export type SeasonIndexState = {
  [key: string]: number | string | undefined;
};

interface SeasonDropdownProps {
  item: BaseItemDto;
  seasons: BaseItemDto[];
  state: SeasonIndexState;
  onSelect: (season: BaseItemDto) => void;
}

export const SeasonDropdown: React.FC<SeasonDropdownProps> = ({
  item,
  seasons,
  state,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const currentSeason = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    return seasons[currentIndex];
  }, [seasons, currentIndex]);
  
  const handlePrevSeason = useCallback(() => {
    console.log("Previous season button pressed");
    if (!seasons || seasons.length === 0) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    setCurrentIndex(newIndex);
    onSelect(seasons[newIndex]);
  }, [seasons, currentIndex, onSelect]);

  const handleNextSeason = useCallback(() => {
    console.log("Next season button pressed");
    if (!seasons || seasons.length === 0) return;
    const newIndex = currentIndex < seasons.length - 1 ? currentIndex + 1 : currentIndex;
    setCurrentIndex(newIndex);
    onSelect(seasons[newIndex]);
  }, [seasons, currentIndex, onSelect]);
  
  if (!seasons || seasons.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noSeasonsText}>{t("item_card.no_seasons_available")}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Pressable 
        style={[
          styles.navButton, 
          currentIndex === 0 && styles.navButtonDisabled
        ]} 
        onPress={handlePrevSeason}
        disabled={currentIndex === 0}
      >
        <Ionicons 
          name="chevron-back" 
          size={24} 
          color={currentIndex === 0 ? "#555" : "white"} 
        />
      </Pressable>
      
      <Text style={styles.seasonTitle}>
        {currentSeason?.Name || t("item_card.season")}
      </Text>
      
      <Pressable 
        style={[
          styles.navButton, 
          currentIndex === seasons.length - 1 && styles.navButtonDisabled
        ]} 
        onPress={handleNextSeason}
        disabled={currentIndex === seasons.length - 1}
      >
        <Ionicons 
          name="chevron-forward" 
          size={24} 
          color={currentIndex === seasons.length - 1 ? "#555" : "white"} 
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: 8,
    marginVertical: 10,
  },
  navButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  seasonTitle: {
    flex: 1,
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  noSeasonsText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
  },
});