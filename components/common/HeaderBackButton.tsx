import { Ionicons } from "@expo/vector-icons";
import { BlurView, type BlurViewProps } from "expo-blur";
import { Keyboard, Platform } from "react-native";
import { Pressable, type PressableProps } from "react-native-gesture-handler";
import useRouter from "@/hooks/useAppRouter";

interface Props extends BlurViewProps {
  background?: "blur" | "transparent";
  pressableProps?: Omit<PressableProps, "onPress">;
}

export const HeaderBackButton: React.FC<Props> = ({
  background = "transparent",
  pressableProps,
  ...props
}) => {
  const router = useRouter();

  // Dismiss the keyboard before navigating — otherwise it lingers over the
  // previous screen (e.g. leaving the Jellyseerr login while typing).
  const handleBack = () => {
    Keyboard.dismiss();
    router.back();
  };

  if (Platform.OS === "ios") {
    return (
      <Pressable
        onPress={handleBack}
        className='flex items-center justify-center w-9 h-9'
        {...pressableProps}
      >
        <Ionicons name='arrow-back' size={24} color='white' />
      </Pressable>
    );
  }

  if (background === "transparent" && Platform.OS !== "android")
    return (
      <Pressable onPress={handleBack} {...pressableProps}>
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
      </Pressable>
    );

  return (
    <Pressable
      onPress={handleBack}
      className=' rounded-full p-2'
      {...pressableProps}
    >
      <Ionicons
        className='drop-shadow-2xl'
        name='arrow-back'
        size={24}
        color='white'
      />
    </Pressable>
  );
};
