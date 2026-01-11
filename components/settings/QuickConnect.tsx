import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, View, type ViewProps } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { Button } from "../Button";
import { Text } from "../common/Text";
import { PinInput } from "../inputs/PinInput";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState<string>();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");
  const snapPoints = useMemo(
    () => (Platform.OS === "android" ? ["100%"] : ["40%"]),
    [],
  );
  const isAndroid = Platform.OS === "android";

  const { t } = useTranslation();

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

  const authorizeQuickConnect = useCallback(async () => {
    if (quickConnectCode) {
      try {
        const res = await getQuickConnectApi(api!).authorizeQuickConnect({
          code: quickConnectCode,
          userId: user?.Id,
        });
        if (res.status === 200) {
          successHapticFeedback();
          Alert.alert(
            t("home.settings.quick_connect.success"),
            t("home.settings.quick_connect.quick_connect_autorized"),
          );
          setQuickConnectCode(undefined);
          bottomSheetModalRef?.current?.close();
        } else {
          errorHapticFeedback();
          Alert.alert(
            t("home.settings.quick_connect.error"),
            t("home.settings.quick_connect.invalid_code"),
          );
        }
      } catch (_e) {
        errorHapticFeedback();
        Alert.alert(
          t("home.settings.quick_connect.error"),
          t("home.settings.quick_connect.invalid_code"),
        );
      }
    }
  }, [api, user, quickConnectCode]);

  if (isTv) return null;

  return (
    <View {...props}>
      <ListGroup title={t("home.settings.quick_connect.quick_connect_title")}>
        <ListItem
          onPress={() => {
            // Reset the code when opening the sheet
            setQuickConnectCode("");
            bottomSheetModalRef?.current?.present();
          }}
          title={t("home.settings.quick_connect.authorize_button")}
          textColor='blue'
        />
      </ListGroup>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        snapPoints={snapPoints}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={renderBackdrop}
        keyboardBehavior={isAndroid ? "fillParent" : "interactive"}
        keyboardBlurBehavior='restore'
        android_keyboardInputMode='adjustResize'
        topInset={isAndroid ? 0 : undefined}
      >
        <BottomSheetView>
          <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
            <View>
              <Text className='font-bold text-2xl text-neutral-100'>
                {t("home.settings.quick_connect.quick_connect_title")}
              </Text>
            </View>
            <View className='flex flex-col space-y-2'>
              <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 w-full space-y-4'>
                <Text className='text-neutral-400 text-center'>
                  {t(
                    "home.settings.quick_connect.enter_the_quick_connect_code",
                  )}
                </Text>
                <PinInput
                  value={quickConnectCode || ""}
                  onChangeText={setQuickConnectCode}
                  style={{ paddingHorizontal: 16 }}
                  autoFocus
                />
              </View>
            </View>
            <Button
              className='mt-auto'
              onPress={authorizeQuickConnect}
              color='purple'
            >
              {t("home.settings.quick_connect.authorize")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};
