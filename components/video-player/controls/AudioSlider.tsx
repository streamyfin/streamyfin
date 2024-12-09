import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Slider } from "react-native-awesome-slider";
import VolumeManager from "react-native-volume-manager";
import { Ionicons } from "@expo/vector-icons";

const AudioSlider = () => {
  const volume = useSharedValue<number>(50); // Explicitly type as number
  const min = useSharedValue<number>(0); // Explicitly type as number
  const max = useSharedValue<number>(100); // Explicitly type as number

  useEffect(() => {
    const fetchInitialVolume = async () => {
      const initialVolume: number = await VolumeManager.getVolume();
      console.log("initialVolume", initialVolume);
      volume.value = initialVolume * 100;
    };
    fetchInitialVolume();
  }, []);

  const handleValueChange = async (value: number) => {
    volume.value = value;
    await VolumeManager.setVolume(value / 100);
  };

  return (
    <View style={styles.sliderContainer}>
      <Slider
        progress={volume}
        minimumValue={min}
        maximumValue={max}
        onValueChange={handleValueChange}
      />
      <Ionicons name="volume-high" size={24} color="black" />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
});

export default AudioSlider;
