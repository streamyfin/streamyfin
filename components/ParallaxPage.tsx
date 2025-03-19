import { LinearGradient } from "expo-linear-gradient";
import type { PropsWithChildren, ReactElement } from "react";
import {
  type NativeScrollEvent,
  NativeSyntheticEvent,
  View,
  type ViewProps,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from "react-native-reanimated";

interface Props extends ViewProps {
  headerImage: ReactElement;
  logo?: ReactElement;
  episodePoster?: ReactElement;
  headerHeight?: number;
  onEndReached?: (() => void) | null | undefined;
}

export const ParallaxScrollView: React.FC<PropsWithChildren<Props>> = ({
  children,
  headerImage,
  episodePoster,
  headerHeight = 400,
  logo,
  onEndReached,
  ...props
}: Props) => {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(scrollRef);

  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-headerHeight, 0, headerHeight],
            [-headerHeight / 2, 0, headerHeight * 0.75],
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-headerHeight, 0, headerHeight],
            [2, 1, 1],
          ),
        },
      ],
    };
  });

  function isCloseToBottom({
    layoutMeasurement,
    contentOffset,
    contentSize,
  }: NativeScrollEvent) {
    return (
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 20
    );
  }

  return (
    <View className='flex-1' {...props}>
      <Animated.ScrollView
        style={{
          position: "relative",
        }}
        ref={scrollRef}
        scrollEventThrottle={16}
        onScroll={(e) => {
          if (isCloseToBottom(e.nativeEvent)) onEndReached?.();
        }}
      >
        {logo && (
          <View
            style={{
              top: headerHeight - 200,
              height: 130,
            }}
            className='absolute left-0 w-full z-40 px-4 flex justify-center items-center'
          >
            {logo}
          </View>
        )}

        <Animated.View
          style={[
            {
              height: headerHeight,
              backgroundColor: "black",
            },
            headerAnimatedStyle,
          ]}
        >
          {headerImage}
        </Animated.View>

        <View
          style={{
            top: -50,
          }}
          className='relative flex-1  bg-transparent pb-24'
        >
          <LinearGradient
            // Background Linear Gradient
            colors={["transparent", "rgba(0,0,0,1)"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: -150,
              height: 200,
            }}
          />
          <View
            // Background Linear Gradient
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 50,
              height: "100%",
              backgroundColor: "black",
            }}
          />
          {children}
        </View>
      </Animated.ScrollView>
    </View>
  );
};
