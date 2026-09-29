/**
 * SyncPlayButton
 *
 * Header button for accessing SyncPlay functionality.
 * Shows group status and opens the group selection sheet.
 *
 * Uses the @expo/ui drop-in BottomSheetModal (SwiftUI sheet on iOS, Jetpack
 * Compose ModalBottomSheet on Android). Because it presents natively, it
 * works correctly even when triggered from `headerRight` — no portal or
 * provider context is required (unlike @gorhom/bottom-sheet, which fails
 * silently from detached UINavigationItem subtrees).
 *
 * Safe to import statically: this whole module is lazy-required only on
 * non-TV platforms by app/(auth)/(tabs)/(home)/_layout.tsx.
 */

import {
  type BottomSheetMethods,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@expo/ui/community/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useCastDevice } from "react-native-google-cast";
import { toast } from "sonner-native";
import {
  HEADER_ICON_SIZE,
  HeaderButton,
} from "@/components/common/HeaderButton";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { useSyncPlay } from "@/providers/SyncPlay";
import { GroupSelectionMenu } from "./GroupSelectionMenu";

interface SyncPlayButtonProps {
  size?: number;
}

export function SyncPlayButton({
  size = HEADER_ICON_SIZE,
}: SyncPlayButtonProps) {
  const { t } = useTranslation();
  const { isEnabled, canJoinGroups, registerPlaybackPresentationGuard } =
    useSyncPlay();
  const { isConnected } = useNetworkStatus();
  const castDevice = useCastDevice();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const sheetOpenRef = useRef(false);
  const dismissalRef = useRef<{
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  const isCasting = !!castDevice;
  const sheetHidden = Platform.isTV || !canJoinGroups || !isConnected;

  const handlePress = useCallback(() => {
    if (isCasting) {
      toast("SyncPlay not available while casting");
      return;
    }
    sheetOpenRef.current = true;
    sheetRef.current?.present();
  }, [isCasting]);

  const handleDismiss = useCallback((): Promise<void> => {
    if (dismissalRef.current) return dismissalRef.current.promise;
    if (!sheetOpenRef.current) return Promise.resolve();
    if (!sheetRef.current) {
      return Promise.reject(
        new Error("SyncPlay group sheet is no longer mounted"),
      );
    }
    let resolve = () => {};
    let reject = (_error: Error) => {};
    const promise = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    dismissalRef.current = { promise, resolve, reject };
    sheetRef.current?.dismiss();
    return promise;
  }, []);

  const handleDidDismiss = useCallback(() => {
    sheetOpenRef.current = false;
    dismissalRef.current?.resolve();
    dismissalRef.current = null;
  }, []);

  useEffect(() => {
    if (sheetHidden) return;
    return registerPlaybackPresentationGuard(handleDismiss);
  }, [registerPlaybackPresentationGuard, handleDismiss, sheetHidden]);

  useEffect(() => {
    if (!sheetHidden) return;
    sheetOpenRef.current = false;
    dismissalRef.current?.reject(
      new Error("SyncPlay group sheet became unavailable during dismissal"),
    );
    dismissalRef.current = null;
  }, [sheetHidden]);

  useEffect(
    () => () => {
      dismissalRef.current?.reject(
        new Error("SyncPlay group sheet unmounted during dismissal"),
      );
      dismissalRef.current = null;
    },
    [],
  );

  if (sheetHidden) return null;

  const iconColor = isCasting ? "#6b7280" : isEnabled ? "#00a4dc" : "white";

  return (
    <>
      <HeaderButton
        onPress={handlePress}
        accessibilityRole='button'
        accessibilityLabel={t("syncplay.title")}
      >
        <View className='relative'>
          <Ionicons
            name={isEnabled ? "people" : "people-outline"}
            size={size}
            color={iconColor}
          />
          {isEnabled && !isCasting && (
            <View
              className='absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00a4dc]'
              style={{
                borderWidth: 1,
                borderColor: "#171717",
              }}
            />
          )}
        </View>
      </HeaderButton>
      <BottomSheetModal
        ref={sheetRef}
        onDismiss={handleDidDismiss}
        snapPoints={Platform.OS === "android" ? ["100%"] : ["60%"]}
        enablePanDownToClose
      >
        <BottomSheetScrollView style={{ flex: 1 }}>
          <GroupSelectionMenu onClose={handleDismiss} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}
