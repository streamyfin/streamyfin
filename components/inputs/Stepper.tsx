import {TouchableOpacity, View} from "react-native";
import {Text} from "@/components/common/Text";
import DisabledSetting from "@/components/settings/DisabledSetting";

interface StepperProps {
  value: number,
  disabled?: boolean,
  step: number,
  min: number,
  max: number,
  onUpdate: (value: number) => void,
  appendValue?: string,
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  disabled,
  step,
  min,
  max,
  onUpdate,
  appendValue
}) => {
  return (
    <DisabledSetting
      disabled={disabled === true}
      showText={false}
      className="flex flex-row items-center"
    >
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
    </DisabledSetting>
  )
}