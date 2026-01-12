import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useCreatePlaylist } from "@/hooks/usePlaylistMutations";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  onPlaylistCreated?: (playlistId: string) => void;
  initialTrackId?: string;
}

export const CreatePlaylistModal: React.FC<Props> = ({
  open,
  setOpen,
  onPlaylistCreated,
  initialTrackId,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const createPlaylist = useCreatePlaylist();

  const [name, setName] = useState("");
  const snapPoints = useMemo(() => ["40%"], []);

  useEffect(() => {
    if (open) {
      setName("");
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
        Keyboard.dismiss();
      }
    },
    [setOpen],
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

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;

    const result = await createPlaylist.mutateAsync({
      name: name.trim(),
      trackIds: initialTrackId ? [initialTrackId] : undefined,
    });

    if (result) {
      onPlaylistCreated?.(result);
    }
    setOpen(false);
  }, [name, createPlaylist, initialTrackId, onPlaylistCreated, setOpen]);

  const isValid = name.trim().length > 0;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
      keyboardBehavior='interactive'
      keyboardBlurBehavior='restore'
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom + 16,
        }}
      >
        <Text className='font-bold text-2xl mb-6'>
          {t("music.playlists.create_playlist")}
        </Text>

        <Text className='text-neutral-400 mb-2 text-sm'>
          {t("music.playlists.playlist_name")}
        </Text>
        <BottomSheetTextInput
          placeholder={t("music.playlists.enter_name")}
          placeholderTextColor='#737373'
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType='done'
          onSubmitEditing={handleCreate}
          style={{
            backgroundColor: "#262626",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 16,
            color: "white",
            marginBottom: 24,
          }}
        />

        <Button
          onPress={handleCreate}
          disabled={!isValid || createPlaylist.isPending}
          className={`py-4 rounded-xl ${isValid ? "bg-purple-600" : "bg-neutral-700"}`}
        >
          {createPlaylist.isPending ? (
            <ActivityIndicator color='white' />
          ) : (
            <Text
              className={`text-center font-semibold ${isValid ? "text-white" : "text-neutral-500"}`}
            >
              {t("music.playlists.create")}
            </Text>
          )}
        </Button>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
