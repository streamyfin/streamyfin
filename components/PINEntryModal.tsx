import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHaptic } from "@/hooks/useHaptic";
import { verifyAccountPIN } from "@/utils/secureCredentials";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { PinInput } from "./inputs/PinInput";

interface PINEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onForgotPIN?: () => void;
  serverUrl: string;
  userId: string;
  username: string;
}

export const PINEntryModal: React.FC<PINEntryModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onForgotPIN,
  serverUrl,
  userId,
  username,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [pinCode, setPinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const errorHaptic = useHaptic("error");
  const successHaptic = useHaptic("success");

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
      setPinCode("");
      setError(null);
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setPinCode("");
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

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePinChange = async (value: string) => {
    setPinCode(value);
    setError(null);

    // Auto-verify when 4 digits entered
    if (value.length === 4) {
      setIsVerifying(true);
      try {
        const isValid = await verifyAccountPIN(serverUrl, userId, value);
        if (isValid) {
          Keyboard.dismiss();
          successHaptic();
          onSuccess();
          setPinCode("");
        } else {
          errorHaptic();
          setError(t("pin.invalid_pin"));
          shake();
          setPinCode("");
        }
      } catch {
        errorHaptic();
        setError(t("pin.invalid_pin"));
        shake();
        setPinCode("");
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleForgotPIN = () => {
    Alert.alert(t("pin.forgot_pin"), t("pin.forgot_pin_desc"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.continue"),
        style: "destructive",
        onPress: () => {
          onClose();
          onForgotPIN?.();
        },
      },
    ]);
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
              {t("pin.enter_pin")}
            </Text>
            <Text className='text-neutral-400 mt-1'>
              {t("pin.enter_pin_for", { username })}
            </Text>
          </View>

          {/* PIN Input */}
          <Animated.View
            style={{ transform: [{ translateX: shakeAnimation }] }}
            className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'
          >
            <PinInput
              value={pinCode}
              onChangeText={handlePinChange}
              length={4}
              style={{ paddingHorizontal: 16 }}
              autoFocus
            />
            {error && (
              <Text className='text-red-500 text-center mt-3'>{error}</Text>
            )}
            {isVerifying && (
              <Text className='text-neutral-400 text-center mt-3'>
                {t("common.verifying") || "Verifying..."}
              </Text>
            )}
          </Animated.View>

          {/* Forgot PIN */}
          <TouchableOpacity onPress={handleForgotPIN} className='mb-4'>
            <Text className='text-purple-400 text-center'>
              {t("pin.forgot_pin")}
            </Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <Button onPress={onClose} color='black'>
            {t("common.cancel")}
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
