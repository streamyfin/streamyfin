import { ParallaxScrollView } from "@/components/ParallaxPage";
import { Text } from "@/components/common/Text";
import { FlashList } from "@shopify/flash-list";
import { useFocusEffect } from "expo-router";
import type React from "react";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Dimensions, View, type ViewProps } from "react-native";
import { Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ANIMATION_ENTER = 250;
const ANIMATION_EXIT = 250;
const BACKDROP_DURATION = 5000;

type Render = React.ComponentType<any> | React.ReactElement | null | undefined;

interface Props<T> {
  data: T[];
  images: string[];
  logo?: React.ReactElement;
  HeaderContent?: () => React.ReactElement;
  MainContent?: () => React.ReactElement;
  listHeader: string;
  renderItem: (item: T, index: number) => Render;
  keyExtractor: (item: T) => string;
  onEndReached?: (() => void) | null | undefined;
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
  ...props
}: PropsWithChildren<Props<T> & ViewProps>) => {
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

  useEffect(() => {
    if (images?.length) {
      enterAnimation().start();

      const intervalId = setInterval(() => {
        Animated.sequence([enterAnimation(), exitAnimation()]).start(() => {
          fadeAnim.setValue(0);
          setCurrentIndex((prevIndex) => (prevIndex + 1) % images?.length);
        });
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
            <View className='flex flex-col w-full'>
              {HeaderContent && HeaderContent()}
            </View>
          </View>
          {MainContent && MainContent()}
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
              //@ts-ignore
              renderItem={({ item, index }) => renderItem(item, index)}
              keyExtractor={keyExtractor}
              numColumns={3}
              estimatedItemSize={214}
              ItemSeparatorComponent={() => <View className='h-2 w-2' />}
            />
          </View>
        </View>
      </ParallaxScrollView>
    </View>
  );
};

export default ParallaxSlideShow;
