import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  TVFocusGuideView,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { tvAccountActionModalAtom } from "@/utils/atoms/tvAccountActionModal";
import { store } from "@/utils/store";

// Action card component
const TVAccountActionCard: React.FC<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "destructive";
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, icon, variant = "default", hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const typography = useScaledTVTypography();

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const isDestructive = variant === "destructive";

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          height: 60,
          backgroundColor: focused
            ? isDestructive
              ? "#ef4444"
              : "#fff"
            : isDestructive
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
          gap: 12,
        }}
      >
        <Ionicons
          name={icon}
          size={22}
          color={
            focused
              ? isDestructive
                ? "#fff"
                : "#000"
              : isDestructive
                ? "#ef4444"
                : "#fff"
          }
        />
        <Text
          style={{
            fontSize: typography.callout,
            color: focused
              ? isDestructive
                ? "#fff"
                : "#000"
              : isDestructive
                ? "#ef4444"
                : "#fff",
            fontWeight: "600",
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export default function TVAccountActionModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvAccountActionModalAtom);
  const { t } = useTranslation();

  const [isReady, setIsReady] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  // Animate in on mount
  useEffect(() => {
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(200);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => setIsReady(true), 100);
    return () => {
      clearTimeout(timer);
      store.set(tvAccountActionModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  const handleLogin = () => {
    modalState?.onLogin();
    router.back();
  };

  const handleDelete = () => {
    modalState?.onDelete();
    router.back();
  };

  if (!modalState) {
    return null;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        opacity: overlayOpacity,
      }}
    >
      <Animated.View
        style={{
          width: "100%",
          transform: [{ translateY: sheetTranslateY }],
        }}
      >
        <BlurView
          intensity={80}
          tint='dark'
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: "hidden",
          }}
        >
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={{
              paddingTop: 24,
              paddingBottom: 50,
              overflow: "visible",
            }}
          >
            {/* Account username as title */}
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "600",
                color: "#FFFFFF",
                marginBottom: 4,
                paddingHorizontal: 48,
              }}
            >
              {modalState.account.username}
            </Text>

            {/* Server name as subtitle */}
            <Text
              style={{
                fontSize: typography.callout,
                fontWeight: "500",
                color: "rgba(255,255,255,0.6)",
                marginBottom: 16,
                paddingHorizontal: 48,
              }}
            >
              {modalState.server.name || modalState.server.address}
            </Text>

            {/* Horizontal options */}
            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ overflow: "visible" }}
                contentContainerStyle={{
                  paddingHorizontal: 48,
                  paddingVertical: 10,
                  gap: 12,
                }}
              >
                <TVAccountActionCard
                  label={t("common.login")}
                  icon='log-in-outline'
                  hasTVPreferredFocus
                  onPress={handleLogin}
                />
                <TVAccountActionCard
                  label={t("common.delete")}
                  icon='trash-outline'
                  variant='destructive'
                  onPress={handleDelete}
                />
              </ScrollView>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}
