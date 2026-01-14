import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AccountSecurityType } from "@/utils/secureCredentials";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { PinInput } from "./inputs/PinInput";

interface SaveAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (securityType: AccountSecurityType, pinCode?: string) => void;
  username: string;
}

interface SecurityOption {
  type: AccountSecurityType;
  titleKey: string;
  descriptionKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SECURITY_OPTIONS: SecurityOption[] = [
  {
    type: "none",
    titleKey: "save_account.no_protection",
    descriptionKey: "save_account.no_protection_desc",
    icon: "flash-outline",
  },
  {
    type: "pin",
    titleKey: "save_account.pin_code",
    descriptionKey: "save_account.pin_code_desc",
    icon: "keypad-outline",
  },
  {
    type: "password",
    titleKey: "save_account.password",
    descriptionKey: "save_account.password_desc",
    icon: "lock-closed-outline",
  },
];

export const SaveAccountModal: React.FC<SaveAccountModalProps> = ({
  visible,
  onClose,
  onSave,
  username,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [selectedType, setSelectedType] = useState<AccountSecurityType>("none");
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["70%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        resetState();
        onClose();
      }
    },
    [onClose],
  );

  const resetState = () => {
    setSelectedType("none");
    setPinCode("");
    setPinError(null);
  };

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

  const handleOptionSelect = (type: AccountSecurityType) => {
    setSelectedType(type);
    setPinCode("");
    setPinError(null);
  };

  const handleSave = () => {
    if (selectedType === "pin") {
      if (pinCode.length !== 4) {
        setPinError(t("pin.enter_4_digits") || "Enter 4 digits");
        return;
      }
      onSave("pin", pinCode);
    } else {
      onSave(selectedType);
    }
    resetState();
  };

  const handleCancel = () => {
    resetState();
    onClose();
  };

  const canSave = () => {
    if (selectedType === "pin") {
      return pinCode.length === 4;
    }
    return true;
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
          <View className='mb-4'>
            <Text className='font-bold text-2xl text-neutral-100'>
              {t("save_account.title")}
            </Text>
            <Text className='text-neutral-400 mt-1'>{username}</Text>
          </View>

          {/* PIN Entry Step */}
          {selectedType === "pin" ? (
            <View className='flex-1'>
              <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
                <Text className='text-neutral-100 text-center text-lg mb-4'>
                  {t("pin.setup_pin")}
                </Text>
                <PinInput
                  value={pinCode}
                  onChangeText={setPinCode}
                  length={4}
                  style={{ paddingHorizontal: 16 }}
                  autoFocus
                />
                {pinError && (
                  <Text className='text-red-500 text-center mt-3'>
                    {pinError}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            /* Security Options */
            <View className='flex-1'>
              <Text className='text-neutral-400 mb-3'>
                {t("save_account.security_option")}
              </Text>
              <View className='bg-neutral-800 rounded-xl overflow-hidden'>
                {SECURITY_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.type}
                    onPress={() => handleOptionSelect(option.type)}
                    className={`flex-row items-center p-4 ${
                      index < SECURITY_OPTIONS.length - 1
                        ? "border-b border-neutral-700"
                        : ""
                    }`}
                  >
                    <View className='w-10 h-10 bg-neutral-700 rounded-full items-center justify-center mr-3'>
                      <Ionicons name={option.icon} size={20} color='white' />
                    </View>
                    <View className='flex-1'>
                      <Text className='text-neutral-100 font-medium'>
                        {t(option.titleKey)}
                      </Text>
                      <Text className='text-neutral-400 text-sm'>
                        {t(option.descriptionKey)}
                      </Text>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                        selectedType === option.type
                          ? "border-purple-500 bg-purple-500"
                          : "border-neutral-500"
                      }`}
                    >
                      {selectedType === option.type && (
                        <Ionicons name='checkmark' size={14} color='white' />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Buttons */}
          <View className='flex-row gap-3 mt-4'>
            <Button onPress={handleCancel} color='black' className='flex-1'>
              {t("save_account.cancel_button")}
            </Button>
            <Button
              onPress={handleSave}
              color='purple'
              className='flex-1'
              disabled={!canSave()}
            >
              {t("save_account.save_button")}
            </Button>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
