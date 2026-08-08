import { Ionicons } from "@expo/vector-icons";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";

interface Props {
  user: UserDto;
  onPress?: () => void;
}

export const UserCard: React.FC<Props> = ({ user, onPress }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();

  const userImageUrl = useMemo(() => {
    if (!api || !user.Id || !user.PrimaryImageTag) {
      return null;
    }
    return `${api.basePath}/Users/${user.Id}/Images/Primary?height=150&quality=90&tag=${user.PrimaryImageTag}`;
  }, [api, user.Id, user.PrimaryImageTag]);

  const isAdmin = useMemo(() => {
    return user.Policy?.IsAdministrator || false;
  }, [user.Policy?.IsAdministrator]);

  const lastActivityDate = useMemo(() => {
    if (!user.LastActivityDate)
      return t("admin.users.never_active", "Never Active");
    //return new Date(user.LastActivityDate).toLocaleDateString();
    // Format like (eg, five minutes ago, yesterday, etc)
    const lastDate = new Date(user.LastActivityDate);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t("admin.users.just_now", "Just now");
    if (diffMins < 60)
      return t("admin.users.minutes_ago", `${diffMins} minutes ago`, {
        count: diffMins,
      });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return t("admin.users.hours_ago", `${diffHours} hours ago`, {
        count: diffHours,
      });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return t("admin.users.yesterday", "Yesterday");
    return t("admin.users.days_ago", `${diffDays} days ago`, {
      count: diffDays,
    });
  }, [user.LastActivityDate]);

  const isDisabled = useMemo(() => {
    return user.Policy?.IsDisabled || false;
  }, [user.Policy?.IsDisabled]);

  const cardContent = (
    <View className='flex-row items-center space-x-4'>
      {/* User Avatar */}
      <View className='relative'>
        {userImageUrl ? (
          <Image
            source={{ uri: userImageUrl }}
            className='w-12 h-12 rounded-full'
            cachePolicy='memory-disk'
            contentFit='cover'
          />
        ) : (
          <View className='w-12 h-12 rounded-full bg-neutral-700 items-center justify-center'>
            <Ionicons name='person' size={24} color='#9CA3AF' />
          </View>
        )}

        {/* Status indicator */}
        {isDisabled && (
          <View className='absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-neutral-900' />
        )}
        {!isDisabled && (
          <View className='absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-neutral-900' />
        )}
      </View>

      {/* User Info */}
      <View className='flex-1'>
        <View className='flex-row items-center space-x-2'>
          <Text className='text-white font-semibold text-base'>
            {user.Name || t("admin.users.unknown_user", "Unknown User")}
          </Text>
          {isAdmin && (
            <View className='px-2 py-1 bg-blue-600 rounded-full'>
              <Text className='text-white text-xs font-medium'>
                {t("admin.users.admin", "Admin")}
              </Text>
            </View>
          )}
        </View>

        <View className='flex-row items-center space-x-4 mt-1'>
          {lastActivityDate && (
            <Text className='text-neutral-400 text-sm'>
              {t("admin.users.last_seen", "Last seen")}: {lastActivityDate}
            </Text>
          )}
          {isDisabled && (
            <Text className='text-red-400 text-sm'>
              {t("admin.users.disabled", "Disabled")}
            </Text>
          )}
        </View>

        {/* Additional user info */}
        <View className='flex-row items-center space-x-4 mt-1'>
          {user.Policy?.EnabledFolders &&
            user.Policy.EnabledFolders.length > 0 && (
              <Text className='text-neutral-500 text-xs'>
                {t(
                  "admin.users.folders_count",
                  `${user.Policy.EnabledFolders.length} folders`,
                )}
              </Text>
            )}
          {user.Policy?.MaxParentalRating && (
            <Text className='text-neutral-500 text-xs'>
              {t("admin.users.parental_rating", "Rating")}:{" "}
              {user.Policy.MaxParentalRating}
            </Text>
          )}
        </View>
      </View>

      {/* Arrow for navigation */}
      {onPress && <Ionicons name='chevron-forward' size={20} color='#9CA3AF' />}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        className='mx-4 p-4 bg-neutral-900 rounded-xl active:opacity-70'
        onPress={onPress}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View className='mx-4 p-4 bg-neutral-900 rounded-xl'>{cardContent}</View>
  );
};
