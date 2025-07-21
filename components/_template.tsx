import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";

interface Props extends ViewProps {}

export const TitleHeader: React.FC<Props> = ({ ...props }) => {
  return (
    <View {...props}>
      <Text />
    </View>
  );
};
