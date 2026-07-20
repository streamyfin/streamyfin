import { Feather } from "@expo/vector-icons";
import { BlurView, type BlurViewProps } from "expo-blur";
import { Platform } from "react-native";
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

  if (Platform.OS === "ios") {
    return (
      <Pressable
        onPress={() => router.back()}
        className='flex items-center justify-center w-9 h-9'
        {...pressableProps}
      >
        <Feather name='chevron-left' size={28} color='white' />
      </Pressable>
    );
  }

  if (background === "transparent" && Platform.OS !== "android")
    return (
      <Pressable onPress={() => router.back()} {...pressableProps}>
        <BlurView
          {...props}
          intensity={100}
          className='overflow-hidden rounded-full p-2'
        >
          <Feather
            className='drop-shadow-2xl'
            name='chevron-left'
            size={28}
            color='white'
          />
        </BlurView>
      </Pressable>
    );

  return (
    <Pressable
      onPress={() => router.back()}
      // Match the Settings page back button: chevron flush to the edge with a
      // 16px gap before the title (the old `p-2` pushed both arrow and title
      // too far right). drop-shadow keeps it readable over images. hitSlop
      // keeps the touch area at ~44dp now that the padding is gone.
      style={{ marginRight: 16 }}
      {...pressableProps}
      hitSlop={8}
    >
      <Feather
        className='drop-shadow-2xl'
        name='chevron-left'
        size={28}
        color='white'
      />
    </Pressable>
  );
};
