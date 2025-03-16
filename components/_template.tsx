import { Text } from "@/components/common/Text";
import { View, type ViewProps } from "react-native";

interface Props extends ViewProps {}

export const TitleHeader: React.FC<Props> = ({ ...props }) => {
  return (
    <View {...props}>
      <Text></Text>
    </View>
  );
};
