import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Easing, View } from "react-native";
import { Image, prefetchServerImage } from "@/components/common/ServerImage";
import {
  TV_BACKDROP_CROSSFADE_MS,
  TV_BACKDROP_DEBOUNCE_MS,
} from "@/constants/TVSizes";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";

export interface TVHomeBackdropRef {
  handleItemFocus: (item: BaseItemDto) => void;
}

/**
 * Isolated dynamic backdrop component for TV Home screen.
 * Owns the focused item state, debounce timer, image prefetch and crossfade
 * animations so focus changes do not re-render the Home screen tree.
 */
export const TVHomeBackdrop = React.memo(
  forwardRef<TVHomeBackdropRef>((_props, ref) => {
    const api = useAtomValue(apiAtom);

    // Dynamic backdrop state with debounce
    const [focusedItem, setFocusedItem] = useState<BaseItemDto | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Handle item focus with debounce
    const handleItemFocus = useCallback((item: BaseItemDto) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        setFocusedItem(item);
      }, TV_BACKDROP_DEBOUNCE_MS);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        handleItemFocus,
      }),
      [handleItemFocus],
    );

    // Cleanup debounce timer on unmount
    useEffect(() => {
      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    }, []);

    // Get backdrop URL from focused item
    const backdropUrl = useMemo(() => {
      if (!focusedItem) return null;
      return getBackdropUrl({
        api,
        item: focusedItem,
        quality: 90,
        width: 1920,
      });
    }, [api, focusedItem]);

    // Crossfade animation for backdrop transitions. The layer shown is flipped
    // when the fade starts, not when it ends: an image that arrives mid-fade
    // then fades in over the layer fading out, instead of replacing the image
    // still fading in. Flipped any earlier, an image arriving before the fade
    // started would be put on the layer still on screen.
    const activeLayer = useRef<0 | 1>(0);
    const [layer0Url, setLayer0Url] = useState<string | null>(null);
    const [layer1Url, setLayer1Url] = useState<string | null>(null);
    const layer0Opacity = useRef(new Animated.Value(0)).current;
    const layer1Opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (!backdropUrl) return;

      let isCancelled = false;

      const performCrossfade = async () => {
        // Prefetch to disk only - the full-size 1920x1080 backdrop (~8MB
        // decoded ARGB) is too large to pin in the memory cache on every
        // focus change. Disk cache is fast enough for a 500ms crossfade.
        try {
          await prefetchServerImage(backdropUrl, api?.basePath, "disk");
        } catch {
          // Continue even if prefetch fails
        }

        if (isCancelled) return;

        // Determine which layer to fade in
        const incomingLayer = activeLayer.current === 0 ? 1 : 0;
        const incomingOpacity =
          incomingLayer === 0 ? layer0Opacity : layer1Opacity;
        const outgoingOpacity =
          incomingLayer === 0 ? layer1Opacity : layer0Opacity;

        // Set the new URL on the incoming layer
        if (incomingLayer === 0) {
          setLayer0Url(backdropUrl);
        } else {
          setLayer1Url(backdropUrl);
        }

        // Small delay to ensure image component has the new URL
        await new Promise((resolve) => setTimeout(resolve, 50));

        if (isCancelled) return;

        // Crossfade: fade in the incoming layer, fade out the outgoing
        activeLayer.current = incomingLayer;
        Animated.parallel([
          Animated.timing(incomingOpacity, {
            toValue: 1,
            duration: TV_BACKDROP_CROSSFADE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(outgoingOpacity, {
            toValue: 0,
            duration: TV_BACKDROP_CROSSFADE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      };

      performCrossfade();

      return () => {
        isCancelled = true;
      };
    }, [backdropUrl, api?.basePath]);

    return (
      <View
        pointerEvents='none'
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {/* Layer 0 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer0Opacity,
          }}
        >
          {layer0Url && (
            <Image
              source={{ uri: layer0Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          )}
        </Animated.View>
        {/* Layer 1 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer1Opacity,
          }}
        >
          {layer1Url && (
            <Image
              source={{ uri: layer1Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          )}
        </Animated.View>
        {/* Gradient overlays for readability */}
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.4, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "100%",
          }}
        />
      </View>
    );
  }),
);
