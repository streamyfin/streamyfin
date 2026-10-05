import { Feather, Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type {
  PublicSystemInfo,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getQuickConnectApi,
  getSystemApi,
  getUserApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Keyboard, Platform, View, type ViewProps } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { supportsQuickConnectForOtherUsers } from "@/utils/jellyfin/serverVersion";
import { Button } from "../Button";
import { Text } from "../common/Text";
import { PinInput } from "../inputs/PinInput";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

interface Props extends ViewProps {}

// The share of the window the sheet opens at on iOS. The user row an
// administrator gets does not fit above the keyboard in the smaller one.
const SHEET_SNAP_POINT = "40%";
const SHEET_SNAP_POINT_WITH_USER_PICKER = "50%";

// Stable reference so a pending users query does not churn the menu's groups.
const EMPTY_USERS: UserDto[] = [];

export const QuickConnect: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState<string>();
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");
  const isAndroid = Platform.OS === "android";

  const { t } = useTranslation();

  const isAdmin = !isTv && !!user?.Policy?.IsAdministrator;

  // Same key and shape as the other consumers of the server info. Whatever
  // the cache holds will do, since a server does not go back below 10.9, and
  // asking again would be worse than useless: a refetch that fails marks the
  // shared query as errored, which useMediaPreferences reads as not ready.
  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api && isAdmin,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // An unknown version counts as an old one: the code is then approved for
  // the signed-in user, as it always was.
  const canAuthorizeOthers =
    isAdmin && supportsQuickConnectForOtherUsers(serverInfo?.Version);

  const { data: users = EMPTY_USERS } = useQuery({
    queryKey: ["jellyfin", "users", "enabled"],
    queryFn: async () => {
      if (!api) return EMPTY_USERS;
      const res = await getUserApi(api).getUsers();
      return res.data.filter((u) => !u.Policy?.IsDisabled);
    },
    enabled: !!api && canAuthorizeOthers,
    // Every account on the server: kept out of the cache persisted to disk.
    gcTime: 0,
  });

  // Nothing to pick from on a server whose only enabled account is this one.
  const showUserPicker =
    canAuthorizeOthers && users.some((u) => u.Id !== user?.Id);

  const pickedUser = showUserPicker
    ? users.find((u) => u.Id === selectedUserId)
    : undefined;

  // Somebody was picked and has since left the list. That never falls back
  // to the administrator: a code meant for another user would sign their
  // device in as an admin, and a request without a user id does just that.
  const isPickUnavailable = selectedUserId !== undefined && !pickedUser;

  const targetUser = selectedUserId === undefined ? user : pickedUser;

  const snapPoints = useMemo(() => {
    if (Platform.OS === "android") return ["100%"];
    return [
      showUserPicker ? SHEET_SNAP_POINT_WITH_USER_PICKER : SHEET_SNAP_POINT,
    ];
  }, [showUserPicker]);

  // Memoized: PlatformDropdown compares its groups by reference.
  const userGroups = useMemo(
    () => [
      {
        options: users.map((u) => ({
          type: "radio" as const,
          label: u.Name ?? "",
          value: u.Id,
          selected: u.Id === targetUser?.Id,
          // Their own row is no pick at all: it is what the sheet starts on.
          onPress: () =>
            setSelectedUserId(u.Id === user?.Id ? undefined : u.Id),
        })),
      },
    ],
    [users, user?.Id, targetUser?.Id],
  );

  const userPickerTrigger = useMemo(
    () => (
      <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
        <Text numberOfLines={1} className='flex-1 mr-2'>
          {targetUser?.Name}
        </Text>
        <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
      </View>
    ),
    [targetUser?.Name],
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

  const authorizeQuickConnect = useCallback(async () => {
    if (quickConnectCode) {
      if (isPickUnavailable) {
        errorHapticFeedback();
        Alert.alert(
          t("home.settings.quick_connect.error"),
          t("home.settings.quick_connect.selected_user_unavailable"),
        );
        setSelectedUserId(undefined);
        return;
      }
      try {
        const res = await getQuickConnectApi(api!).authorizeQuickConnect({
          code: quickConnectCode,
          userId: targetUser?.Id,
        });
        if (res.status === 200) {
          successHapticFeedback();
          Alert.alert(
            t("home.settings.quick_connect.success"),
            targetUser?.Id === user?.Id
              ? t("home.settings.quick_connect.quick_connect_authorized")
              : t("home.settings.quick_connect.quick_connect_authorized_for", {
                  username: targetUser?.Name,
                }),
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
  }, [api, user, targetUser, isPickUnavailable, quickConnectCode]);

  const pasteCode = useCallback(async () => {
    // Builds without the expo-clipboard native module: probe first (no-op).
    if (!requireOptionalNativeModule("ExpoClipboard")) return;
    const Clipboard = await import("expo-clipboard");
    const text = await Clipboard.getStringAsync();
    const digits = (text || "").replace(/\D/g, "").slice(0, 6);
    if (digits) setQuickConnectCode(digits);
  }, []);

  if (isTv) return null;

  return (
    <View {...props}>
      <ListGroup title={t("home.settings.quick_connect.quick_connect_title")}>
        <ListItem
          onPress={() => {
            // Reset the code when opening the sheet, and the user with it:
            // approving for someone else is a choice made each time.
            setQuickConnectCode("");
            setSelectedUserId(undefined);
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
            {/* Spaced with styles: a release build drops the space-y classes. */}
            <View style={{ gap: 16 }}>
              {showUserPicker && (
                <View
                  className='flex flex-col'
                  // On Android the options open as a second sheet, and a
                  // sheet only rises above a keyboard its own input raised:
                  // the one the code field keeps up would cover it.
                  onTouchStart={
                    isAndroid ? () => Keyboard.dismiss() : undefined
                  }
                >
                  <Text className='opacity-50 mb-1 text-xs'>
                    {t("home.settings.quick_connect.user")}
                  </Text>
                  <PlatformDropdown
                    groups={userGroups}
                    trigger={userPickerTrigger}
                    title={t("home.settings.quick_connect.user")}
                  />
                </View>
              )}
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
