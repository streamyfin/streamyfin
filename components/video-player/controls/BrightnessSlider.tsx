import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";

// import * as Brightness from "expo-brightness";
const Brightness = !Platform.isTV ? require("expo-brightness") : null;

import { Ionicons } from "@expo/vector-icons";

const BrightnessSlider = () => {
  const isTv = Platform.isTV;

  const brightness = useSharedValue(50);
  const min = useSharedValue(0);
  const max = useSharedValue(100);

  useEffect(() => {
    if (isTv) return;
    const fetchInitialBrightness = async () => {
      const initialBrightness = await Brightness.getBrightnessAsync();
      brightness.value = initialBrightness * 100;
    };
    fetchInitialBrightness();
  }, [brightness, isTv]);

  const handleValueChange = async (value: number) => {
    brightness.value = value;
    await Brightness.setBrightnessAsync(value / 100);
  };

  if (isTv) return;

  return (
    <View style={styles.sliderContainer}>
      <Slider
        progress={brightness}
        minimumValue={min}
        maximumValue={max}
        thumbWidth={0}
        onValueChange={handleValueChange}
        containerStyle={{
          borderRadius: 50,
        }}
        theme={{
          minimumTrackTintColor: "#FDFDFD",
          maximumTrackTintColor: "#5A5A5A",
          bubbleBackgroundColor: "transparent", // Hide the value bubble
          bubbleTextColor: "transparent", // Hide the value text
        }}
      />
      <Ionicons
        name='sunny'
        size={20}
        color='#FDFDFD'
        style={{
          marginLeft: 8,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    width: 150,
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default BrightnessSlider;
