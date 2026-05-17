import { Ionicons } from "@expo/vector-icons";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { useTVDesignTokens } from "@/constants/TVSizes";
import { TVButton } from "./TVButton";

export interface TVRefreshButtonProps {
  itemId: string | undefined;
  queryClient?: QueryClient;
}

export const TVRefreshButton: React.FC<TVRefreshButtonProps> = ({
  itemId,
  queryClient: externalQueryClient,
}) => {
  const defaultQueryClient = useQueryClient();
  const queryClient = externalQueryClient ?? defaultQueryClient;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const spinValue = useRef(new Animated.Value(0)).current;
  const tv = useTVDesignTokens();

  useEffect(() => {
    if (isRefreshing) {
      spinValue.setValue(0);
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinValue.stopAnimation();
      spinValue.setValue(0);
    }
  }, [isRefreshing, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const handleRefresh = useCallback(async () => {
    if (!itemId || isRefreshing) return;

    setIsRefreshing(true);
    const minSpinTime = new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["item", itemId] }),
        minSpinTime,
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [itemId, queryClient, isRefreshing]);

  return (
    <TVButton
      onPress={handleRefresh}
      variant='glass'
      square
      disabled={isRefreshing}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Ionicons name='refresh' size={tv.size(28)} color='#FFFFFF' />
      </Animated.View>
    </TVButton>
  );
};
