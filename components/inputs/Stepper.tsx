import {TouchableOpacity, View} from "react-native";
import {Text} from "@/components/common/Text";

interface StepperProps {
  value: number,
  step: number,
  min: number,
  max: number,
  onUpdate: (value: number) => void,
  appendValue?: string,
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  step,
  min,
  max,
  onUpdate,
  appendValue
}) => {
  return (
    <View className="flex flex-row items-center">
      <TouchableOpacity
        onPress={() => onUpdate(Math.max(min, value - step))}
        className="w-8 h-8 bg-neutral-800 rounded-l-lg flex items-center justify-center"
      >
        <Text>-</Text>
      </TouchableOpacity>
      <Text
        className={
          "w-auto h-8 bg-neutral-800 py-2 px-1 flex items-center justify-center" + (appendValue ? "first-letter:px-2" : "")
        }
      >
        {value}{appendValue}
      </Text>
      <TouchableOpacity
        className="w-8 h-8 bg-neutral-800 rounded-r-lg flex items-center justify-center"
        onPress={() => onUpdate(Math.min(max, value + step))}
      >
        <Text>+</Text>
      </TouchableOpacity>
    </View>
  )
}