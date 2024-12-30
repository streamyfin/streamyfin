import {
  Platform,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView, BlurViewProps } from "expo-blur";

interface Props extends BlurViewProps {
  background?: "blur" | "transparent";
  touchableOpacityProps?: TouchableOpacityProps;
}

export const HeaderBackButton: React.FC<Props> = ({
  background = "transparent",
  touchableOpacityProps,
  ...props
}) => {
  const router = useRouter();

  if (background === "transparent" && Platform.OS !== "android")
    return (
      <TouchableOpacity
        onPress={() => router.back()}
        {...touchableOpacityProps}
      >
        <BlurView
          {...props}
          intensity={100}
          className="overflow-hidden rounded-full p-2"
        >
          <Ionicons
            className="drop-shadow-2xl"
            name="arrow-back"
            size={24}
            color="white"
          />
        </BlurView>
      </TouchableOpacity>
    );

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      className=" bg-neutral-800/80 rounded-full p-2"
      {...touchableOpacityProps}
    >
      <Ionicons
        className="drop-shadow-2xl"
        name="arrow-back"
        size={24}
        color="white"
      />
    </TouchableOpacity>
  );
};
