import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";

const DisabledSetting: React.FC<
  { disabled: boolean; showText?: boolean; text?: string } & ViewProps
> = ({ disabled = false, showText = true, text, children, ...props }) => (
  <View
    pointerEvents={disabled ? "none" : "auto"}
    style={{
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <View {...props}>
      {children}
      {disabled && showText && (
        <Text className='text-xs text-red-600 px-4 mt-1'>
          {text ?? "Disabled by admin"}
        </Text>
      )}
    </View>
  </View>
);

export default DisabledSetting;
