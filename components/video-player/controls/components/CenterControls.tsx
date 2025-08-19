import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useSettings } from "@/utils/atoms/settings";
import AudioSlider from "../AudioSlider";
import BrightnessSlider from "../BrightnessSlider";

interface CenterControlsProps {
  showControls: boolean;
  showAudioSlider: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  rewindSkipTime?: number;
  forwardSkipTime?: number;
  animatedControlsStyle: any;
  setShowAudioSlider: (show: boolean) => void;
  onTogglePlay: () => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
}

export const CenterControls: React.FC<CenterControlsProps> = ({
  showControls,
  showAudioSlider,
  isPlaying,
  isBuffering,
  rewindSkipTime,
  forwardSkipTime,
  animatedControlsStyle,
  setShowAudioSlider,
  onTogglePlay,
  onSkipBackward,
  onSkipForward,
}) => {
  const [settings] = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: "50%", // Center vertically
          left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          transform: [{ translateY: -22.5 }], // Adjust for the button's height (half of 45)
          paddingHorizontal: 17,
        },
        animatedControlsStyle,
      ]}
      pointerEvents={showControls ? "box-none" : "none"}
    >
      {/* Brightness Control */}
      <View
        style={{
          width: 50,
          height: 50,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "270deg" }],
        }}
      >
        <BrightnessSlider />
      </View>

      {/* Skip Backward */}
      {!Platform.isTV && (
        <TouchableOpacity onPress={onSkipBackward}>
          <View
            style={{
              position: "relative",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name='refresh-outline'
              size={50}
              color='white'
              style={{
                transform: [{ scaleY: -1 }, { rotate: "180deg" }],
              }}
            />
            <Text
              style={{
                position: "absolute",
                color: "white",
                fontSize: 16,
                fontWeight: "bold",
                bottom: 10,
              }}
            >
              {rewindSkipTime}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Play/Pause Button */}
      <View style={{ alignItems: "center" }}>
        <TouchableOpacity onPress={onTogglePlay}>
          {!isBuffering ? (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={50}
              color='white'
            />
          ) : (
            <Loader size={"large"} />
          )}
        </TouchableOpacity>
      </View>

      {/* Skip Forward */}
      {!Platform.isTV && (
        <TouchableOpacity onPress={onSkipForward}>
          <View
            style={{
              position: "relative",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name='refresh-outline' size={50} color='white' />
            <Text
              style={{
                position: "absolute",
                color: "white",
                fontSize: 16,
                fontWeight: "bold",
                bottom: 10,
              }}
            >
              {forwardSkipTime}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Volume/Audio Control */}
      <View
        style={{
          width: 50,
          height: 50,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "270deg" }],
          opacity: showAudioSlider || showControls ? 1 : 0,
        }}
      >
        <AudioSlider setVisibility={setShowAudioSlider} />
      </View>
    </Animated.View>
  );
};
