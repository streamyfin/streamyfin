import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  Platform,
} from "react-native";

interface Props extends ActivityIndicatorProps {}

export const Loader: React.FC<Props> = ({ ...props }) => {
  return (
    <ActivityIndicator
      // No purple accent on TV (docs/conventions/tv.md), and a spinner that
      // reads from across the room.
      size={Platform.isTV ? "large" : "small"}
      color={Platform.isTV || Platform.OS === "ios" ? "white" : "#9333ea"}
      {...props}
    />
  );
};
