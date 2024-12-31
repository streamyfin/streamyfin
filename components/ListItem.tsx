import { PropsWithChildren, ReactNode } from "react";
import { View, ViewProps } from "react-native";
import { Text } from "./common/Text";

interface Props extends ViewProps {
  title?: string | null | undefined;
  subTitle?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
}

export const ListItem: React.FC<PropsWithChildren<Props>> = ({
  title,
  subTitle,
  iconAfter,
  children,
  ...props
}) => {
  return (
    <View
      className="flex flex-row items-center justify-between bg-neutral-900 p-4"
      {...props}
    >
      <View className="flex flex-col overflow-visible">
        <Text className="font-bold ">{title}</Text>
        {subTitle && (
          <Text uiTextView selectable className="text-xs text-neutral-400">
            {subTitle}
          </Text>
        )}
      </View>
      {iconAfter}
    </View>
  );
};
