import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import {
  deleteAccountCredential,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { Button } from "./Button";
import { Text } from "./common/Text";

interface AccountsSheetProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  server: SavedServer | null;
  onAccountSelect: (account: SavedServerAccount) => void;
  onAddAccount: () => void;
  onAccountDeleted?: () => void;
}

export const AccountsSheet: React.FC<AccountsSheetProps> = ({
  open,
  setOpen,
  server,
  onAccountSelect,
  onAddAccount,
  onAccountDeleted,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (open) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
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

  const handleDeleteAccount = async (account: SavedServerAccount) => {
    if (!server) return;

    Alert.alert(
      t("server.remove_saved_login"),
      t("server.remove_account_description", { username: account.username }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            await deleteAccountCredential(server.address, account.userId);
            onAccountDeleted?.();
          },
        },
      ],
    );
  };

  const getSecurityIcon = (
    securityType: SavedServerAccount["securityType"],
  ): keyof typeof Ionicons.glyphMap => {
    switch (securityType) {
      case "pin":
        return "keypad";
      case "password":
        return "lock-closed";
      default:
        return "key";
    }
  };

  const renderRightActions = (account: SavedServerAccount) => (
    <TouchableOpacity
      onPress={() => handleDeleteAccount(account)}
      className='bg-red-600 justify-center items-center px-5'
    >
      <Ionicons name='trash' size={20} color='white' />
    </TouchableOpacity>
  );

  if (!server) return null;

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
          {/* Header */}
          <View className='mb-4'>
            <Text className='font-bold text-2xl text-neutral-100'>
              {t("server.select_account")}
            </Text>
            <Text className='text-neutral-400 mt-1'>
              {server.name || server.address}
            </Text>
          </View>

          {/* Account List */}
          <View className='bg-neutral-800 rounded-xl overflow-hidden mb-4'>
            {server.accounts.map((account, index) => (
              <Swipeable
                key={account.userId}
                renderRightActions={() => renderRightActions(account)}
                overshootRight={false}
              >
                <TouchableOpacity
                  onPress={() => {
                    setOpen(false);
                    onAccountSelect(account);
                  }}
                  className={`flex-row items-center p-4 bg-neutral-800 ${
                    index < server.accounts.length - 1
                      ? "border-b border-neutral-700"
                      : ""
                  }`}
                >
                  {/* Avatar */}
                  <View className='w-10 h-10 bg-neutral-700 rounded-full items-center justify-center mr-3'>
                    <Ionicons name='person' size={20} color='white' />
                  </View>

                  {/* Account Info */}
                  <View className='flex-1'>
                    <Text className='text-neutral-100 font-medium'>
                      {account.username}
                    </Text>
                    <Text className='text-neutral-500 text-sm'>
                      {account.securityType === "none"
                        ? t("save_account.no_protection")
                        : account.securityType === "pin"
                          ? t("save_account.pin_code")
                          : t("save_account.password")}
                    </Text>
                  </View>

                  {/* Security Icon */}
                  <Ionicons
                    name={getSecurityIcon(account.securityType)}
                    size={18}
                    color={Colors.primary}
                  />
                </TouchableOpacity>
              </Swipeable>
            ))}
          </View>

          {/* Hint */}
          <Text className='text-xs text-neutral-500 mb-4 ml-1'>
            {t("server.swipe_to_remove")}
          </Text>

          {/* Add Account Button */}
          <Button
            onPress={() => {
              setOpen(false);
              onAddAccount();
            }}
            color='purple'
          >
            <View className='flex-row items-center justify-center'>
              <Ionicons name='add' size={20} color='white' />
              <Text className='text-white font-semibold ml-2'>
                {t("server.add_account")}
              </Text>
            </View>
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
