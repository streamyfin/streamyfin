import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { parsePairingCode } from "@/utils/quickConnectPairing";

type ScreenState =
  | "scanning"
  | "no-permission"
  | "manual"
  | "confirm"
  | "authorizing"
  | "success"
  | "error";

type ExpoCameraModule = typeof import("expo-camera");

const ExpoCamera: ExpoCameraModule | null = Platform.isTV
  ? null
  : require("expo-camera");

/**
 * Signs a TV in with this phone's session. The TV shows a Quick Connect code,
 * and a QR code that carries it; this screen reads the code, or takes it
 * typed, and approves it on the phone's own server. No password leaves the
 * phone.
 */
export const CompanionLoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const [screenState, setScreenState] = useState<ScreenState>(
    ExpoCamera ? "scanning" : "manual",
  );
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const serverLabel = (api?.basePath ?? "").replace(/^https?:\/\//, "");

  // Request camera permission
  useEffect(() => {
    if (!ExpoCamera) return;
    const { Camera } = ExpoCamera;

    void (async () => {
      const current = await Camera.getCameraPermissionsAsync();
      if (current.granted) return;
      const requested = await Camera.requestCameraPermissionsAsync();
      if (!requested.granted) setScreenState("no-permission");
    })();
  }, []);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setScreenState("error");
  }, []);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (screenState !== "scanning") return;

      const scanned = parsePairingCode(data);
      if (!scanned) {
        showError(t("companion_login.error_invalid_qr"));
        return;
      }
      // An older TV waits for a password over the network, which this app no
      // longer sends: it has to be updated to sign in this way.
      if (scanned.kind === "legacy") {
        showError(t("companion_login.error_old_tv"));
        return;
      }
      setCode(scanned.code);
      setScreenState("confirm");
    },
    [screenState, showError, t],
  );

  const handleAuthorize = useCallback(async () => {
    const trimmed = code.replace(/\s/g, "");
    if (!api || !trimmed) {
      showError(t("companion_login.error_generic"));
      return;
    }

    setScreenState("authorizing");
    try {
      // Approved on the phone's server: a TV on another server never sees it,
      // and the server answers that it does not know the code.
      const response = await getQuickConnectApi(api).authorizeQuickConnect({
        code: trimmed,
        userId: user?.Id,
      });
      // Jellyfin answers true once the code is approved.
      if (response.data === true) {
        setScreenState("success");
        return;
      }
    } catch {
      // Unknown or expired code, or Quick Connect turned off on the server.
    }
    showError(
      t("companion_login.error_code_not_waiting", { server: serverLabel }),
    );
  }, [api, code, serverLabel, showError, t, user?.Id]);

  const handleScanAgain = useCallback(() => {
    setCode("");
    setErrorMessage(null);
    setScreenState(ExpoCamera ? "scanning" : "manual");
  }, []);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  const handleEnterCodeManually = useCallback(() => {
    setCode("");
    setScreenState("manual");
  }, []);

  if (screenState === "no-permission") {
    return (
      <View className='flex-1 bg-black'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text className='mb-3 text-center text-3xl font-bold text-white'>
            {t("companion_login.error_permission_denied")}
          </Text>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              className='mt-4 rounded-lg bg-purple-600 px-6 py-3'
            >
              <Text className='text-base font-semibold text-white'>
                {t("companion_login.open_settings")}
              </Text>
            </TouchableOpacity>
          )}

          <Button
            onPress={handleEnterCodeManually}
            color='purple'
            className='mt-4'
            textClassName='flex-1 text-center'
          >
            {t("companion_login.enter_code_manually")}
          </Button>

          <Button
            onPress={handleDone}
            color='white'
            className='mt-4'
            textClassName='flex-1 text-center'
          >
            {t("companion_login.done")}
          </Button>
        </View>
      </View>
    );
  }

  if (screenState === "success") {
    return (
      <View className='flex-1 bg-black'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text className='mb-3 text-center text-3xl font-bold text-white'>
            {t("companion_login.success_title")}
          </Text>

          <Text className='mb-8 text-center text-base text-gray-400'>
            {t("companion_login.pairing_tv_connecting")}
          </Text>

          <Button
            onPress={handleDone}
            color='purple'
            textClassName='flex-1 text-center'
          >
            {t("companion_login.done")}
          </Button>
        </View>
      </View>
    );
  }

  if (screenState === "error") {
    return (
      <View className='flex-1 bg-black'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text className='mb-3 text-center text-3xl font-bold text-white'>
            {t("companion_login.error_title")}
          </Text>

          <Text className='mb-8 text-center text-base text-gray-400'>
            {errorMessage}
          </Text>

          <View className='mt-4 flex-row gap-3'>
            <Button
              onPress={handleScanAgain}
              color='purple'
              textClassName='flex-1 text-center'
            >
              {t("companion_login.scan_again")}
            </Button>

            <Button
              onPress={handleDone}
              color='white'
              textClassName='flex-1 text-center'
            >
              {t("companion_login.done")}
            </Button>
          </View>
        </View>
      </View>
    );
  }

  if (screenState === "authorizing") {
    return (
      <View className='flex-1 bg-black'>
        <View className='flex-1 items-center justify-center p-8'>
          <Text className='text-xl text-white'>
            {t("companion_login.authorizing")}
          </Text>
        </View>
      </View>
    );
  }

  if (screenState === "confirm" || screenState === "manual") {
    const typed = screenState === "manual";
    return (
      <KeyboardAvoidingView
        className='flex-1 bg-black'
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          // The header is transparent on iOS: keep the title below it when the
          // keyboard pushes the centered content up.
          contentInsetAdjustmentBehavior='automatic'
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text className='mb-2 text-center text-2xl font-bold text-white'>
            {t("companion_login.login_as", { username: user?.Name ?? "" })}
          </Text>

          <Text className='mb-8 text-center text-base text-gray-400'>
            {t("companion_login.on_server", { server: serverLabel })}
          </Text>

          <View className='mb-8 items-center'>
            <Text className='mb-1 text-sm text-gray-400'>
              {t("companion_login.pairing_code_label")}
            </Text>

            {typed ? (
              <TextInput
                className='w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-center text-2xl font-bold tracking-[6px] text-white'
                value={code}
                onChangeText={setCode}
                placeholder={t("companion_login.pairing_code_label")}
                placeholderTextColor='#6B7280'
                keyboardType='number-pad'
                autoCorrect={false}
                returnKeyType='done'
                onSubmitEditing={handleAuthorize}
                autoFocus
              />
            ) : (
              <Text className='text-center text-4xl font-bold tracking-[6px] text-white'>
                {code}
              </Text>
            )}
          </View>

          <Button
            onPress={handleAuthorize}
            disabled={!code.trim()}
            color='purple'
            textClassName='flex-1 text-center'
          >
            {t("companion_login.authorize_button")}
          </Button>

          {ExpoCamera && (
            <View className='mt-6 items-center'>
              <TouchableOpacity onPress={handleScanAgain} className='py-2'>
                <Text className='text-sm text-gray-500 underline'>
                  {t("companion_login.scan_again")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const CameraView = ExpoCamera?.CameraView;

  if (!CameraView) {
    return (
      <View className='flex-1 bg-black items-center justify-center p-8'>
        <Button
          onPress={handleEnterCodeManually}
          color='purple'
          textClassName='flex-1 text-center'
        >
          {t("companion_login.enter_code_manually")}
        </Button>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black items-center justify-center'>
      {/* Camera full screen */}
      <CameraView
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />

      {/* Dark overlay */}
      <View className='absolute inset-0 bg-black/60' />

      {/* Center scan area */}
      <View className='items-center'>
        <View className='h-[250px] w-[250px] rounded-2xl border-2 border-white/80' />

        <Text className='mt-6 text-center text-base text-white'>
          {t("companion_login.align_qr")}
        </Text>

        <TouchableOpacity
          onPress={handleEnterCodeManually}
          className='mt-4 px-5 py-2'
        >
          <Text className='text-sm text-gray-400 underline'>
            {t("companion_login.enter_code_manually")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
