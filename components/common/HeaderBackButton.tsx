import { Ionicons } from "@expo/vector-icons";
import { BlurView, type BlurViewProps } from "expo-blur";
import { useRouter } from "expo-router";
import {
  Platform,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";

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

  if (Platform.OS === "ios") {
    return (
      <TouchableOpacity
        onPress={() => router.back()}
        className='flex items-center justify-center w-9 h-9'
        {...touchableOpacityProps}
      >
        <Ionicons name='arrow-back' size={24} color='white' />
      </TouchableOpacity>
    );
  }

  if (background === "transparent" && Platform.OS !== "android")
    return (
      <TouchableOpacity
        onPress={() => router.back()}
        {...touchableOpacityProps}
      >
        <BlurView
          {...props}
          intensity={100}
          className='overflow-hidden rounded-full p-2'
        >
          <Ionicons
            className='drop-shadow-2xl'
            name='arrow-back'
            size={24}
            color='white'
          />
        </BlurView>
      </TouchableOpacity>
    );

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      className=' rounded-full p-2'
      {...touchableOpacityProps}
    >
      <Ionicons
        className='drop-shadow-2xl'
        name='arrow-back'
        size={24}
        color='white'
      />
    </TouchableOpacity>
  );
};
