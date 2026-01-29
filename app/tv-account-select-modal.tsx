import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, TVFocusGuideView, View } from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { TVAccountCard } from "@/components/login/TVAccountCard";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { tvAccountSelectModalAtom } from "@/utils/atoms/tvAccountSelectModal";
import { store } from "@/utils/store";

export default function TVAccountSelectModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvAccountSelectModalAtom);
  const { t } = useTranslation();

  const [isReady, setIsReady] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.9)).current;

  // Animate in on mount
  useEffect(() => {
    overlayOpacity.setValue(0);
    contentScale.setValue(0.9);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 1,
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
  }, [overlayOpacity, contentScale]);

  const handleClose = () => {
    router.back();
  };

  if (!modalState) {
    return null;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        opacity: overlayOpacity,
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale: contentScale }],
          width: "100%",
          maxWidth: 700,
        }}
      >
        <BlurView
          intensity={40}
          tint='dark'
          style={{
            borderRadius: 24,
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
              padding: 40,
            }}
          >
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 8,
              }}
            >
              {t("server.select_account")}
            </Text>
            <Text
              style={{
                fontSize: typography.callout,
                color: "#9CA3AF",
                marginBottom: 32,
              }}
            >
              {modalState.server.name || modalState.server.address}
            </Text>

            {isReady && (
              <>
                <View style={{ gap: 12, marginBottom: 24 }}>
                  {modalState.server.accounts?.map((account, index) => (
                    <TVAccountCard
                      key={account.userId}
                      account={account}
                      onPress={() => {
                        modalState.onAccountSelect(account);
                        router.back();
                      }}
                      onLongPress={() => {
                        modalState.onDeleteAccount(account);
                      }}
                      hasTVPreferredFocus={index === 0}
                    />
                  ))}
                </View>

                <View style={{ gap: 12 }}>
                  <Button
                    onPress={() => {
                      modalState.onAddAccount();
                      router.back();
                    }}
                    color='white'
                  >
                    {t("server.add_account")}
                  </Button>
                  <Button
                    onPress={handleClose}
                    color='black'
                    className='bg-neutral-800'
                  >
                    {t("common.cancel")}
                  </Button>
                </View>
              </>
            )}
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}
