import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";
import { PlaybackSpeedScope } from "./video-player/controls/utils/playback-speed-settings";

export const PLAYBACK_SPEEDS = [
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "0.75x", value: 0.75 },
  { label: "1x", value: 1.0 },
  { label: "1.25x", value: 1.25 },
  { label: "1.5x", value: 1.5 },
  { label: "1.75x", value: 1.75 },
  { label: "2x", value: 2.0 },
  { label: "2.25x", value: 2.25 },
  { label: "2.5x", value: 2.5 },
  { label: "2.75x", value: 2.75 },
  { label: "3x", value: 3.0 },
];

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: number, scope: PlaybackSpeedScope) => void;
  selected: number;
  item?: BaseItemDto;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

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
  const { settings } = useSettings();
  const [internalOpen, setInternalOpen] = useState(false);

  // Determine initial scope based on existing settings
  const initialScope = useMemo<PlaybackSpeedScope>(() => {
    if (!item || !settings) return PlaybackSpeedScope.All;

    const itemId = item?.Id;
    if (!itemId) return PlaybackSpeedScope.All;

    // Check for media-specific speed preference
    if (settings?.playbackSpeedPerMedia?.[itemId] !== undefined) {
      return PlaybackSpeedScope.Media;
    }

    // Check for show-specific speed preference (only for episodes)
    const seriesId = item?.SeriesId;
    const perShowSettings = settings?.playbackSpeedPerShow;
    if (
      seriesId &&
      perShowSettings &&
      perShowSettings[seriesId] !== undefined
    ) {
      return PlaybackSpeedScope.Show;
    }

    // If no custom setting exists, check default playback speed
    // Show "All" if speed is not 1x, otherwise show "Media"
    return (settings?.defaultPlaybackSpeed ?? 1.0) !== 1.0
      ? PlaybackSpeedScope.All
      : PlaybackSpeedScope.Media;
  }, [item?.Id, item?.SeriesId, settings]);

  const [selectedScope, setSelectedScope] =
    useState<PlaybackSpeedScope>(initialScope);

  // Update selectedScope when initialScope changes
  useEffect(() => {
    setSelectedScope(initialScope);
  }, [initialScope]);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const scopeLabels = useMemo<Record<PlaybackSpeedScope, string>>(() => {
    const labels: Record<string, string> = {
      [PlaybackSpeedScope.Media]: t("playback_speed.scope.media"),
    };

    if (item?.SeriesId) {
      labels[PlaybackSpeedScope.Show] = t("playback_speed.scope.show");
    }

    labels[PlaybackSpeedScope.All] = t("playback_speed.scope.all");

    return labels as Record<PlaybackSpeedScope, string>;
  }, [item?.SeriesId, t]);

  const availableScopes = useMemo<PlaybackSpeedScope[]>(() => {
    const scopes = [PlaybackSpeedScope.Media];
    if (item?.SeriesId) {
      scopes.push(PlaybackSpeedScope.Show);
    }
    scopes.push(PlaybackSpeedScope.All);
    return scopes;
  }, [item?.SeriesId]);

  const handleSpeedSelect = useCallback(
    (speed: number) => {
      onChange(speed, selectedScope);
      setOpen(false);
    },
    [onChange, selectedScope, setOpen],
  );

  const optionGroups = useMemo<OptionGroup[]>(() => {
    const groups: OptionGroup[] = [];

    // Scope selection group
    groups.push({
      title: t("playback_speed.apply_to"),
      options: availableScopes.map((scope) => ({
        type: "radio" as const,
        label: scopeLabels[scope],
        value: scope,
        selected: selectedScope === scope,
        onPress: () => setSelectedScope(scope),
      })),
    });

    // Speed selection group
    groups.push({
      title: t("playback_speed.speed"),
      options: PLAYBACK_SPEEDS.map((speed) => ({
        type: "radio" as const,
        label: speed.label,
        value: speed.value,
        selected: selected === speed.value,
        onPress: () => handleSpeedSelect(speed.value),
      })),
    });

    return groups;
  }, [
    t,
    availableScopes,
    scopeLabels,
    selectedScope,
    selected,
    handleSpeedSelect,
  ]);

  const trigger = useMemo(
    () => (
      <View className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'>
        <Ionicons name='speedometer' size={24} color='white' />
      </View>
    ),
    [],
  );

  if (isTv) return null;

  return (
    <View className='flex shrink' style={{ minWidth: 60 }} {...props}>
      <PlatformDropdown
        title={t("playback_speed.title")}
        groups={optionGroups}
        trigger={trigger}
        open={open}
        onOpenChange={setOpen}
        bottomSheetConfig={{
          enablePanDownToClose: true,
        }}
      />
    </View>
  );
};
