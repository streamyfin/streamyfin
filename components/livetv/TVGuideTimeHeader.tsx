import { BlurView } from "expo-blur";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVGuideTimeHeaderProps {
  baseTime: Date;
  hoursToShow: number;
  pixelsPerHour: number;
}

export const TVGuideTimeHeader: React.FC<TVGuideTimeHeaderProps> = ({
  baseTime,
  hoursToShow,
  pixelsPerHour,
}) => {
  const typography = useScaledTVTypography();

  const hours: Date[] = [];
  for (let i = 0; i < hoursToShow; i++) {
    const hour = new Date(baseTime);
    hour.setMinutes(0, 0, 0);
    hour.setHours(baseTime.getHours() + i);
    hours.push(hour);
  }

  const formatHour = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <BlurView intensity={40} tint='dark' style={styles.container}>
      {hours.map((hour, index) => (
        <View key={index} style={[styles.hourCell, { width: pixelsPerHour }]}>
          <Text style={[styles.hourText, { fontSize: typography.callout }]}>
            {formatHour(hour)}
          </Text>
        </View>
      ))}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 44,
  },
  hourCell: {
    justifyContent: "center",
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.1)",
  },
  hourText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
});
