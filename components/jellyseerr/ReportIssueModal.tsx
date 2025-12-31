import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Platform,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  IssueType,
  IssueTypeName,
} from "@/utils/jellyseerr/server/constants/issue";

interface Props {
  mediaId: number;
  mediaType: "movie" | "tv";
  title: string;
  // For TV shows - pre-fill context
  seasonNumber?: number;
  episodeNumber?: number;
  totalSeasons?: number;
  onSubmitted?: () => void;
  onDismiss?: () => void;
}

const ISSUE_TYPE_ICONS: Record<IssueType, keyof typeof Ionicons.glyphMap> = {
  [IssueType.VIDEO]: "film-outline",
  [IssueType.AUDIO]: "volume-high-outline",
  [IssueType.SUBTITLES]: "text-outline",
  [IssueType.OTHER]: "help-circle-outline",
};

const ReportIssueModal = forwardRef<
  BottomSheetModalMethods,
  Props & Omit<ViewProps, "id">
>(
  (
    {
      mediaId,
      mediaType,
      title,
      seasonNumber,
      episodeNumber,
      totalSeasons = 1,
      onSubmitted,
      onDismiss,
    },
    ref,
  ) => {
    const { jellyseerrApi } = useJellyseerr();
    const { t } = useTranslation();

    const [selectedIssueType, setSelectedIssueType] = useState<
      IssueType | undefined
    >();
    const [message, setMessage] = useState("");
    const [selectedSeason, setSelectedSeason] = useState<number>(
      seasonNumber ?? 0,
    );
    const [selectedEpisode, setSelectedEpisode] = useState<number>(
      episodeNumber ?? 0,
    );
    const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
    const [episodeDropdownOpen, setEpisodeDropdownOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [inputKey, setInputKey] = useState(0);

    // Workaround for Android keyboard issue: https://github.com/gorhom/react-native-bottom-sheet/issues/2509
    useEffect(() => {
      if (Platform.OS === "android") {
        const listener = Keyboard.addListener("keyboardDidHide", () => {
          (
            ref as React.RefObject<BottomSheetModalMethods>
          )?.current?.snapToIndex(0);
        });
        return () => listener.remove();
      }
    }, [ref]);

    const handleDismiss = useCallback(() => {
      setSeasonDropdownOpen(false);
      setEpisodeDropdownOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    const resetForm = useCallback(() => {
      setSelectedIssueType(undefined);
      setMessage("");
      setSelectedSeason(seasonNumber ?? 0);
      setSelectedEpisode(episodeNumber ?? 0);
      setInputKey((prev) => prev + 1);
    }, [seasonNumber, episodeNumber]);

    const handleSubmit = useCallback(async () => {
      if (!selectedIssueType || !jellyseerrApi) return;

      setIsSubmitting(true);
      try {
        await jellyseerrApi.submitIssue(
          mediaId,
          selectedIssueType,
          message,
          mediaType === "tv" ? selectedSeason : undefined,
          mediaType === "tv" ? selectedEpisode : undefined,
        );
        resetForm();
        onSubmitted?.();
        (ref as React.RefObject<BottomSheetModalMethods>)?.current?.close();
      } catch (error) {
        console.error("Failed to submit issue:", error);
      } finally {
        setIsSubmitting(false);
      }
    }, [
      selectedIssueType,
      message,
      mediaId,
      mediaType,
      selectedSeason,
      selectedEpisode,
      jellyseerrApi,
      resetForm,
      onSubmitted,
      ref,
    ]);

    // Generate season options
    const seasonOptions = useMemo(() => {
      const options = [
        {
          type: "radio" as const,
          label: t("jellyseerr.all_seasons"),
          value: "0",
          selected: selectedSeason === 0,
          onPress: () => {
            setSelectedSeason(0);
            setSelectedEpisode(0);
          },
        },
      ];

      for (let i = 1; i <= totalSeasons; i++) {
        options.push({
          type: "radio" as const,
          label: t("jellyseerr.season_number", { season_number: i }),
          value: String(i),
          selected: selectedSeason === i,
          onPress: () => {
            setSelectedSeason(i);
            if (selectedEpisode === 0) {
              // Keep "All episodes" when changing season
            }
          },
        });
      }

      return [{ options }];
    }, [totalSeasons, selectedSeason, t]);

    // Episode options - simplified (0 = all, or specific number)
    const episodeOptions = useMemo(() => {
      const options = [
        {
          type: "radio" as const,
          label: t("jellyseerr.all_episodes"),
          value: "0",
          selected: selectedEpisode === 0,
          onPress: () => setSelectedEpisode(0),
        },
      ];

      // Add some episode numbers (1-20 as common range)
      for (let i = 1; i <= 20; i++) {
        options.push({
          type: "radio" as const,
          label: t("jellyseerr.episode_number", { episode_number: i }),
          value: String(i),
          selected: selectedEpisode === i,
          onPress: () => setSelectedEpisode(i),
        });
      }

      return [{ options }];
    }, [selectedEpisode, t]);

    const isSeasonPreset = seasonNumber !== undefined;
    const isEpisodePreset = episodeNumber !== undefined;

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enableDismissOnClose
        onDismiss={handleDismiss}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={(sheetProps: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...sheetProps}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
        stackBehavior='push'
        android_keyboardInputMode='adjustResize'
        keyboardBehavior='fillParent'
        keyboardBlurBehavior='none'
      >
        <BottomSheetScrollView>
          <View className='flex flex-col space-y-4 px-4 pt-2'>
            {/* Header */}
            <View>
              <Text className='font-bold text-2xl text-purple-400'>
                {t("jellyseerr.report_issue")}
              </Text>
              <Text className='text-neutral-300' numberOfLines={1}>
                {title}
              </Text>
            </View>

            {/* Issue Type Selection */}
            <View className='flex flex-col space-y-2'>
              <Text className='opacity-50 text-xs'>
                {t("jellyseerr.issue_type")}
              </Text>
              <View className='flex flex-row flex-wrap gap-2'>
                {Object.entries(IssueTypeName).map(([key, label]) => {
                  const issueType = Number(key) as IssueType;
                  const isSelected = selectedIssueType === issueType;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setSelectedIssueType(issueType)}
                      className={`flex flex-row items-center px-3 py-2 rounded-lg border ${
                        isSelected
                          ? "bg-purple-600 border-purple-500"
                          : "bg-neutral-900 border-neutral-800"
                      }`}
                    >
                      <Ionicons
                        name={ISSUE_TYPE_ICONS[issueType]}
                        size={16}
                        color={isSelected ? "white" : "#9CA3AF"}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        className={
                          isSelected ? "text-white" : "text-neutral-400"
                        }
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Description */}
            <View className='flex flex-col space-y-2'>
              <Text className='opacity-50 text-xs'>
                {t("jellyseerr.issue_description")}
              </Text>
              <BottomSheetTextInput
                key={inputKey.toString()}
                placeholder={t("jellyseerr.issue_description_placeholder")}
                placeholderTextColor='#6B7280'
                defaultValue=''
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                autoCorrect={false}
                style={{
                  backgroundColor: "#171717",
                  borderWidth: 1,
                  borderColor: "#404040",
                  borderRadius: 12,
                  padding: 12,
                  color: "white",
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
              />
            </View>

            {/* Season/Episode selectors (TV only) */}
            {mediaType === "tv" && (
              <View className='flex flex-col space-y-4'>
                <View className='flex flex-col space-y-2'>
                  <Text className='opacity-50 text-xs'>
                    {t("jellyseerr.select_season")}
                  </Text>
                  {isSeasonPreset ? (
                    <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between opacity-50'>
                      <Text numberOfLines={1}>
                        {selectedSeason === 0
                          ? t("jellyseerr.all_seasons")
                          : t("jellyseerr.season_number", {
                              season_number: selectedSeason,
                            })}
                      </Text>
                    </View>
                  ) : (
                    <PlatformDropdown
                      groups={seasonOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {selectedSeason === 0
                              ? t("jellyseerr.all_seasons")
                              : t("jellyseerr.season_number", {
                                  season_number: selectedSeason,
                                })}
                          </Text>
                        </View>
                      }
                      title={t("jellyseerr.select_season")}
                      open={seasonDropdownOpen}
                      onOpenChange={setSeasonDropdownOpen}
                    />
                  )}
                </View>

                <View className='flex flex-col space-y-2'>
                  <Text className='opacity-50 text-xs'>
                    {t("jellyseerr.select_episode")}
                  </Text>
                  {isEpisodePreset ? (
                    <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between opacity-50'>
                      <Text numberOfLines={1}>
                        {selectedEpisode === 0
                          ? t("jellyseerr.all_episodes")
                          : t("jellyseerr.episode_number", {
                              episode_number: selectedEpisode,
                            })}
                      </Text>
                    </View>
                  ) : (
                    <PlatformDropdown
                      groups={episodeOptions}
                      trigger={
                        <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
                          <Text numberOfLines={1}>
                            {selectedEpisode === 0
                              ? t("jellyseerr.all_episodes")
                              : t("jellyseerr.episode_number", {
                                  episode_number: selectedEpisode,
                                })}
                          </Text>
                        </View>
                      }
                      title={t("jellyseerr.select_episode")}
                      open={episodeDropdownOpen}
                      onOpenChange={setEpisodeDropdownOpen}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View className='flex flex-row gap-3 mt-4'>
              <Button
                className='flex-1'
                color='black'
                onPress={() =>
                  (
                    ref as React.RefObject<BottomSheetModalMethods>
                  )?.current?.close()
                }
              >
                {t("common.cancel")}
              </Button>
              <Button
                className='flex-1'
                color='purple'
                onPress={handleSubmit}
                disabled={!selectedIssueType || isSubmitting}
                loading={isSubmitting}
              >
                {t("jellyseerr.submit_report")}
              </Button>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

ReportIssueModal.displayName = "ReportIssueModal";

export default ReportIssueModal;
