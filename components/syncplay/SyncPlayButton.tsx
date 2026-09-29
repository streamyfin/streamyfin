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
  BottomSheetView,
} from "@expo/ui/community/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef } from "react";
import { Platform, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useCastDevice } from "react-native-google-cast";
import { toast } from "sonner-native";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { useSyncPlay } from "@/providers/SyncPlay";
import { GroupSelectionMenu } from "./GroupSelectionMenu";

interface SyncPlayButtonProps {
  size?: number;
}

export function SyncPlayButton({ size = 22 }: SyncPlayButtonProps) {
  const { isEnabled, canJoinGroups } = useSyncPlay();
  const { isConnected } = useNetworkStatus();
  const castDevice = useCastDevice();
  const sheetRef = useRef<BottomSheetMethods>(null);

  const isCasting = !!castDevice;

  const handlePress = useCallback(() => {
    if (isCasting) {
      toast("SyncPlay not available while casting");
      return;
    }
    sheetRef.current?.present();
  }, [isCasting]);

  const handleDismiss = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  if (Platform.isTV) return null;
  if (!canJoinGroups) return null;
  if (!isConnected) return null;

  const iconColor = isCasting ? "#6b7280" : isEnabled ? "#00a4dc" : "white";

  return (
    <>
      <Pressable
        className='mr-4'
        onPress={handlePress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
      </Pressable>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={Platform.OS === "android" ? ["100%"] : ["60%"]}
        enablePanDownToClose
      >
        <BottomSheetView>
          <GroupSelectionMenu onClose={handleDismiss} />
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
