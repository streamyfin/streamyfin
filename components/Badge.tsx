import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { GlassEffectView } from "react-native-glass-effect-view";
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
  const content = (
    <View style={styles.content}>
      {iconLeft && <View style={styles.iconLeft}>{iconLeft}</View>}
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

  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <View {...props} style={[styles.container, props.style]}>
        <GlassEffectView style={{ borderRadius: 100 }}>
          {content}
        </GlassEffectView>
      </View>
    );
  }

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

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    alignSelf: "flex-start",
    flexShrink: 1,
    flexGrow: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: "transparent",
  },
  iconLeft: {
    marginRight: 4,
  },
});
