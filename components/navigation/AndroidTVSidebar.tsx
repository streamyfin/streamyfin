import { Ionicons } from "@expo/vector-icons";
import { useSegments } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { Colors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";

export const ANDROID_TV_SIDEBAR_WIDTH = 60;
export const ANDROID_TV_SIDEBAR_EXPANDED_WIDTH = 180;

const ITEM_SIZE = 46;
const ICON_SIZE = 20;
const INACTIVE_ICON_COLOR = "rgba(209, 213, 219, 0.68)";
const COLLAPSED_HORIZONTAL_PADDING = 7;
const COLLAPSED_ICON_COLUMN_WIDTH =
  ANDROID_TV_SIDEBAR_WIDTH - COLLAPSED_HORIZONTAL_PADDING * 2;

type AndroidTVSidebarItemProps = {
  focused: boolean;
  icon: unknown;
  label: string;
  expanded: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
};

export type AndroidTVSidebarRoute = {
  id: string;
  label: string;
  href: string;
  icon: number;
  visible: boolean;
};

function AndroidTVSidebarItem({
  focused,
  icon,
  label,
  expanded,
  onFocus,
  onBlur,
  onPress,
}: AndroidTVSidebarItemProps) {
  const typography = useScaledTVTypography();
  const {
    focused: tvFocused,
    handleFocus,
    handleBlur,
    animatedStyle,
  } = useTVFocusAnimation({
    scaleAmount: 1.04,
    duration: 120,
    onFocus,
    onBlur,
  });

  const iconSource = useMemo(() => {
    if (!icon || typeof icon !== "number") return null;
    return Image.resolveAssetSource(icon);
  }, [icon]);

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      focusable
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            height: ITEM_SIZE,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: tvFocused
              ? "rgba(238, 225, 246, 0.95)"
              : focused
                ? "rgba(147, 52, 233, 0.2)"
                : "transparent",
          },
        ]}
      >
        <View
          style={{
            width: COLLAPSED_ICON_COLUMN_WIDTH,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {iconSource ? (
            <Image
              source={iconSource}
              resizeMode='contain'
              style={{
                width: ICON_SIZE,
                height: ICON_SIZE,
                tintColor: tvFocused
                  ? "#000000"
                  : focused
                    ? Colors.primary
                    : INACTIVE_ICON_COLOR,
              }}
            />
          ) : (
            <Ionicons
              name='ellipse-outline'
              size={ICON_SIZE}
              color={
                tvFocused
                  ? "#000000"
                  : focused
                    ? Colors.primary
                    : INACTIVE_ICON_COLOR
              }
            />
          )}
        </View>
        {expanded && (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              marginLeft: 14,
              marginRight: 16,
              fontSize: typography.callout,
              fontWeight: tvFocused || focused ? "700" : "500",
              color: tvFocused ? "#000000" : "#FFFFFF",
            }}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function AndroidTVSidebar({
  routes,
  onExpandedChange,
  onNavigate,
}: {
  routes: AndroidTVSidebarRoute[];
  onExpandedChange?: (expanded: boolean) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visibleRoutes = routes.filter((route) => route.visible);

  const handleItemFocus = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setExpanded(true);
    onExpandedChange?.(true);
  }, [onExpandedChange]);

  const handleItemBlur = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setExpanded(false);
      onExpandedChange?.(false);
    }, 80);
  }, [onExpandedChange]);

  return (
    <View
      pointerEvents='box-none'
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "transparent",
        paddingTop: 96,
        paddingHorizontal: COLLAPSED_HORIZONTAL_PADDING,
        zIndex: 100,
      }}
    >
      <View style={{ gap: 12 }}>
        {visibleRoutes.map((route) => {
          const focused = segments.includes(route.id);

          return (
            <AndroidTVSidebarItem
              key={route.id}
              focused={focused}
              icon={route.icon}
              label={route.label}
              expanded={expanded}
              onFocus={handleItemFocus}
              onBlur={handleItemBlur}
              onPress={() => {
                if (closeTimer.current) clearTimeout(closeTimer.current);
                setExpanded(false);
                onExpandedChange?.(false);
                router.navigate(route.href as any);
                onNavigate?.();
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

export function HideAndroidTVNativeTabBar() {
  return null;
}
