import axios from "axios";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { useAtomValue } from "jotai";
import type React from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PinInput } from "@/components/inputs/PinInput";
import { NO_KEYBOARD_TOOLBAR } from "@/constants/Keyboard";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  approveQuickConnectCode,
  isQuickConnectEnabled,
} from "@/utils/jellyfin/quickConnect";
import { writeErrorLog } from "@/utils/log";
import {
  parsePairingCode,
  stripUrlCredentials,
} from "@/utils/quickConnectPairing";

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

/** A server address as shown on screen: no credentials, no scheme. */
const serverLabel = (url: string) =>
  stripUrlCredentials(url).replace(/^https?:\/\//i, "");

/** Jellyfin hands out server ids with and without dashes. */
const sameServerId = (a: string, b: string) =>
  a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();

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
  const authorizingRef = useRef(false);
  // A new id each time the screen opens: Fabric reuses a text input's native
  // view and sets the id on it again only when the id changed.
  const instanceId = useId();
  const toolbarId = `${NO_KEYBOARD_TOOLBAR}-${instanceId}`;
  // The home stack draws a transparent header over the screen on iOS.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const headerInset = Platform.OS === "ios" ? headerHeight : 0;

  const server = serverLabel(api?.basePath ?? "");

  // Asks only when the system still can: a refused permission answers false
  // without showing anything.
  const cameraAllowed = useCallback(async () => {
    if (!ExpoCamera) return false;
    const { Camera } = ExpoCamera;
    try {
      const current = await Camera.getCameraPermissionsAsync();
      if (current.granted || !current.canAskAgain) return current.granted;
      return (await Camera.requestCameraPermissionsAsync()).granted;
    } catch {
      // No answer about the camera reads as no camera.
      return false;
    }
  }, []);

  // Only a refusal changes the screen here: someone who already went on to
  // type the code stays where they are.
  useEffect(() => {
    if (!ExpoCamera) return;
    void cameraAllowed().then((allowed) => {
      if (!allowed) {
        setScreenState((state) =>
          state === "scanning" ? "no-permission" : state,
        );
      }
    });
  }, [cameraAllowed]);

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
      // Only the id is compared: the TV may reach the server through another
      // address than this phone, and the address in the QR code is never
      // contacted.
      if (
        scanned.serverId &&
        user?.ServerId &&
        !sameServerId(scanned.serverId, user.ServerId)
      ) {
        showError(
          t("companion_login.error_other_server", {
            server: serverLabel(scanned.serverUrl),
          }),
        );
        return;
      }
      setCode(scanned.code);
      setScreenState("confirm");
    },
    [screenState, showError, t, user?.ServerId],
  );

  const handleAuthorize = useCallback(async () => {
    const trimmed = code.replace(/\s/g, "");
    if (!api || !trimmed) {
      showError(t("companion_login.error_generic"));
      return;
    }

    // One approval at a time: a second one of the same code comes back as a
    // 500 and would turn a success into an error on screen.
    if (authorizingRef.current) return;
    authorizingRef.current = true;
    setScreenState("authorizing");
    try {
      // Checked first: with Quick Connect off, Jellyfin answers the approval
      // with a 401, which the session handling takes for an expired token.
      if (!(await isQuickConnectEnabled(api))) {
        showError(
          t("companion_login.error_quick_connect_disabled", { server }),
        );
        return;
      }
      // Approved on the phone's server: a TV on another server never sees it,
      // and the server answers that it does not know the code.
      const result = await approveQuickConnectCode(api, trimmed);
      if (result === "approved") {
        setScreenState("success");
        return;
      }
      showError(
        result === "unknown-code"
          ? t("companion_login.error_code_not_waiting", { server })
          : t("companion_login.error_generic"),
      );
    } catch (error) {
      writeErrorLog(
        `Quick Connect approval failed: ${error instanceof Error ? error.message : error}`,
      );
      showError(
        axios.isAxiosError(error) && !error.response
          ? t("home.server_unreachable_message")
          : t("companion_login.error_generic"),
      );
    } finally {
      authorizingRef.current = false;
    }
  }, [api, code, server, showError, t]);

  // Back to the camera through the permission again, so a refused one shows
  // the permission screen instead of a camera that stays black.
  const handleScanAgain = useCallback(async () => {
    setCode("");
    setErrorMessage(null);
    if (!ExpoCamera) {
      setScreenState("manual");
      return;
    }
    setScreenState((await cameraAllowed()) ? "scanning" : "no-permission");
  }, [cameraAllowed]);

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
          testID='pairing-approval'
          // The header's height on both sides keeps the card mid-screen, as on
          // every other step, and the title below the header when the keyboard
          // is up. An automatic inset pushed the card down by that height.
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 24 + headerInset,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text className='mb-2 text-center text-2xl font-bold text-white'>
            {t("companion_login.login_as", { username: user?.Name ?? "" })}
          </Text>

          <Text className='mb-6 text-center text-base text-gray-400'>
            {t("companion_login.on_server", { server })}
          </Text>

          <View className='mb-6 items-center'>
            <Text className='mb-2 text-sm text-gray-400'>
              {t("companion_login.pairing_code_label")}
            </Text>

            {typed ? (
              <PinInput
                testID='pairing-code'
                value={code}
                onChangeText={setCode}
                inBottomSheet={false}
                // Authorize stays in reach above the keyboard, so the number
                // pad needs no toolbar of its own.
                inputAccessoryViewID={toolbarId}
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
            <View className='mt-3 items-center'>
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
