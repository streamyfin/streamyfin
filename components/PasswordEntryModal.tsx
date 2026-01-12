import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHaptic } from "@/hooks/useHaptic";
import { Button } from "./Button";
import { Text } from "./common/Text";

interface PasswordEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  username: string;
}

export const PasswordEntryModal: React.FC<PasswordEntryModalProps> = ({
  visible,
  onClose,
  onSubmit,
  username,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const errorHaptic = useHaptic("error");

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
      setPassword("");
      setError(null);
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setPassword("");
        setError(null);
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

  const handleSubmit = async () => {
    if (!password) {
      setError(t("password.enter_password"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSubmit(password);
      setPassword("");
    } catch {
      errorHaptic();
      setError(t("password.invalid_password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      handleIndicatorStyle={{ backgroundColor: "white" }}
      backgroundStyle={{ backgroundColor: "#171717" }}
      backdropComponent={renderBackdrop}
      keyboardBehavior={isAndroid ? "fillParent" : "interactive"}
      keyboardBlurBehavior='restore'
      android_keyboardInputMode='adjustResize'
      topInset={isAndroid ? 0 : undefined}
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
          {/* Header */}
          <View className='mb-6'>
            <Text className='font-bold text-2xl text-neutral-100'>
              {t("password.enter_password")}
            </Text>
            <Text className='text-neutral-400 mt-1'>
              {t("password.enter_password_for", { username })}
            </Text>
          </View>

          {/* Password Input */}
          <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
            <Text className='text-neutral-400 text-sm mb-2'>
              {t("login.password")}
            </Text>
            <BottomSheetTextInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              placeholder={t("login.password")}
              placeholderTextColor='#6B7280'
              secureTextEntry
              autoFocus
              autoCapitalize='none'
              autoCorrect={false}
              style={{
                backgroundColor: "#1F2937",
                borderRadius: 8,
                padding: 12,
                color: "white",
                fontSize: 16,
              }}
              onSubmitEditing={handleSubmit}
              returnKeyType='done'
            />
            {error && <Text className='text-red-500 mt-2'>{error}</Text>}
          </View>

          {/* Buttons */}
          <View className='flex-row gap-3'>
            <Button
              onPress={onClose}
              color='black'
              className='flex-1'
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onPress={handleSubmit}
              color='purple'
              className='flex-1'
              disabled={isLoading || !password}
            >
              {isLoading ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                t("login.login")
              )}
            </Button>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
