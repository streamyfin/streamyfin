import { Ionicons } from "@expo/vector-icons";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";

/**
 * The option group of the app's sheets: the lighter panel the music track
 * options use. The Settings screen's rows are the sheet's own colour and
 * would not read as a group here.
 */
export function SyncPlaySheetGroup({ children }: { children: ReactNode }) {
  // Rows come and go with the state, so the dividers are drawn between the
  // ones that are there.
  const rows = Children.toArray(children);
  return (
    <View className='flex-col rounded-xl overflow-hidden bg-neutral-800'>
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) ? row.key : index}>
          {index > 0 && <View style={styles.separator} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

interface RowProps {
  testID?: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Shown at the trailing edge, in the app's secondary colour. */
  value?: string;
  /** A control at the trailing edge, such as a switch. */
  children?: ReactNode;
  color?: string;
  disabled?: boolean;
  onPress?: () => void;
}

export function SyncPlaySheetRow({
  testID,
  icon,
  title,
  value,
  children,
  color = "white",
  disabled = false,
  onPress,
}: RowProps) {
  const content = (
    <>
      <Ionicons name={icon} size={22} color={color} />
      <Text className='ml-4 text-base flex-1' style={{ color }}>
        {title}
      </Text>
      {!!value && <Text className='text-[#9899A1] text-base'>{value}</Text>}
      {/* In a box of its own: the iOS Switch aligns itself to the top of its
          parent, whatever the row asks for. */}
      {!!children && <View>{children}</View>}
    </>
  );
  const style = { opacity: disabled ? 0.5 : 1 };
  if (!onPress)
    return (
      <View
        testID={testID}
        className='flex-row items-center px-4 min-h-[50px]'
        style={style}
      >
        {content}
      </View>
    );
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole='button'
      disabled={disabled}
      onPress={onPress}
      className='flex-row items-center px-4 min-h-[50px]'
      style={style}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
