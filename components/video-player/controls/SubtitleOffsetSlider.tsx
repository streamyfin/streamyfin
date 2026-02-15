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

  const handleDecrement = () => {
    const newValue = Math.max(
      currentSubtitleOffset * -1 - 0.1,
      minimumValue.value,
    );
    handleValueChange(newValue);
  };

  const handleIncrement = () => {
    const newValue = Math.min(
      currentSubtitleOffset * -1 + 0.1,
      maximumValue.value,
    );
    handleValueChange(newValue);
  };

  const handleValueChange = (value: number) => {
    // Negate the value to match the expected offset direction
    handleSubtitleOffsetChange(value * -1);
  };

  return (
    <BlurView
      intensity={100}
      tint={"dark"}
      className='absolute top-24 left-6 right-6 flex flex-col p-4'
    >
      <View className='flex flex-row justify-center'>
        <Text className='text-white text-2xl'>
          Subtitle Offset: {(currentSubtitleOffset * -1).toFixed(1)}s
        </Text>
        <TouchableOpacity
          onPress={handleClose}
          className='absolute justify-center right-0'
        >
          <Ionicons name='close' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
      </View>
      <View className='flex flex-row'>
        <TouchableOpacity
          onPress={handleDecrement}
          className='absolute justify-center left-1'
        >
          <Ionicons name='remove' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
        <Slider
          style={{ marginTop: 10, marginHorizontal: 32 }}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          steps={steps}
          progress={subtitleOffset}
          forceSnapToStep={true}
          onValueChange={handleValueChange}
          bubble={(val) => `${val.toFixed(1)}s`}
        ></Slider>
        <TouchableOpacity
          onPress={handleIncrement}
          className='absolute justify-center right-1'
        >
          <Ionicons name='add' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
};
