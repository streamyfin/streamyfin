import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { type FC, useCallback, useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlaybackSpeedSelector } from "@/components/PlaybackSpeedSelector";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { OrientationLock } from "@/packages/expo-screen-orientation";
import { useSettings, VideoPlayerIOS } from "@/utils/atoms/settings";
import { ICON_SIZES } from "./constants";
import DropdownView from "./dropdown/DropdownView";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import {
  type AspectRatio,
  AspectRatioSelector,
} from "./VideoScalingModeSelector";
import { type ScaleFactor, VlcZoomControl } from "./VlcZoomControl";
import { ZoomToggle } from "./ZoomToggle";

interface HeaderControlsProps {
  item: BaseItemDto;
  showControls: boolean;
  offline: boolean;
  mediaSource?: MediaSourceInfo | null;
  startPictureInPicture?: () => Promise<void>;
  switchOnEpisodeMode: () => void;
  goToPreviousItem: () => void;
  goToNextItem: (options: { isAutoPlay?: boolean }) => void;
  previousItem?: BaseItemDto | null;
  nextItem?: BaseItemDto | null;
  useVlcPlayer?: boolean;
  // VLC-specific props
  aspectRatio?: AspectRatio;
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  scaleFactor?: ScaleFactor;
  setVideoScaleFactor?: (scaleFactor: number) => Promise<void>;
  // KSPlayer-specific props
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
}

export const HeaderControls: FC<HeaderControlsProps> = ({
  item,
  showControls,
  offline,
  mediaSource,
  startPictureInPicture,
  switchOnEpisodeMode,
  goToPreviousItem,
  goToNextItem,
  previousItem,
  nextItem,
  useVlcPlayer = false,
  aspectRatio = "default",
  setVideoAspectRatio,
  scaleFactor = 0,
  setVideoScaleFactor,
  isZoomedToFill = false,
  onZoomToggle,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
}) => {
  const { settings } = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lightHapticFeedback = useHaptic("light");
  const { orientation, lockOrientation } = useOrientation();
  const [isTogglingOrientation, setIsTogglingOrientation] = useState(false);

  const onClose = async () => {
    lightHapticFeedback();
    router.back();
  };

  const toggleOrientation = useCallback(async () => {
    if (isTogglingOrientation) return;

    setIsTogglingOrientation(true);
    lightHapticFeedback();

    try {
      const isPortrait =
        orientation === OrientationLock.PORTRAIT_UP ||
        orientation === OrientationLock.PORTRAIT_DOWN;

      await lockOrientation(
        isPortrait ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP,
      );
    } finally {
      setIsTogglingOrientation(false);
    }
  }, [
    orientation,
    lockOrientation,
    isTogglingOrientation,
    lightHapticFeedback,
  ]);

  return (
    <View
      style={[
        {
          position: "absolute",
          top: settings?.safeAreaInControlsEnabled ? insets.top : 0,
          left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
        },
      ]}
      pointerEvents={showControls ? "auto" : "none"}
      className='flex flex-row justify-between'
    >
      <View className='mr-auto p-2' pointerEvents='box-none'>
        {!Platform.isTV && (!offline || !mediaSource?.TranscodingUrl) && (
          <View pointerEvents='auto'>
            <DropdownView />
          </View>
        )}
      </View>

      <View className='flex flex-row items-center space-x-2'>
        {!Platform.isTV && (
          <TouchableOpacity
            onPress={toggleOrientation}
            disabled={isTogglingOrientation}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
            accessibilityLabel='Toggle screen orientation'
            accessibilityHint='Toggles the screen orientation between portrait and landscape'
          >
            <MaterialIcons
              name='screen-rotation'
              size={ICON_SIZES.HEADER}
              color='white'
              style={{ opacity: isTogglingOrientation ? 0.5 : 1 }}
            />
          </TouchableOpacity>
        )}
        {!Platform.isTV &&
          startPictureInPicture &&
          settings?.videoPlayerIOS !== VideoPlayerIOS.VLC && (
            <TouchableOpacity
              onPress={startPictureInPicture}
              className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
            >
              <MaterialIcons
                name='picture-in-picture'
                size={ICON_SIZES.HEADER}
                color='white'
              />
            </TouchableOpacity>
          )}
        {item?.Type === "Episode" && (
          <TouchableOpacity
            onPress={switchOnEpisodeMode}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons name='list' size={ICON_SIZES.HEADER} color='white' />
          </TouchableOpacity>
        )}
        {previousItem && (
          <TouchableOpacity
            onPress={goToPreviousItem}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons
              name='play-skip-back'
              size={ICON_SIZES.HEADER}
              color='white'
            />
          </TouchableOpacity>
        )}
        {nextItem && (
          <TouchableOpacity
            onPress={() => goToNextItem({ isAutoPlay: false })}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons
              name='play-skip-forward'
              size={ICON_SIZES.HEADER}
              color='white'
            />
          </TouchableOpacity>
        )}
        {/* Playback Speed Control */}
        {!Platform.isTV && setPlaybackSpeed && (
          <PlaybackSpeedSelector
            selected={playbackSpeed}
            onChange={setPlaybackSpeed}
            item={item}
          />
        )}
        {/* VLC-specific controls: Aspect Ratio and Scale/Zoom */}
        {useVlcPlayer && (
          <AspectRatioSelector
            currentRatio={aspectRatio}
            onRatioChange={async (newRatio) => {
              if (setVideoAspectRatio) {
                const aspectRatioString =
                  newRatio === "default" ? null : newRatio;
                await setVideoAspectRatio(aspectRatioString);
              }
            }}
            disabled={!setVideoAspectRatio}
          />
        )}
        {useVlcPlayer && (
          <VlcZoomControl
            currentScale={scaleFactor}
            onScaleChange={async (newScale) => {
              if (setVideoScaleFactor) {
                await setVideoScaleFactor(newScale);
              }
            }}
            disabled={!setVideoScaleFactor}
          />
        )}
        {/* KSPlayer-specific control: Zoom to Fill */}
        {!useVlcPlayer && (
          <ZoomToggle
            isZoomedToFill={isZoomedToFill}
            onToggle={onZoomToggle ?? (() => {})}
            disabled={!onZoomToggle}
          />
        )}
        <TouchableOpacity
          onPress={onClose}
          className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        >
          <Ionicons name='close' size={ICON_SIZES.HEADER} color='white' />
        </TouchableOpacity>
      </View>
    </View>
  );
};
