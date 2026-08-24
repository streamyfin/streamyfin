import { TouchableOpacity, View } from "react-native";
import { Colors } from "@/constants/Colors";
import { Text } from "./Text";

type Props = {
  title: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onPressAction?: () => void;
  /** Drawn at the end of the row — a count pill, a small action. */
  accessory?: React.ReactNode;
};

export const SectionHeader: React.FC<Props> = ({
  title,
  actionLabel,
  actionDisabled = false,
  onPressAction,
  accessory,
}) => {
  const shouldShowAction = Boolean(actionLabel) && Boolean(onPressAction);

  return (
    <View className='px-4 flex flex-row items-center justify-between mb-2'>
      <Text className='text-lg font-bold text-neutral-100'>{title}</Text>
      {accessory}
      {shouldShowAction && (
        <TouchableOpacity
          onPress={onPressAction}
          disabled={actionDisabled}
          accessibilityRole='button'
          accessibilityLabel={actionLabel}
          className='py-1 pl-3'
        >
          <Text
            style={{
              color: actionDisabled ? "rgba(255,255,255,0.4)" : Colors.primary,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
