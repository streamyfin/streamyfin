import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { requireOptionalNativeModule } from "expo-modules-core";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "../Button";
import { Text } from "../common/Text";

interface Props {
  /** The Quick Connect code to display, or null when hidden. */
  code: string | null;
  onClose: () => void;
}

/**
 * Shows the Quick Connect code while the app polls for authorization.
 * In-app sheet instead of a native Alert so it can dismiss itself once the
 * session is authorized — a native alert has no programmatic dismiss and
 * lingers over the app after login completes.
 */
export const QuickConnectCodeModal: React.FC<Props> = ({ code, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["50%"], []);
  const isPresentedRef = useRef(false);

  // Keep the last code around so the dismiss animation doesn't flash empty
  // when the parent clears the code to close the sheet.
  const lastCodeRef = useRef<string | null>(null);
  if (code) lastCodeRef.current = code;

  useEffect(() => {
    if (code) {
      bottomSheetModalRef.current?.present();
    } else if (isPresentedRef.current) {
      bottomSheetModalRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [code]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index >= 0) {
        isPresentedRef.current = true;
      } else if (index === -1 && isPresentedRef.current) {
        isPresentedRef.current = false;
        onClose();
      }
    },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const copyCode = useCallback(async () => {
    const value = code ?? lastCodeRef.current;
    if (!value) return;
    // Builds that don't ship the expo-clipboard native module yet: probe with
    // requireOptionalNativeModule (returns null instead of throwing/logging)
    // and skip — importing the JS wrapper there would error out.
    if (!requireOptionalNativeModule("ExpoClipboard")) return;
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(value);
    toast.success(t("login.code_copied"));
  }, [code, t]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      handleIndicatorStyle={{ backgroundColor: "white" }}
      backgroundStyle={{ backgroundColor: "#171717" }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: Math.max(16, insets.bottom),
        }}
      >
        <View className='flex-1'>
          <Text className='font-bold text-2xl text-neutral-100'>
            {t("login.quick_connect")}
          </Text>
          <TouchableOpacity
            className='mt-6 p-6 border border-neutral-800 rounded-xl bg-neutral-900 flex flex-row items-center justify-center'
            onPress={copyCode}
          >
            <Text
              className='text-center font-bold text-5xl text-neutral-100'
              style={{ letterSpacing: 10 }}
            >
              {code ?? lastCodeRef.current}
            </Text>
            <Ionicons
              name='copy-outline'
              size={22}
              color='white'
              style={{ opacity: 0.4, marginLeft: 16 }}
            />
          </TouchableOpacity>
          <Text className='mt-2 text-neutral-500 text-center text-xs'>
            {t("login.tap_code_to_copy")}
          </Text>
          <Text className='mt-3 mb-5 text-neutral-400 text-center px-4'>
            {t("login.quick_connect_instructions")}
          </Text>
          <Button className='mt-auto' color='purple' onPress={onClose}>
            {t("login.got_it")}
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
