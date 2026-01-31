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
import { TVUserCard } from "@/components/tv/TVUserCard";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { tvAccountSelectModalAtom } from "@/utils/atoms/tvAccountSelectModal";
import { store } from "@/utils/store";

// Action button for bottom sheet
const TVAccountSelectAction: React.FC<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "destructive";
  onPress: () => void;
}> = ({ label, icon, variant = "default", onPress }) => {
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
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          backgroundColor: focused
            ? isDestructive
              ? "#ef4444"
              : "#fff"
            : isDestructive
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          minHeight: 72,
          gap: 14,
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

export default function TVAccountSelectModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvAccountSelectModalAtom);
  const { t } = useTranslation();

  const [isReady, setIsReady] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(300)).current;

  // Animate in on mount
  useEffect(() => {
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(300);

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
      store.set(tvAccountSelectModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

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
            {/* Title */}
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "600",
                color: "#FFFFFF",
                marginBottom: 4,
                paddingHorizontal: 48,
              }}
            >
              {t("server.select_account")}
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

            {/* All options in single horizontal row */}
            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ overflow: "visible" }}
                contentContainerStyle={{
                  paddingHorizontal: 48,
                  paddingVertical: 20,
                  gap: 16,
                }}
              >
                {modalState.server.accounts?.map((account, index) => (
                  <TVUserCard
                    key={account.userId}
                    username={account.username}
                    securityType={account.securityType}
                    onPress={() => {
                      modalState.onAccountAction(account);
                    }}
                    hasTVPreferredFocus={index === 0}
                  />
                ))}
                <TVAccountSelectAction
                  label={t("server.add_account")}
                  icon='person-add-outline'
                  onPress={() => {
                    modalState.onAddAccount();
                    router.back();
                  }}
                />
                <TVAccountSelectAction
                  label={t("server.remove_server")}
                  icon='trash-outline'
                  variant='destructive'
                  onPress={() => {
                    modalState.onDeleteServer();
                    router.back();
                  }}
                />
              </ScrollView>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}
