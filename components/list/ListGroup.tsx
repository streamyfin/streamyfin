import {
  Children,
  type PropsWithChildren,
  type ReactElement,
  cloneElement,
  isValidElement,
} from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { Text } from "../common/Text";
import { ListItem } from "./ListItem";

interface Props extends ViewProps {
  title?: string | null | undefined;
  description?: ReactElement;
}

export const ListGroup: React.FC<PropsWithChildren<Props>> = ({
  title,
  children,
  description,
  ...props
}) => {
  const childrenArray = Children.toArray(children);

  return (
    <View {...props}>
      <Text className='ml-4 mb-1 uppercase text-[#8E8D91] text-xs'>
        {title}
      </Text>
      <View
        style={[]}
        className='flex flex-col rounded-xl overflow-hidden pl-0 bg-neutral-900'
      >
        {Children.map(childrenArray, (child, index) => {
          if (isValidElement<{ style?: ViewStyle }>(child)) {
            return cloneElement(child as any, {
              style: StyleSheet.compose(
                child.props.style,
                index < childrenArray.length - 1
                  ? styles.borderBottom
                  : undefined,
              ),
            });
          }
          return child;
        })}
      </View>
      {description && <View className='pl-4 mt-1'>{description}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#3D3C40",
  },
});
