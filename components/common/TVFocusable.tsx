import React, { ReactNode, useEffect, useRef, forwardRef } from "react";
import {
  Platform,
  View,
  ViewProps,
  StyleSheet,
  TouchableOpacity,
  findNodeHandle,
} from "react-native";

interface TVFocusableProps extends ViewProps {
  children: ReactNode;
  hasTVPreferredFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelect?: () => void;
  forceFocus?: boolean;
}

/**
 * A wrapper component that makes its children focusable on TV platforms
 * without causing React errors.
 */
export const TVFocusable = forwardRef<any, TVFocusableProps>(
  (
    {
      children,
      hasTVPreferredFocus = false,
      forceFocus = false,
      style,
      onFocus,
      onBlur,
      onSelect,
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const localRef = useRef(null);

    // Use the forwarded ref if available, otherwise use our local ref
    const touchableRef = ref || localRef;

    // Force focus on mount if hasTVPreferredFocus is true
    useEffect(() => {
      if (
        Platform.isTV &&
        (hasTVPreferredFocus || forceFocus) &&
        touchableRef.current
      ) {
        // Give time for the component to fully mount
        const timer = setTimeout(() => {
          try {
            // @ts-ignore - requestTVFocus is not in the type definitions
            touchableRef.current?.setNativeProps?.({
              hasTVPreferredFocus: true,
            });

            // Fallback to direct focus request
            const tag = findNodeHandle(touchableRef.current);
            if (tag) {
              // @ts-ignore
              touchableRef.current?.requestTVFocus?.();
            }
          } catch (e) {
            console.warn("Failed to request TV focus:", e);
          }
        }, 300);

        return () => clearTimeout(timer);
      }
    }, [hasTVPreferredFocus, forceFocus, touchableRef]);

    if (Platform.isTV) {
      return (
        <TouchableOpacity
          ref={touchableRef}
          accessible={true}
          focusable={true}
          hasTVPreferredFocus={hasTVPreferredFocus}
          tvParallaxProperties={{ enabled: false }}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          onPress={() => {
            // Handle both press and select events for TV
            onSelect?.();
          }}
          // Add TV-specific select handler
          onTouchUpCapture={() => {
            if (Platform.isTV) {
              onSelect?.();
            }
          }}
          // Add TV-specific press handler
          onClick={() => {
            if (Platform.isTV) {
              onSelect?.();
            }
          }}
          activeOpacity={0.8}
          style={[styles.container, style, isFocused && styles.focused]}
          {...props}
        >
          {children}
        </TouchableOpacity>
      );
    }

    return (
      <View ref={touchableRef} style={style} {...props}>
        {children}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  focused: {
    transform: [{ scale: 1.05 }],
    borderWidth: 2,
    borderColor: "#8b5cf6", // Purple border for focus
    borderRadius: 12,
  },
});
