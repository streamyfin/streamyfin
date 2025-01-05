import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { useTranslation } from "react-i18next";
import { useHaptic } from "@/hooks/useHaptic";
import { useAtom } from "jotai";
import React, { useCallback, useRef, useState } from "react";
import { Alert, View, ViewProps } from "react-native";
import { Button } from "../Button";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState<string>();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  const { t } = useTranslation();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
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
          Alert.alert(t("home.settings.quick_connect.success"), t("home.settings.quick_connect.quick_connect_autorized"));
          setQuickConnectCode(undefined);
          bottomSheetModalRef?.current?.close();
        } else {
          errorHapticFeedback();
          Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
        }
      } catch (e) {
        errorHapticFeedback();
        Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
      }
    }
  }, [api, user, quickConnectCode]);

  return (
    <View {...props}>
      <ListGroup title={"Quick Connect"}>
        <ListItem
          onPress={() => bottomSheetModalRef?.current?.present()}
          title={t("home.settings.quick_connect.authorize_button")}
          textColor="blue"
        />
      </ListGroup>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView>
          <View className="flex flex-col space-y-4 px-4 pb-8 pt-2">
            <View>
              <Text className="font-bold text-2xl text-neutral-100">
                {t("home.settings.quick_connect.quick_connect_title")}
              </Text>
            </View>
            <View className="flex flex-col space-y-2">
              <View className="p-4 border border-neutral-800 rounded-xl bg-neutral-900 w-full">
                <BottomSheetTextInput
                  style={{ color: "white" }}
                  clearButtonMode="always"
                  placeholder="Enter the quick connect code..."
                  placeholderTextColor="#9CA3AF"
                  value={quickConnectCode}
                  onChangeText={setQuickConnectCode}
                />
              </View>
            </View>
            <Button
              className="mt-auto"
              onPress={authorizeQuickConnect}
              color="purple"
            >
              Authorize
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};
