import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Slider } from "react-native-awesome-slider";
const VolumeManager = Platform.isTV ? null : require("react-native-volume-manager");
import { Ionicons } from "@expo/vector-icons";
import { VolumeResult } from "react-native-volume-manager";

interface AudioSliderProps {
  setVisibility: (show: boolean) => void;
}

const AudioSlider: React.FC<AudioSliderProps> = ({ setVisibility }) => {
  if (Platform.isTV) {
    return;
  }

  const volume = useSharedValue<number>(50); // Explicitly type as number
  const min = useSharedValue<number>(0); // Explicitly type as number
  const max = useSharedValue<number>(100); // Explicitly type as number

  const timeoutRef = useRef<number | null>(null); // Use a ref to store the timeout ID

  useEffect(() => {
    const fetchInitialVolume = async () => {
      try {
        const { volume: initialVolume } = await VolumeManager.getVolume();
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
    await VolumeManager.setVolume(value / 100);

    // Re-call showNativeVolumeUI to ensure the setting is applied on iOS
    VolumeManager.showNativeVolumeUI({ enabled: false });
  };

  useEffect(() => {
    const volumeListener = VolumeManager.addVolumeListener((result: VolumeResult) => {
      volume.value = result.volume * 100;
      setVisibility(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set a new timeout to hide the visibility after 2 seconds
      timeoutRef.current = setTimeout(() => {
        setVisibility(false);
      }, 1000);
    });

    return () => {
      volumeListener.remove();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [volume]);

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
