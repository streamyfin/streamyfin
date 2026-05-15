import { Camera, CameraView } from "expo-camera";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button } from "@/components/Button";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { sendCredentialsToTV } from "@/utils/pairingService";

type ScreenState =
  | "scanning"
  | "no-permission"
  | "confirm"
  | "form"
  | "sending"
  | "success"
  | "error";

interface ParsedPairingCode {
  code: string;
}

export const CompanionLoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [screenState, setScreenState] = useState<ScreenState>("scanning");
  const [_hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [pairingCode, setPairingCode] = useState<string>("");
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-fill server URL and username from current session
  useEffect(() => {
    if (api?.basePath) {
      setServerUrl(api.basePath);
    }

    if (user?.Name) {
      setUsername(user.Name);
    }
  }, [api?.basePath, user?.Name]);

  // Request camera permission
  useEffect(() => {
    Camera.getCameraPermissionsAsync().then((response) => {
      setHasPermission(response.granted);

      if (!response.granted) {
        Camera.requestCameraPermissionsAsync().then((result) => {
          setHasPermission(result.granted);

          if (!result.granted) {
            setScreenState("no-permission");
          }
        });
      }
    });
  }, []);

  const validateAndParseQR = useCallback(
    (data: string): ParsedPairingCode | null => {
      try {
        const parsed = JSON.parse(data);

        if (
          parsed.action === "streamyfin-pair" &&
          typeof parsed.code === "string" &&
          parsed.code.length > 0
        ) {
          return { code: parsed.code };
        }

        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (screenState !== "scanning") return;

      const parsed = validateAndParseQR(data);

      if (!parsed) {
        setErrorMessage(t("companion_login.error_invalid_qr"));
        setScreenState("error");
        return;
      }

      setPairingCode(parsed.code);

      // If user is logged in, show confirmation screen (still needs password)
      // Otherwise, go straight to the full form
      if (user?.Name && api?.basePath) {
        setScreenState("confirm");
      } else {
        setScreenState("form");
      }
    },
    [screenState, validateAndParseQR, t, user?.Name, api?.basePath],
  );

  const handleSendCredentials = useCallback(async () => {
    if (
      !serverUrl.trim() ||
      !username.trim() ||
      !password.trim() ||
      !pairingCode
    ) {
      return;
    }

    setScreenState("sending");

    try {
      await sendCredentialsToTV(
        pairingCode,
        serverUrl.trim(),
        username.trim(),
        password,
      );

      setScreenState("success");
    } catch {
      setErrorMessage(t("companion_login.error_generic"));
      setScreenState("error");
    }
  }, [pairingCode, serverUrl, username, password, t]);

  const handleScanAgain = useCallback(() => {
    setPairingCode("");
    setErrorMessage(null);
    setPassword("");
    setScreenState("scanning");
  }, []);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  const handleUseDifferentUser = useCallback(() => {
    setUsername("");
    setPassword("");
    setScreenState("form");
  }, []);

  const handleEnterCodeManually = useCallback(() => {
    setScreenState("form");
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
                Open Settings
              </Text>
            </TouchableOpacity>
          )}

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

  if (screenState === "sending") {
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

  if (screenState === "confirm") {
    return (
      <KeyboardAvoidingView
        className='flex-1 bg-black'
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text className='mb-2 text-center text-2xl font-bold text-white'>
            {t("companion_login.login_as", { username })}
          </Text>

          <Text className='mb-8 text-center text-base text-gray-400'>
            {t("companion_login.on_server", {
              server: serverUrl.replace(/^https?:\/\//, ""),
            })}
          </Text>

          <View className='mb-6 items-center'>
            <Text className='mb-1 text-sm text-gray-400'>
              {t("companion_login.pairing_code_label")}
            </Text>

            <Text className='mb-8 text-center text-4xl font-bold tracking-[6px] text-white'>
              {pairingCode}
            </Text>
          </View>

          <View className='mb-5'>
            <Text className='mb-2 text-sm text-gray-400'>
              {t("login.password_placeholder")}
            </Text>

            <TextInput
              className='rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-base text-white'
              value={password}
              onChangeText={setPassword}
              placeholder={t("login.password_placeholder")}
              placeholderTextColor='#6B7280'
              autoCapitalize='none'
              autoCorrect={false}
              secureTextEntry
              returnKeyType='done'
              onSubmitEditing={handleSendCredentials}
              autoFocus
            />
          </View>

          <View className='mt-2'>
            <Button
              onPress={handleSendCredentials}
              disabled={!password.trim()}
              color='purple'
              textClassName='flex-1 text-center'
            >
              {t("companion_login.authorize_button")}
            </Button>
          </View>

          <View className='mt-6 items-center'>
            <TouchableOpacity onPress={handleUseDifferentUser} className='py-2'>
              <Text className='text-base text-gray-400 underline'>
                {t("companion_login.use_different_user")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleScanAgain} className='py-2'>
              <Text className='text-sm text-gray-500 underline'>
                {t("companion_login.scan_again")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (screenState === "form") {
    return (
      <KeyboardAvoidingView
        className='flex-1 bg-black'
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 14,
          }}
          keyboardShouldPersistTaps='handled'
        >
          <Text className='mb-2 text-2xl font-bold text-white'>
            {t("companion_login.pairing_enter_credentials")}
          </Text>

          <Text className='mb-1 text-sm text-gray-400'>
            {t("companion_login.pairing_code_label")}
          </Text>

          <Text className='mb-8 text-center text-4xl font-bold tracking-[6px] text-white'>
            {pairingCode}
          </Text>

          <View className='mb-5'>
            <Text className='mb-2 text-sm text-gray-400'>
              {t("companion_login.server")}
            </Text>

            <TextInput
              className='rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-base text-white'
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder={t("server.server_url_placeholder")}
              placeholderTextColor='#6B7280'
              autoCapitalize='none'
              autoCorrect={false}
              keyboardType='url'
              returnKeyType='next'
            />
          </View>

          <View className='mb-5'>
            <Text className='mb-2 text-sm text-gray-400'>
              {t("login.username_placeholder")}
            </Text>

            <TextInput
              className='rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-base text-white'
              value={username}
              onChangeText={setUsername}
              placeholder={t("login.username_placeholder")}
              placeholderTextColor='#6B7280'
              autoCapitalize='none'
              autoCorrect={false}
              returnKeyType='next'
            />
          </View>

          <View className='mb-5'>
            <Text className='mb-2 text-sm text-gray-400'>
              {t("login.password_placeholder")}
            </Text>

            <TextInput
              className='rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-base text-white'
              value={password}
              onChangeText={setPassword}
              placeholder={t("login.password_placeholder")}
              placeholderTextColor='#6B7280'
              autoCapitalize='none'
              autoCorrect={false}
              secureTextEntry
              returnKeyType='done'
              onSubmitEditing={handleSendCredentials}
            />
          </View>

          <View className='flex-row justify-center gap-3'>
            <Button
              onPress={handleScanAgain}
              color='black'
              className='w-40 border border-neutral-700 bg-neutral-800'
              textClassName='flex-1 text-center'
            >
              {t("companion_login.scan_again")}
            </Button>

            <Button
              onPress={handleSendCredentials}
              disabled={
                !serverUrl.trim() || !username.trim() || !password.trim()
              }
              className='w-40'
              color='purple'
              textClassName='flex-1 text-center'
            >
              {t("companion_login.authorize_button")}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
