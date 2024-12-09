import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Slider } from "react-native-awesome-slider";
import { VolumeManager } from "react-native-volume-manager";
import { Ionicons } from "@expo/vector-icons";

const AudioSlider = () => {
  const volume = useSharedValue<number>(50); // Explicitly type as number
  const min = useSharedValue<number>(0); // Explicitly type as number
  const max = useSharedValue<number>(100); // Explicitly type as number

  useEffect(() => {
    const fetchInitialVolume = async () => {
      try {
        const { volume: initialVolume } = await VolumeManager.getVolume();
        console.log("initialVolume", initialVolume);
        volume.value = initialVolume * 100;
      } catch (error) {
        console.error("Error fetching initial volume:", error);
      }
    };
    fetchInitialVolume();

    // Disable the native volume UI when the component mounts
    VolumeManager.showNativeVolumeUI({ enabled: false });

    return () => {
      // Re-enable the native volume UI when the component unmounts
      VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, []);

  const handleValueChange = async (value: number) => {
    volume.value = value;
    console.log("volume", value);
    await VolumeManager.setVolume(value / 100);

    // Re-call showNativeVolumeUI to ensure the setting is applied on iOS
    VolumeManager.showNativeVolumeUI({ enabled: false });
  };

  useEffect(() => {
    const volumeListener = VolumeManager.addVolumeListener((result) => {
      console.log("Volume changed:", result.volume);
      volume.value = result.volume * 100;
    });

    return () => {
      volumeListener.remove();
    };
  }, []);

  return (
    <View style={styles.sliderContainer}>
      <Slider
        progress={volume}
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
        name="volume-high"
        size={20}
        color="#FDFDFD"
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

export default AudioSlider;
