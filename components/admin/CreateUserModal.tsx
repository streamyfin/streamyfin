import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom } from "@/providers/JellyfinProvider";

interface CreateUserModalProps {
  visible: boolean;
  onClose: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const queryClient = useQueryClient();
  const successHaptic = useHaptic("success");
  const errorHaptic = useHaptic("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enableAllLibraries, setEnableAllLibraries] = useState(true);
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["80%"]),
    [isAndroid],
  );

  // Fetch available libraries (excluding playlists and other non-library types)
  const { data: libraries, isLoading: librariesLoading } = useQuery({
    queryKey: ["admin", "libraries"],
    queryFn: async () => {
      if (!api) throw new Error("No API available");
      const response = await getLibraryApi(api).getMediaFolders();
      // Filter out playlists and other non-library collection types
      const validCollectionTypes = [
        "movies",
        "tvshows",
        "music",
        "musicvideos",
        "homevideos",
        "boxsets",
        "books",
        "mixed",
      ];
      return (response.data.Items || []).filter(
        (item) =>
          item.CollectionType &&
          validCollectionTypes.includes(item.CollectionType.toLowerCase()),
      );
    },
    enabled: !!api && visible,
  });

  const createUserMutation = useMutation({
    mutationFn: async ({
      name,
      password,
      enableAllLibraries,
      enabledLibraries,
    }: {
      name: string;
      password?: string;
      enableAllLibraries: boolean;
      enabledLibraries: string[];
    }) => {
      if (!api) throw new Error("No API available");

      // Create the user
      const response = await getUserApi(api).createUserByName({
        createUserByName: {
          Name: name,
          Password: password || undefined,
        },
      });

      const newUser = response.data;

      // Update user policy with library access if not enabling all libraries
      if (!enableAllLibraries && newUser.Id && newUser.Policy) {
        await getUserApi(api).updateUserPolicy({
          userId: newUser.Id,
          userPolicy: {
            ...newUser.Policy,
            EnableAllFolders: false,
            EnabledFolders: enabledLibraries,
          },
        });
      }

      return newUser;
    },
    onSuccess: () => {
      successHaptic();
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      resetForm();
      onClose();
    },
    onError: (err: Error) => {
      errorHaptic();
      setError(err.message || t("admin.users.create_error"));
    },
  });

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setError(null);
    setEnableAllLibraries(true);
    setSelectedLibraries([]);
  };

  useEffect(() => {
    if (visible) {
      resetForm();
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        resetForm();
        Keyboard.dismiss();
        onClose();
      }
    },
    [onClose],
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

  const handleCreate = async () => {
    if (!username.trim()) {
      setError(t("admin.users.username_required"));
      return;
    }

    createUserMutation.mutate({
      name: username.trim(),
      password: password || undefined,
      enableAllLibraries,
      enabledLibraries: selectedLibraries,
    });
  };

  const toggleLibrary = (libraryId: string) => {
    setSelectedLibraries((prev) =>
      prev.includes(libraryId)
        ? prev.filter((id) => id !== libraryId)
        : [...prev, libraryId],
    );
  };

  const isValid = username.trim().length > 0;
  const isLoading = createUserMutation.isPending;

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
      <BottomSheetScrollView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
        }}
        contentContainerStyle={{
          paddingBottom: Math.max(16, insets.bottom),
        }}
      >
        <View className='flex-1'>
          {/* Header */}
          <View className='mb-6'>
            <Text className='font-bold text-2xl text-neutral-100'>
              {t("admin.users.create_user")}
            </Text>
            <Text className='text-neutral-400 mt-1'>
              {t("admin.users.create_user_description")}
            </Text>
          </View>

          {/* Username Input */}
          <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
            <Text className='text-neutral-400 text-sm mb-2'>
              {t("admin.users.username")}
            </Text>
            <BottomSheetTextInput
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setError(null);
              }}
              placeholder={t("admin.users.enter_username")}
              placeholderTextColor='#6B7280'
              autoFocus
              autoCapitalize='none'
              autoCorrect={false}
              style={{
                backgroundColor: "#1F2937",
                borderRadius: 8,
                padding: 12,
                color: "white",
                fontSize: 16,
              }}
            />
          </View>

          {/* Password Input */}
          <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
            <Text className='text-neutral-400 text-sm mb-2'>
              {t("admin.users.password_optional")}
            </Text>
            <BottomSheetTextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("admin.users.enter_password")}
              placeholderTextColor='#6B7280'
              secureTextEntry
              autoCapitalize='none'
              autoCorrect={false}
              style={{
                backgroundColor: "#1F2937",
                borderRadius: 8,
                padding: 12,
                color: "white",
                fontSize: 16,
              }}
            />
          </View>

          {/* Library Access Section */}
          <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
            <Text className='text-neutral-400 text-sm mb-3'>
              {t("admin.users.library_access")}
            </Text>

            {/* Enable All Libraries Toggle */}
            <TouchableOpacity
              onPress={() => setEnableAllLibraries(!enableAllLibraries)}
              className='flex-row items-center justify-between py-2'
            >
              <Text className='text-white'>
                {t("admin.users.enable_all_libraries")}
              </Text>
              <Switch
                value={enableAllLibraries}
                onValueChange={setEnableAllLibraries}
                trackColor={{ false: "#374151", true: "#7C3AED" }}
                thumbColor='white'
              />
            </TouchableOpacity>

            {/* Individual Library Selection */}
            {!enableAllLibraries && (
              <View className='mt-3 pt-3 border-t border-neutral-700'>
                {librariesLoading ? (
                  <ActivityIndicator size='small' color='#9CA3AF' />
                ) : libraries && libraries.length > 0 ? (
                  libraries.map((library: BaseItemDto) => (
                    <TouchableOpacity
                      key={library.Id}
                      onPress={() => library.Id && toggleLibrary(library.Id)}
                      className='flex-row items-center justify-between py-2'
                    >
                      <Text className='text-neutral-300'>{library.Name}</Text>
                      <Switch
                        value={selectedLibraries.includes(library.Id || "")}
                        onValueChange={() => {
                          if (library.Id) toggleLibrary(library.Id);
                        }}
                        trackColor={{ false: "#374151", true: "#7C3AED" }}
                        thumbColor='white'
                      />
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text className='text-neutral-500 text-center'>
                    {t("admin.users.no_libraries_found")}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Error Message */}
          {error && (
            <Text className='text-red-500 mb-4 text-center'>{error}</Text>
          )}

          {/* Buttons */}
          <View className='flex-row gap-3'>
            <Button
              onPress={onClose}
              color='black'
              className='flex-1'
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onPress={handleCreate}
              color='purple'
              className='flex-1'
              disabled={isLoading || !isValid}
            >
              {isLoading ? (
                <ActivityIndicator size='small' color='white' />
              ) : (
                t("admin.users.create")
              )}
            </Button>
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};
