import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Text, TouchableOpacity, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { ICON_SIZES } from "./constants";

interface SubtitleOffsetSliderProps {
  currentSubtitleOffset: number;
  setVisibility: (show: boolean) => void;
  handleSubtitleOffsetChange: (offset: number) => void;
}

export const SubtitleOffsetSlider: React.FC<SubtitleOffsetSliderProps> = ({
  currentSubtitleOffset,
  setVisibility,
  handleSubtitleOffsetChange,
}) => {
  const subtitleOffset = useSharedValue<number>(currentSubtitleOffset);
  const minimumValue = useSharedValue<number>(-30);
  const maximumValue = useSharedValue<number>(30);
  const steps = 600;

  const handleClose = () => {
    setVisibility(false);
  };

  const handleValueChange = (value: number) => {
    handleSubtitleOffsetChange(value);
  };

  return (
    <BlurView
      intensity={100}
      tint={"dark"}
      className='absolute top-24 left-6 right-6 flex flex-col p-4'
    >
      <View className='flex flex-row justify-center'>
        <Text className='text-white text-2xl'>
          Subtitle Offset: {subtitleOffset.value.toFixed(1)}s
        </Text>
        <TouchableOpacity
          onPress={handleClose}
          className='absolute justify-center right-1'
        >
          <Ionicons name='close' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
      </View>
      <Slider
        style={{ marginTop: 16 }}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        steps={steps}
        progress={subtitleOffset}
        forceSnapToStep={true}
        onValueChange={handleValueChange}
        bubble={(val) => `${val.toFixed(1)}s`}
      ></Slider>
    </BlurView>
  );
};
