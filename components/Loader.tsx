import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  Platform,
} from "react-native";

interface Props extends ActivityIndicatorProps {}

export const Loader: React.FC<Props> = ({ ...props }) => {
  return (
    <ActivityIndicator
      size={"small"}
      color={Platform.OS === "ios" ? "white" : "#9333ea"}
      {...props}
    />
  );
};
