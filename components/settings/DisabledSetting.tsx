import { Text } from "@/components/common/Text";
import { View, type ViewProps } from "react-native";

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
      {disabled && showText && (
        <Text className='text-center text-red-700 my-4'>
          {text ?? "Currently disabled by admin."}
        </Text>
      )}
      {children}
    </View>
  </View>
);

export default DisabledSetting;
