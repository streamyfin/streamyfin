import { FlashList } from "@shopify/flash-list";
import type React from "react";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { ParallaxScrollView } from "@/components/ParallaxPage";

const ANIMATION_ENTER = 250;
const ANIMATION_EXIT = 250;
const BACKDROP_DURATION = 5000;

type Render = React.ComponentType<any> | React.ReactElement | null | undefined;

const ItemSeparator = () => <View className='h-2 w-2' />;

interface ParallaxSlideShowProps<T> {
  data: T[];
  images: string[];
  logo?: React.ReactElement;
  HeaderContent?: () => React.ReactElement;
  MainContent?: () => React.ReactElement;
  listHeader: string;
  renderItem: (item: T, index: number) => Render;
  keyExtractor: (item: T) => string;
  onEndReached?: (() => void) | null;
}

const ParallaxSlideShow = <T,>({
  data,
  images,
  logo,
  HeaderContent,
  MainContent,
  listHeader,
  renderItem,
  keyExtractor,
  onEndReached,
}: PropsWithChildren<ParallaxSlideShowProps<T> & ViewProps>) => {
  const insets = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const enterAnimation = useCallback(
    () =>
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: ANIMATION_ENTER,
        useNativeDriver: true,
      }),
    [fadeAnim],
  );

  const exitAnimation = useCallback(
    () =>
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: ANIMATION_EXIT,
        useNativeDriver: true,
      }),
    [fadeAnim],
  );

  const handleAnimationComplete = useCallback(() => {
    fadeAnim.setValue(0);
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images?.length);
  }, [fadeAnim, images?.length, setCurrentIndex]);

  const createSlideSequence = useCallback(() => {
    return Animated.sequence([enterAnimation(), exitAnimation()]);
  }, [enterAnimation, exitAnimation]);

  useEffect(() => {
    if (images?.length) {
      enterAnimation().start();

      const intervalId = setInterval(() => {
        createSlideSequence().start(handleAnimationComplete);
      }, BACKDROP_DURATION);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [
    fadeAnim,
    images,
    enterAnimation,
    exitAnimation,
    setCurrentIndex,
    currentIndex,
    createSlideSequence,
    handleAnimationComplete,
  ]);

  return (
    <View
      className='flex-1 relative'
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ParallaxScrollView
        className='flex-1 opacity-100'
        headerHeight={300}
        onEndReached={onEndReached}
        headerImage={
          <Animated.Image
            key={images?.[currentIndex]}
            id={images?.[currentIndex]}
            source={{
              uri: images?.[currentIndex],
            }}
            style={{
              width: "100%",
              height: "100%",
              opacity: fadeAnim,
            }}
          />
        }
        logo={logo}
      >
        <View className='flex flex-col space-y-4 px-4'>
          <View className='flex flex-row justify-between w-full'>
            <View className='flex flex-col w-full'>{HeaderContent?.()}</View>
          </View>
          {MainContent?.()}
          <View>
            <FlashList
              data={data}
              ListEmptyComponent={
                <View className='flex flex-col items-center justify-center h-full'>
                  <Text className='font-bold text-xl text-neutral-500'>
                    No results
                  </Text>
                </View>
              }
              contentInsetAdjustmentBehavior='automatic'
              ListHeaderComponent={
                <Text className='text-lg font-bold my-2'>{listHeader}</Text>
              }
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const rendered = renderItem(item as any, index);
                if (!rendered) return null;
                // If the result is a component type, instantiate it
                if (typeof rendered === "function") {
                  const Comp: any = rendered;
                  return <Comp />;
                }
                return rendered as React.ReactElement;
              }}
              keyExtractor={keyExtractor}
              numColumns={3}
              estimatedItemSize={214}
              ItemSeparatorComponent={ItemSeparator}
            />
          </View>
        </View>
      </ParallaxScrollView>
    </View>
  );
};

export default ParallaxSlideShow;
