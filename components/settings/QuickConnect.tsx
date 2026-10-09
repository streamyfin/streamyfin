import { Feather } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
// React Native's Pressable rather than the gesture handler's: it takes the
// touch, so a paste does not also reach the area that closes the keyboard.
import {
  AccessibilityInfo,
  Alert,
  Platform,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { DismissKeyboardArea } from "@/components/common/DismissKeyboardArea";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { isConnectivityError } from "@/utils/errors";
import { isQuickConnectEnabled } from "@/utils/seerrQuickConnect";
import { Button } from "../Button";
import { Text } from "../common/Text";
import { PinInput } from "../inputs/PinInput";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

/** Jellyfin's Quick Connect codes are six digits. */
const CODE_LENGTH = 6;

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState("");
  // Why the last code did not go through, shown under the cells.
  const [error, setError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  // A ref as well as the state: a paste and the last digit can land in the
  // same render, and only one request may go out.
  const authorizingRef = useRef(false);
  // The first complete code goes by itself. Once one has failed, the next goes
  // when Authorize is pressed, so a code being fixed is not sent half done.
  const [sendsByItself, setSendsByItself] = useState(true);
  // Numbers each attempt: an answer that comes back after the sheet was
  // opened again, or after a newer attempt, is left alone.
  const attemptRef = useRef(0);
  // Cancels the approval of an attempt the sheet was opened again over.
  const controllerRef = useRef<AbortController | null>(null);
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

  const authorize = useCallback(
    async (code: string) => {
      if (!api || authorizingRef.current) return;
      const attempt = ++attemptRef.current;
      const current = () => attempt === attemptRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      authorizingRef.current = true;
      setAuthorizing(true);
      setError(null);
      // The reason shows under the cells, the code stays for a fix, and
      // Authorize sends the next one. Read out too: there is no dialog.
      const fail = (message: string) => {
        if (!current()) return;
        errorHapticFeedback();
        setError(message);
        setSendsByItself(false);
        AccessibilityInfo.announceForAccessibility(message);
      };
      try {
        // Checked first: Jellyfin answers an approval with a 401 while Quick
        // Connect is off, and the session handling takes any 401 for an
        // expired token and signs the user out.
        if (!(await isQuickConnectEnabled(api))) {
          fail(t("home.settings.quick_connect.disabled"));
          return;
        }
        // The sheet may have been opened again during the check: an attempt
        // it left behind sends no approval.
        if (!current()) return;
        const res = await getQuickConnectApi(api).authorizeQuickConnect(
          { code, userId: user?.Id },
          { signal: controller.signal },
        );
        if (!current()) return;
        if (res.status === 200 && res.data !== false) {
          successHapticFeedback();
          Alert.alert(
            t("home.settings.quick_connect.success"),
            t("home.settings.quick_connect.quick_connect_authorized"),
          );
          setQuickConnectCode("");
          bottomSheetModalRef?.current?.close();
          return;
        }
        fail(t("home.settings.quick_connect.invalid_code"));
      } catch (e) {
        fail(
          isConnectivityError(e)
            ? t("home.server_unreachable_message")
            : t("home.settings.quick_connect.invalid_code"),
        );
      } finally {
        if (current()) {
          authorizingRef.current = false;
          setAuthorizing(false);
        }
      }
    },
    [api, user?.Id, t, successHapticFeedback, errorHapticFeedback],
  );

  const handleCodeChange = useCallback(
    (code: string, send = sendsByItself) => {
      setQuickConnectCode(code);
      setError(null);
      if (send && code.length === CODE_LENGTH) void authorize(code);
    },
    [authorize, sendsByItself],
  );

  const pasteCode = useCallback(async () => {
    // Builds without the expo-clipboard native module: probe first (no-op).
    if (!requireOptionalNativeModule("ExpoClipboard")) return;
    const Clipboard: typeof import("expo-clipboard") = require("expo-clipboard");
    const text = (await Clipboard.getStringAsync()) || "";
    const digits = text.replace(/\D/g, "");
    if (!digits) return;
    // Only a pasted code goes by itself: six digits pulled out of any other
    // text fill the cells and wait to be checked.
    const isCode = new RegExp(`^\\d{${CODE_LENGTH}}$`).test(
      text.replace(/\s/g, ""),
    );
    handleCodeChange(digits.slice(0, CODE_LENGTH), isCode && sendsByItself);
  }, [handleCodeChange, sendsByItself]);

  // Opening the sheet starts over: an attempt still running belongs to the
  // sheet that was closed.
  const openSheet = useCallback(() => {
    controllerRef.current?.abort();
    attemptRef.current++;
    authorizingRef.current = false;
    setAuthorizing(false);
    setSendsByItself(true);
    setQuickConnectCode("");
    setError(null);
    bottomSheetModalRef?.current?.present();
  }, []);

  if (isTv) return null;

  return (
    <View {...props}>
      <ListGroup title={t("home.settings.quick_connect.quick_connect_title")}>
        <ListItem
          onPress={openSheet}
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
          <DismissKeyboardArea>
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
                    testID='quick-connect-code'
                    value={quickConnectCode}
                    onChangeText={handleCodeChange}
                    // Locked while the code shown is the one being checked.
                    editable={!authorizing}
                    length={CODE_LENGTH}
                    style={{ paddingHorizontal: 16 }}
                    autoFocus
                  />
                  {error && (
                    <Text
                      className='text-red-500 text-center'
                      accessibilityLiveRegion='polite'
                    >
                      {error}
                    </Text>
                  )}
                  <Pressable
                    onPress={pasteCode}
                    className='flex-row items-center justify-center self-center'
                  >
                    <Feather name='clipboard' size={15} color='#a3a3a3' />
                    <Text className='text-neutral-400 ml-2'>
                      {t("home.settings.quick_connect.paste_code")}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <Button
                className='mt-auto'
                onPress={() => authorize(quickConnectCode)}
                disabled={quickConnectCode.length !== CODE_LENGTH}
                loading={authorizing}
                color='purple'
              >
                {t("home.settings.quick_connect.authorize")}
              </Button>
            </View>
          </DismissKeyboardArea>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};
