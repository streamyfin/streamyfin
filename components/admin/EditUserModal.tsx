import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type {
  BaseItemDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
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

interface EditUserModalProps {
  visible: boolean;
  onClose: () => void;
  user: UserDto | null;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  visible,
  onClose,
  user,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const queryClient = useQueryClient();
  const successHaptic = useHaptic("success");
  const errorHaptic = useHaptic("error");

  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [enableAllLibraries, setEnableAllLibraries] = useState(true);
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["85%"]),
    [isAndroid],
  );

  // Fetch fresh user data
  const { data: freshUserData, refetch: refetchUser } = useQuery({
    queryKey: ["admin", "user", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) throw new Error("No API available");
      const response = await getUserApi(api).getUserById({ userId: user.Id });
      return response.data;
    },
    enabled: !!api && !!user?.Id && visible,
  });

  // Use fresh data if available, otherwise fall back to prop
  const currentUser = freshUserData || user;

  // Fetch available libraries
  const { data: libraries, isLoading: librariesLoading } = useQuery({
    queryKey: ["admin", "libraries"],
    queryFn: async () => {
      if (!api) throw new Error("No API available");
      const response = await getLibraryApi(api).getMediaFolders();
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

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({
      userId,
      name,
      enableAllLibraries,
      enabledLibraries,
    }: {
      userId: string;
      name: string;
      enableAllLibraries: boolean;
      enabledLibraries: string[];
    }) => {
      if (!api || !currentUser) throw new Error("No API available");

      // Update username if changed
      if (name !== currentUser.Name) {
        await getUserApi(api).updateUser({
          userId,
          userDto: {
            ...currentUser,
            Name: name,
          },
        });
      }

      // Update library access policy
      if (currentUser.Policy) {
        await getUserApi(api).updateUserPolicy({
          userId,
          userPolicy: {
            ...currentUser.Policy,
            EnableAllFolders: enableAllLibraries,
            EnabledFolders: enableAllLibraries ? [] : enabledLibraries,
          },
        });
      }
    },
    onSuccess: async () => {
      successHaptic();
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (err: Error) => {
      errorHaptic();
      setError(err.message || t("admin.users.update_error"));
    },
  });

  // Update password mutation
  const updatePasswordMutation = useMutation({
    mutationFn: async ({
      userId,
      newPassword,
    }: {
      userId: string;
      newPassword: string;
    }) => {
      if (!api) throw new Error("No API available");
      await getUserApi(api).updateUserPassword({
        userId,
        updateUserPassword: {
          NewPw: newPassword,
          ResetPassword: false,
        },
      });
    },
    onSuccess: () => {
      successHaptic();
      setNewPassword("");
      Alert.alert(
        t("admin.users.password_updated"),
        t("admin.users.password_updated_description"),
      );
    },
    onError: (err: Error) => {
      errorHaptic();
      setError(err.message || t("admin.users.password_update_error"));
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!api) throw new Error("No API available");
      await getUserApi(api).deleteUser({ userId });
    },
    onSuccess: async () => {
      successHaptic();
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (err: Error) => {
      errorHaptic();
      setError(err.message || t("admin.users.delete_error"));
    },
  });

  // Initialize form with user data
  useEffect(() => {
    if (currentUser && visible) {
      setUsername(currentUser.Name || "");
      setEnableAllLibraries(currentUser.Policy?.EnableAllFolders ?? true);
      setSelectedLibraries(currentUser.Policy?.EnabledFolders || []);
      setNewPassword("");
      setError(null);
      setShowDeleteConfirm(false);
      bottomSheetModalRef.current?.present();
    } else if (!visible) {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [currentUser, visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
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

  const handleSave = async () => {
    if (!currentUser?.Id) return;

    if (!username.trim()) {
      setError(t("admin.users.username_required"));
      return;
    }

    updateUserMutation.mutate({
      userId: currentUser.Id,
      name: username.trim(),
      enableAllLibraries,
      enabledLibraries: selectedLibraries,
    });
  };

  const handleUpdatePassword = async () => {
    if (!currentUser?.Id || !newPassword.trim()) return;

    updatePasswordMutation.mutate({
      userId: currentUser.Id,
      newPassword: newPassword.trim(),
    });
  };

  const handleDelete = () => {
    if (!currentUser?.Id) return;

    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    deleteUserMutation.mutate(currentUser.Id);
  };

  const toggleLibrary = (libraryId: string) => {
    setSelectedLibraries((prev) =>
      prev.includes(libraryId)
        ? prev.filter((id) => id !== libraryId)
        : [...prev, libraryId],
    );
  };

  const isLoading =
    updateUserMutation.isPending ||
    updatePasswordMutation.isPending ||
    deleteUserMutation.isPending;

  if (!currentUser) return null;

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
              {t("admin.users.edit_user")}
            </Text>
            <Text className='text-neutral-400 mt-1'>{currentUser.Name}</Text>
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

          {/* Password Section */}
          <View className='p-4 border border-neutral-800 rounded-xl bg-neutral-900 mb-4'>
            <Text className='text-neutral-400 text-sm mb-2'>
              {t("admin.users.change_password")}
            </Text>
            <View className='flex-row items-center gap-2'>
              <BottomSheetTextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t("admin.users.new_password")}
                placeholderTextColor='#6B7280'
                secureTextEntry
                autoCapitalize='none'
                autoCorrect={false}
                style={{
                  flex: 1,
                  backgroundColor: "#1F2937",
                  borderRadius: 8,
                  padding: 12,
                  color: "white",
                  fontSize: 16,
                }}
              />
              <TouchableOpacity
                onPress={handleUpdatePassword}
                disabled={
                  !newPassword.trim() || updatePasswordMutation.isPending
                }
                className={`px-4 py-3 rounded-lg ${
                  newPassword.trim() ? "bg-purple-600" : "bg-neutral-700"
                }`}
              >
                {updatePasswordMutation.isPending ? (
                  <ActivityIndicator size='small' color='white' />
                ) : (
                  <Ionicons name='checkmark' size={20} color='white' />
                )}
              </TouchableOpacity>
            </View>
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

          {/* Save Button */}
          <Button
            onPress={handleSave}
            color='purple'
            className='mb-4'
            disabled={isLoading || !username.trim()}
          >
            {updateUserMutation.isPending ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              t("admin.users.save_changes")
            )}
          </Button>

          {/* Delete Section */}
          <View className='p-4 border border-red-900 rounded-xl bg-red-950/30 mb-4'>
            <Text className='text-red-400 text-sm mb-3'>
              {t("admin.users.danger_zone")}
            </Text>
            {showDeleteConfirm ? (
              <View>
                <Text className='text-neutral-300 mb-3 text-center'>
                  {t("admin.users.delete_confirm", {
                    username: currentUser.Name,
                  })}
                </Text>
                <View className='flex-row gap-3'>
                  <Button
                    onPress={() => setShowDeleteConfirm(false)}
                    color='black'
                    className='flex-1'
                    disabled={deleteUserMutation.isPending}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onPress={handleDelete}
                    color='red'
                    className='flex-1'
                    disabled={deleteUserMutation.isPending}
                  >
                    {deleteUserMutation.isPending ? (
                      <ActivityIndicator size='small' color='white' />
                    ) : (
                      t("admin.users.delete_user")
                    )}
                  </Button>
                </View>
              </View>
            ) : (
              <Button onPress={handleDelete} color='red' disabled={isLoading}>
                {t("admin.users.delete_user")}
              </Button>
            )}
          </View>

          {/* Cancel Button */}
          <Button onPress={onClose} color='black' disabled={isLoading}>
            {t("common.cancel")}
          </Button>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};
