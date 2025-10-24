import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./common/Text";
import {
  PLAYBACK_SPEEDS,
  PlaybackSpeedScope,
} from "./video-player/controls/dropdown/DropdownView";

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: number, scope: PlaybackSpeedScope) => void;
  selected: number;
  item?: BaseItemDto;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type PlaybackSpeedOption = {
  readonly value: number;
  readonly label: string;
};

export const PlaybackSpeedSelector: React.FC<Props> = ({
  onChange,
  selected,
  item,
  open: controlledOpen,
  onOpenChange,
  ...props
}) => {
  const isTv = Platform.isTV;
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedScope, setSelectedScope] = useState<PlaybackSpeedScope>(
    PlaybackSpeedScope.All,
  );

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const scopeLabels = useMemo<Record<PlaybackSpeedScope, string>>(() => {
    const labels: Record<string, string> = {
      [PlaybackSpeedScope.Media]: "Custom for this media",
    };

    if (item?.SeriesId) {
      labels[PlaybackSpeedScope.Show] = "Custom for this show";
    }

    labels[PlaybackSpeedScope.All] = "Default for all media";

    return labels as Record<PlaybackSpeedScope, string>;
  }, [item?.SeriesId]);

  const availableScopes = useMemo<PlaybackSpeedScope[]>(() => {
    const scopes = [PlaybackSpeedScope.Media];
    if (item?.SeriesId) {
      scopes.push(PlaybackSpeedScope.Show);
    }
    scopes.push(PlaybackSpeedScope.All);
    return scopes;
  }, [item?.SeriesId]);

  const speedOptions = useMemo<PlaybackSpeedOption[]>(() => {
    return [{ value: -1, label: "None" }, ...PLAYBACK_SPEEDS];
  }, []);

  const _selectedSpeed = useMemo(
    () => speedOptions.find((x) => x.value === selected),
    [speedOptions, selected],
  );

  const insets = useSafeAreaInsets();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["75%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
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

  const handleClose = useCallback(() => {
    setOpen(false);
    bottomSheetModalRef.current?.dismiss();
  }, [setOpen]);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSpeedSelect = useCallback(
    (speed: number) => {
      onChange(speed, selectedScope);
      setTimeout(() => handleClose(), 250);
    },
    [onChange, selectedScope, handleClose],
  );

  if (isTv) return null;

  return (
    <View
      className='flex shrink'
      style={{ minWidth: 60, maxWidth: 200 }}
      {...props}
    >
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
      >
        <BottomSheetScrollView
          style={{
            flex: 1,
          }}
        >
          <View
            className='mt-2 mb-8'
            style={{
              paddingLeft: Math.max(16, insets.left),
              paddingRight: Math.max(16, insets.right),
            }}
          >
            <Text className='font-bold text-2xl mb-6'>Playback Speed</Text>

            {/* Scope Selection */}
            <View className='mb-6'>
              <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                Apply To
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                }}
                className='flex flex-col rounded-xl overflow-hidden'
              >
                {availableScopes.map((scope, idx: number) => (
                  <View key={`scope-item-${scope}`}>
                    <TouchableOpacity
                      onPress={() => setSelectedScope(scope)}
                      className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                    >
                      <Text className='flex shrink'>{scopeLabels[scope]}</Text>
                      {selectedScope === scope ? (
                        <Ionicons
                          name='radio-button-on'
                          size={24}
                          color='white'
                        />
                      ) : (
                        <Ionicons
                          name='radio-button-off'
                          size={24}
                          color='white'
                        />
                      )}
                    </TouchableOpacity>
                    {idx < availableScopes.length - 1 && (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                        }}
                        className='bg-neutral-700'
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Speed Selection */}
            <View className='mb-6'>
              <Text className='font-semibold text-lg mb-3 text-neutral-300'>
                Speed
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                }}
                className='flex flex-col rounded-xl overflow-hidden'
              >
                {speedOptions.map((speed, idx: number) => (
                  <View key={`speed-item-${speed.value}`}>
                    <TouchableOpacity
                      onPress={() => handleSpeedSelect(speed.value)}
                      className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                    >
                      <Text className='flex shrink'>{speed.label}</Text>
                      {selected === speed.value ? (
                        <Ionicons
                          name='radio-button-on'
                          size={24}
                          color='white'
                        />
                      ) : (
                        <Ionicons
                          name='radio-button-off'
                          size={24}
                          color='white'
                        />
                      )}
                    </TouchableOpacity>
                    {idx < speedOptions.length - 1 && (
                      <View
                        style={{
                          height: StyleSheet.hairlineWidth,
                        }}
                        className='bg-neutral-700'
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
};
