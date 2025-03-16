import { View, type ViewProps } from "react-native";
import { Text } from "./common/Text";

interface Props extends ViewProps {
  text?: string | number | null;
  variant?: "gray" | "purple";
  iconLeft?: React.ReactNode;
}

export const Badge: React.FC<Props> = ({
  iconLeft,
  text,
  variant = "purple",
  ...props
}) => {
  return (
    <View
      {...props}
      className={`
      rounded p-1 shrink grow-0 self-start flex flex-row items-center px-1.5
      ${variant === "purple" && "bg-purple-600"}
      ${variant === "gray" && "bg-neutral-800"}
      `}
    >
      {iconLeft && <View className='mr-1'>{iconLeft}</View>}
      <Text
        className={`
          text-xs
          ${variant === "purple" && "text-white"}
      `}
      >
        {text}
      </Text>
    </View>
  );
};
