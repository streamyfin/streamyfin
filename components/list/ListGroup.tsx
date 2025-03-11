import { PropsWithChildren } from "react";
import { View, ViewProps } from "react-native";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  title?: string;
  subtitle?: string;
}

export const ListGroup: React.FC<PropsWithChildren<Props>> = ({
  title,
  subtitle,
  children,
  className,
  ...props
}) => {
  return (
    <View className={`mb-4 ${className || ""}`} {...props}>
      {title && (
        <View className="px-4 mb-1">
          <Text className="text-neutral-500 text-xs uppercase">{title}</Text>
        </View>
      )}
      <View className="rounded-xl overflow-hidden">
        {children}
      </View>
      {subtitle && (
        <View className="px-4 mt-1">
          <Text className="text-neutral-500 text-xs">{subtitle}</Text>
        </View>
      )}
    </View>
  );
};