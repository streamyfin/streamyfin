import { useEffect, useRef, useState } from "react";
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
  const isUserInteracting = useRef(false);
  const lastKnownBrightness = useRef<number>(50);
  const brightnessSupportedRef = useRef(true);
  const [brightnessSupported, setBrightnessSupported] = useState(true);

  // Update brightness from device
  const updateBrightnessFromDevice = async () => {
    // Check ref (not state) to avoid stale closure in setInterval
    if (
      isTv ||
      !Brightness ||
      isUserInteracting.current ||
      !brightnessSupportedRef.current
    )
      return;

    try {
      const currentBrightness = await Brightness.getBrightnessAsync();
      const brightnessPercent = Math.round(currentBrightness * 100);

      // Only update if brightness actually changed
      if (Math.abs(brightnessPercent - lastKnownBrightness.current) > 1) {
        brightness.value = brightnessPercent;
        lastKnownBrightness.current = brightnessPercent;
      }
    } catch (error) {
      console.warn("Brightness not supported on this device:", error);
      // Update both ref (stops interval) and state (triggers re-render to hide)
      brightnessSupportedRef.current = false;
      setBrightnessSupported(false);
    }
  };

  useEffect(() => {
    if (isTv) return;

    // Initial brightness fetch
    updateBrightnessFromDevice();

    // Set up periodic brightness checking to sync with gesture changes
    const interval = setInterval(updateBrightnessFromDevice, 200); // Check every 200ms

    return () => {
      clearInterval(interval);
    };
  }, [isTv]);

  const handleValueChange = async (value: number) => {
    isUserInteracting.current = true;
    brightness.value = value;
    lastKnownBrightness.current = value;

    try {
      await Brightness.setBrightnessAsync(value / 100);
    } catch (error) {
      console.error("Error setting brightness:", error);
    }

    // Reset interaction flag after a delay
    setTimeout(() => {
      isUserInteracting.current = false;
    }, 100);
  };

  if (isTv || !brightnessSupported) return null;

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
    width: 130,
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default BrightnessSlider;
