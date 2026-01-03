import { Ionicons } from "@expo/vector-icons";
import type { FC } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useSettings } from "@/utils/atoms/settings";
import AudioSlider from "./AudioSlider";
import BrightnessSlider from "./BrightnessSlider";
import { ICON_SIZES } from "./constants";

interface CenterControlsProps {
  showControls: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  showAudioSlider: boolean;
  setShowAudioSlider: (show: boolean) => void;
  togglePlay: () => void;
  handleSkipBackward: () => void;
  handleSkipForward: () => void;
}

export const CenterControls: FC<CenterControlsProps> = ({
  showControls,
  isPlaying,
  isBuffering,
  showAudioSlider,
  setShowAudioSlider,
  togglePlay,
  handleSkipBackward,
  handleSkipForward,
}) => {
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: "absolute",
        top: "50%",
        left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
        right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        transform: [{ translateY: -22.5 }],
        paddingHorizontal: "28%",
      }}
      pointerEvents={showControls ? "box-none" : "none"}
    >
      <View
        style={{
          position: "absolute",
          alignItems: "center",
          transform: [{ rotate: "270deg" }],
          left: 0,
          bottom: 30,
        }}
      >
        <BrightnessSlider />
      </View>

      {!Platform.isTV && (
        <TouchableOpacity onPress={handleSkipBackward}>
          <View
            style={{
              position: "relative",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name='refresh-outline'
              size={ICON_SIZES.CENTER}
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
              {settings?.rewindSkipTime}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={Platform.isTV ? { flex: 1, alignItems: "center" } : {}}>
        <TouchableOpacity onPress={togglePlay}>
          {!isBuffering ? (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={ICON_SIZES.CENTER}
              color='white'
            />
          ) : (
            <Loader size={"large"} />
          )}
        </TouchableOpacity>
      </View>

      {!Platform.isTV && (
        <TouchableOpacity onPress={handleSkipForward}>
          <View
            style={{
              position: "relative",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name='refresh-outline'
              size={ICON_SIZES.CENTER}
              color='white'
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
              {settings?.forwardSkipTime}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View
        style={{
          position: "absolute",
          alignItems: "center",
          transform: [{ rotate: "270deg" }],
          bottom: 30,
          right: 0,
          opacity: showAudioSlider || showControls ? 1 : 0,
        }}
      >
        <AudioSlider setVisibility={setShowAudioSlider} />
      </View>
    </View>
  );
};
