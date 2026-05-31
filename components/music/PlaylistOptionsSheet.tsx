import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { useDeletePlaylist } from "@/hooks/usePlaylistMutations";
import {
  type BottomSheetMethods,
  BottomSheetModal,
  BottomSheetView,
} from "@/utils/expoUiBottomSheet";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  playlist: BaseItemDto | null;
}

export const PlaylistOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  playlist,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetMethods>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const deletePlaylist = useDeletePlaylist();

  const snapPoints = useMemo(() => ["25%"], []);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const handleDeletePlaylist = useCallback(() => {
    if (!playlist?.Id) return;

    Alert.alert(
      t("music.playlists.delete_playlist"),
      t("music.playlists.delete_confirm", { name: playlist.Name }),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            deletePlaylist.mutate(
              { playlistId: playlist.Id! },
              {
                onSuccess: () => {
                  setOpen(false);
                  router.back();
                },
              },
            );
          },
        },
      ],
    );
  }, [playlist, deletePlaylist, setOpen, router, t]);

  if (!playlist) return null;
  if (Platform.isTV) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enablePanDownToClose
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom,
        }}
      >
        <View className='flex-col rounded-xl overflow-hidden bg-neutral-800'>
          <TouchableOpacity
            onPress={handleDeletePlaylist}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='trash-outline' size={22} color='#ef4444' />
            <Text className='text-red-500 ml-4 text-base'>
              {t("music.playlists.delete_playlist")}
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const _styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
