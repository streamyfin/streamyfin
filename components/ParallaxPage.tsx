import { LinearGradient } from "expo-linear-gradient";
import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useMemo,
} from "react";
import { type NativeScrollEvent, View, type ViewProps } from "react-native";
import Animated, {
  type AnimatedRef,
  interpolate,
  type SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ParallaxPageColors } from "@/constants/Colors";
import { LOGO_HEIGHT } from "@/constants/Images";

/**
 * The page's scroll, for content that follows it, such as a header that stays
 * in view while its section passes. Null outside a parallax page.
 */
export interface ParallaxScroll {
  /** How far the page has scrolled, as the page is drawn. */
  offset: SharedValue<number>;
  /** The scroll view, to measure or to scroll. */
  view: AnimatedRef<Animated.ScrollView>;
  /**
   * A mark at the top of the scrolled content. A view measured with it gets
   * its place in the content: both measures read the same layout, so they
   * share its scroll position, which trails the one the page is drawn at.
   */
  origin: AnimatedRef<Animated.View>;
}

export const ParallaxScrollContext = createContext<ParallaxScroll | null>(null);

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
  const originRef = useAnimatedRef<Animated.View>();
  const scrollOffset = useScrollViewOffset(scrollRef);
  const insets = useSafeAreaInsets();
  const scroll = useMemo(
    () => ({ offset: scrollOffset, view: scrollRef, origin: originRef }),
    [scrollOffset, scrollRef, originRef],
  );

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
        <Animated.View ref={originRef} collapsable={false} />
        {logo && (
          <View
            style={{
              top: headerHeight - 200,
              height: LOGO_HEIGHT,
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
              backgroundColor: ParallaxPageColors.background,
            },
            headerAnimatedStyle,
          ]}
        >
          {headerImage}
        </Animated.View>

        <View
          style={{
            top: -50,
            // Clear the translucent tab bar so the last section stays readable
            paddingBottom: insets.bottom + 32,
          }}
          className='relative flex-1 bg-transparent'
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
              backgroundColor: ParallaxPageColors.background,
            }}
          />
          <ParallaxScrollContext.Provider value={scroll}>
            {children}
          </ParallaxScrollContext.Provider>
        </View>
      </Animated.ScrollView>
    </View>
  );
};
