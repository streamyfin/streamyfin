import { Feather, Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { router } from "expo-router";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { storage } from "@/utils/mmkv";

export interface IntroSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const IntroSheet = forwardRef<IntroSheetRef>((_, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useImperativeHandle(ref, () => ({
    present: () => {
      storage.set("hasShownIntro", true);
      bottomSheetRef.current?.present();
    },
    dismiss: () => {
      bottomSheetRef.current?.dismiss();
    },
  }));

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

  const handleDismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  const handleGoToSettings = useCallback(() => {
    bottomSheetRef.current?.dismiss();
    router.push("/settings");
  }, []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#171717" }}
      handleIndicatorStyle={{ backgroundColor: "#737373" }}
    >
      <BottomSheetScrollView
        style={{
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
        }}
      >
        <View className={Platform.isTV ? "py-5 space-y-4" : "py-4 space-y-6"}>
          <View>
            <Text className='text-3xl font-bold text-center mb-2'>
              {t("home.intro.welcome_to_streamyfin")}
            </Text>
            <Text className='text-center'>
              {t("home.intro.a_free_and_open_source_client_for_jellyfin")}
            </Text>
          </View>

          <View>
            <Text className='text-lg font-bold'>
              {t("home.intro.features_title")}
            </Text>
            <Text className='text-xs'>
              {t("home.intro.features_description")}
            </Text>
            <View className='flex flex-row items-center mt-4'>
              <Image
                source={require("@/assets/icons/jellyseerr-logo.svg")}
                style={{
                  width: 50,
                  height: 50,
                }}
              />
              <View className='shrink ml-2'>
                <Text className='font-bold mb-1'>Jellyseerr</Text>
                <Text className='shrink text-xs'>
                  {t("home.intro.jellyseerr_feature_description")}
                </Text>
              </View>
            </View>
            {!Platform.isTV && (
              <>
                <View className='flex flex-row items-center mt-4'>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                    }}
                    className='flex items-center justify-center'
                  >
                    <Ionicons
                      name='cloud-download-outline'
                      size={32}
                      color='white'
                    />
                  </View>
                  <View className='shrink ml-2'>
                    <Text className='font-bold mb-1'>
                      {t("home.intro.downloads_feature_title")}
                    </Text>
                    <Text className='shrink text-xs'>
                      {t("home.intro.downloads_feature_description")}
                    </Text>
                  </View>
                </View>
                <View className='flex flex-row items-center mt-4'>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                    }}
                    className='flex items-center justify-center'
                  >
                    <Feather name='cast' size={28} color={"white"} />
                  </View>
                  <View className='shrink ml-2'>
                    <Text className='font-bold mb-1'>Chromecast</Text>
                    <Text className='shrink text-xs'>
                      {t("home.intro.chromecast_feature_description")}
                    </Text>
                  </View>
                </View>
              </>
            )}
            <View className='flex flex-row items-center mt-4'>
              <View
                style={{
                  width: 50,
                  height: 50,
                }}
                className='flex items-center justify-center'
              >
                <Feather name='settings' size={28} color={"white"} />
              </View>
              <View className='shrink ml-2'>
                <Text className='font-bold mb-1'>
                  {t("home.intro.centralised_settings_plugin_title")}
                </Text>
                <View className='flex-row flex-wrap items-baseline'>
                  <Text className='shrink text-xs'>
                    {t(
                      "home.intro.centralised_settings_plugin_description",
                    )}{" "}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Linking.openURL(
                        "https://github.com/streamyfin/jellyfin-plugin-streamyfin",
                      );
                    }}
                  >
                    <Text className='text-xs text-purple-600 underline'>
                      {t("home.intro.read_more")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          <View>
            <Button onPress={handleDismiss} className='mt-4'>
              {t("home.intro.done_button")}
            </Button>
            <TouchableOpacity onPress={handleGoToSettings} className='mt-4'>
              <Text className='text-purple-600 text-center'>
                {t("home.intro.go_to_settings_button")}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: insets.bottom }} />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

IntroSheet.displayName = "IntroSheet";
