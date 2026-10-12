import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";

interface Props {
  folder: BaseItemDto;
}

/**
 * A folder in the Folders tab. It opens as a folder even when the server typed
 * it as an album, so a library sorted into folders is browsed as it is on disk.
 */
export const MusicFolderRow: React.FC<Props> = ({ folder }) => {
  const router = useRouter();

  const handlePress = useCallback(() => {
    router.push({
      pathname: "/music/folder/[folderId]",
      params: { folderId: folder.Id!, name: folder.Name ?? "" },
    });
  }, [router, folder.Id, folder.Name]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      accessibilityRole='button'
      className='flex-row items-center py-3 px-4'
    >
      <View className='w-11 h-11 rounded-md bg-neutral-800 items-center justify-center'>
        <Ionicons name='folder' size={22} color='#9334E9' />
      </View>
      <Text className='flex-1 ml-3 text-white' numberOfLines={1}>
        {folder.Name}
      </Text>
      <Ionicons name='chevron-forward' size={18} color='#737373' />
    </TouchableOpacity>
  );
};
