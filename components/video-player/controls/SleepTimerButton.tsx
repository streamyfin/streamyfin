import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { isEqual } from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useHaptic } from "@/hooks/useHaptic";
import { useSleepTimerManager } from "@/hooks/useSleepTimerManager";
import { type SleepTimerOption, SleepTimerType } from "@/utils/atoms/settings";
import { formatDuration } from "../../../utils/formatDuration";

interface SleepTimerButtonProps {
  className?: string;
}

export const SleepTimerButton: React.FC<SleepTimerButtonProps> = ({
  className = "",
}) => {
  const { t } = useTranslation();
  const lightHapticFeedback = useHaptic("light");
  const [open, setOpen] = useState(false);

  const {
    timerStatus,
    isLoading,
    isEnabled,
    timerOptions,
    handleStartTimerFromOption,
    handleCancelTimer,
  } = useSleepTimerManager();

  // Function to check if an option matches the active timer
  const isActiveTimer = useCallback(
    (option: SleepTimerOption) => {
      if (!timerStatus?.isActive) return false;

      // For duration timers, compare type and duration
      if (
        option.type === SleepTimerType.DURATION &&
        timerStatus.type === SleepTimerType.DURATION
      ) {
        return option.duration === timerStatus.duration;
      }

      // For episode timers, compare type and episode count
      if (
        option.type === SleepTimerType.EPISODE &&
        timerStatus.type === SleepTimerType.EPISODE
      ) {
        return option.episodeCount === timerStatus.episodeCount;
      }

      return false;
    },
    [timerStatus],
  );

  // Handle option selection - cancel if active, start if not
  const handleOptionSelect = useCallback(
    (option: SleepTimerOption) => {
      if (isActiveTimer(option)) {
        handleCancelTimer();
      } else {
        handleStartTimerFromOption(option);
      }
      lightHapticFeedback();
      setOpen(false);
    },
    [
      isActiveTimer,
      handleCancelTimer,
      handleStartTimerFromOption,
      lightHapticFeedback,
    ],
  );

  const currentOption = useMemo(() => {
    return timerOptions.find((option) => isActiveTimer(option));
  }, [timerOptions, isActiveTimer]);

  const handleCancelPress = useCallback(() => {
    handleCancelTimer();
    lightHapticFeedback();
    setOpen(false);
  }, [handleCancelTimer, lightHapticFeedback]);

  // Format remaining time text
  const remainingText = useMemo(() => {
    if (!timerStatus?.isActive) return null;

    if (
      timerStatus.type === SleepTimerType.DURATION &&
      timerStatus.remainingMinutes !== undefined
    ) {
      return formatDuration(timerStatus.remainingMinutes, t);
    }

    if (
      timerStatus.type === SleepTimerType.EPISODE &&
      timerStatus.remainingEpisodes !== undefined
    ) {
      return t("jellysleep.after_episode", {
        count: timerStatus.remainingEpisodes,
      });
    }

    return null;
  }, [timerStatus, t]);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["85%"], []);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setOpen(false);
    }
  }, []);

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

  // Hide on TV platforms or if not enabled
  if (Platform.isTV || !isEnabled) return null;

  return (
    <>
      <TouchableOpacity
        disabled={isLoading}
        className={`aspect-square flex flex-col rounded-xl items-center justify-center p-2 ${className}`}
        style={{ opacity: isLoading ? 0.5 : 1 }}
        onPress={() => setOpen(true)}
      >
        <Ionicons
          name={timerStatus?.isActive ? "moon" : "moon-outline"}
          size={24}
          color={timerStatus?.isActive ? "#3b82f6" : "white"}
        />
      </TouchableOpacity>

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
            <Text className='font-bold text-2xl mb-2'>
              {t("jellysleep.manage_timer")}
            </Text>

            {timerStatus?.isActive && remainingText && (
              <View className='bg-neutral-800 px-4 py-3 rounded-xl mb-4'>
                <Text className='text-sm text-neutral-400 mb-1'>
                  {t("jellysleep.active_timer")}
                </Text>
                <Text className='text-lg font-semibold'>
                  {remainingText}{" "}
                  {timerStatus.type === SleepTimerType.DURATION
                    ? t("jellysleep.remaining")
                    : ""}
                </Text>
              </View>
            )}

            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
              }}
              className='mb-4 flex flex-col rounded-xl overflow-hidden'
            >
              {timerOptions?.map((item, index) => (
                <View key={index}>
                  <TouchableOpacity
                    onPress={() => {
                      handleOptionSelect(item);
                    }}
                    className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                  >
                    <Text className='flex shrink'>{item.label}</Text>
                    {currentOption && isEqual(currentOption, item) ? (
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
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                    }}
                    className='h-1 divide-neutral-700'
                  />
                </View>
              ))}
            </View>

            {timerStatus?.isActive && (
              <TouchableOpacity
                onPress={handleCancelPress}
                className='bg-red-600 px-4 py-3 rounded-xl flex flex-row items-center justify-center'
              >
                <Ionicons name='close-circle-outline' size={20} color='white' />
                <Text className='ml-2 font-semibold'>
                  {t("jellysleep.cancel_timer")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
};
