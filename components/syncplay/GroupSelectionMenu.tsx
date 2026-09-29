/**
 * GroupSelectionMenu
 *
 * Content rendered inside the SyncPlay bottom sheet (the sheet itself is
 * owned by SyncPlayButton). Calls `onClose` after successful actions to
 * dismiss the parent sheet.
 */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useSyncPlay } from "@/providers/SyncPlay";
import type { GroupInfoDto } from "@/providers/SyncPlay/types";

interface GroupSelectionMenuProps {
  onClose: () => void;
}

export function GroupSelectionMenu({ onClose }: GroupSelectionMenuProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const {
    isEnabled,
    groupInfo,
    canCreateGroups,
    joinGroup,
    createGroup,
    leaveGroup,
    getGroups,
    resumeGroupPlayback,
  } = useSyncPlay();

  const [groups, setGroups] = useState<GroupInfoDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const fetchedGroups = await getGroups();
        if (!cancelled) {
          setGroups(fetchedGroups);
        }
      } catch (error) {
        console.error("Failed to fetch groups", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getGroups]);

  const handleJoinGroup = useCallback(
    async (groupId: string) => {
      try {
        await joinGroup(groupId);
        onClose();
      } catch (error) {
        console.error("Failed to join group", error);
      }
    },
    [joinGroup, onClose],
  );

  const handleCreateGroup = useCallback(async () => {
    setIsCreating(true);
    try {
      await createGroup();
      onClose();
    } catch (error) {
      console.error("Failed to create group", error);
    } finally {
      setIsCreating(false);
    }
  }, [createGroup, onClose]);

  const handleLeaveGroup = useCallback(async () => {
    try {
      await leaveGroup();
      onClose();
    } catch (error) {
      console.error("Failed to leave group", error);
    }
  }, [leaveGroup, onClose]);

  // Jump (back) into the group's current item. Mirrors jellyfin-web's
  // "Resume playback" menu entry — close the sheet and navigate to
  // the player; SyncPlayProvider handles the re-follow + URL build.
  const handleResumePlayback = useCallback(async () => {
    try {
      await resumeGroupPlayback();
      onClose();
    } catch (error) {
      console.error("Failed to resume group playback", error);
    }
  }, [resumeGroupPlayback, onClose]);

  const containerStyle = {
    paddingLeft: Math.max(16, insets.left),
    paddingRight: Math.max(16, insets.right),
    paddingBottom: Math.max(16, insets.bottom),
    paddingTop: 8,
  };

  if (isEnabled && groupInfo) {
    return (
      <View style={containerStyle}>
        <View className='mb-4'>
          <View className='flex-row items-center mb-2'>
            <Ionicons name='people' size={24} color='#00a4dc' />
            <Text className='font-bold text-xl text-neutral-100 ml-2'>
              {t("syncplay.title")}
            </Text>
          </View>
          <Text className='text-neutral-400'>{t("syncplay.my_group")}</Text>
        </View>

        <View className='bg-neutral-800 rounded-xl p-4 mb-4'>
          <View className='flex-row items-center justify-between mb-3'>
            <Text className='text-neutral-100 font-semibold text-lg'>
              {groupInfo.GroupName}
            </Text>
            <View className='bg-[#00a4dc] px-2 py-1 rounded'>
              <Text className='text-white text-xs font-medium'>
                {groupInfo.State}
              </Text>
            </View>
          </View>

          {groupInfo.Participants && groupInfo.Participants.length > 0 && (
            <View className='flex-row items-center'>
              <Ionicons name='person' size={16} color='#9ca3af' />
              <Text className='text-neutral-400 ml-2'>
                {groupInfo.Participants.length} {t("syncplay.members")}
              </Text>
            </View>
          )}
        </View>

        <View className='mb-3'>
          <Button onPress={handleResumePlayback} color='black'>
            <View className='flex-row items-center justify-center'>
              <Ionicons name='play-circle-outline' size={20} color='white' />
              <Text className='text-white font-semibold ml-2'>
                {t("syncplay.resume_playback")}
              </Text>
            </View>
          </Button>
        </View>

        <Button onPress={handleLeaveGroup} color='red'>
          <View className='flex-row items-center justify-center'>
            <Ionicons name='exit-outline' size={20} color='white' />
            <Text className='text-white font-semibold ml-2'>
              {t("syncplay.leave_group")}
            </Text>
          </View>
        </Button>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <View className='mb-4'>
        <View className='flex-row items-center mb-2'>
          <Ionicons name='people-outline' size={24} color='white' />
          <Text className='font-bold text-xl text-neutral-100 ml-2'>
            {t("syncplay.title")}
          </Text>
        </View>
        <Text className='text-neutral-400'>{t("syncplay.join_group")}</Text>
      </View>

      {isLoading && (
        <View className='py-8 items-center'>
          <ActivityIndicator color='#00a4dc' />
        </View>
      )}

      {!isLoading && groups.length > 0 && (
        <View className='mb-4'>
          <Text className='text-neutral-400 text-sm mb-2 ml-1'>
            {t("syncplay.available_groups")}
          </Text>
          <View className='bg-neutral-800 rounded-xl overflow-hidden'>
            {groups.map((group, index) => (
              <TouchableOpacity
                key={group.GroupId ?? index}
                onPress={() => group.GroupId && handleJoinGroup(group.GroupId)}
                className={`flex-row items-center p-4 ${
                  index < groups.length - 1 ? "border-b border-neutral-700" : ""
                }`}
              >
                <View className='w-10 h-10 bg-[#00a4dc]/20 rounded-full items-center justify-center mr-3'>
                  <Ionicons name='people' size={20} color='#00a4dc' />
                </View>

                <View className='flex-1'>
                  <Text className='text-neutral-100 font-medium'>
                    {group.GroupName}
                  </Text>
                  <Text className='text-neutral-500 text-sm'>
                    {group.Participants?.length ?? 0} {t("syncplay.members")} •{" "}
                    {group.State}
                  </Text>
                </View>

                <Ionicons name='chevron-forward' size={20} color='#9ca3af' />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!isLoading && groups.length === 0 && (
        <View className='bg-neutral-800/50 rounded-xl p-6 mb-4 items-center'>
          <Ionicons name='people-outline' size={40} color='#6b7280' />
          <Text className='text-neutral-400 text-center mt-3'>
            {t("syncplay.available_groups")}: 0{"\n"}
            {t("syncplay.create_new_group")}
          </Text>
        </View>
      )}

      {canCreateGroups && (
        <Button
          onPress={handleCreateGroup}
          color='purple'
          disabled={isCreating}
        >
          <View className='flex-row items-center justify-center'>
            {isCreating ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              <>
                <Ionicons name='add' size={20} color='white' />
                <Text className='text-white font-semibold ml-2'>
                  {t("syncplay.create_new_group")}
                </Text>
              </>
            )}
          </View>
        </Button>
      )}
    </View>
  );
}
