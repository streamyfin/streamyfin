import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { type FC, useCallback, useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { OrientationLock } from "@/packages/expo-screen-orientation";
import { HEADER_LAYOUT, ICON_SIZES } from "./constants";
import DropdownView from "./dropdown/DropdownView";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import { type AspectRatio } from "./VideoScalingModeSelector";
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
  aspectRatio?: AspectRatio;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  // Technical info props
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
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
  aspectRatio: _aspectRatio = "default",
  isZoomedToFill = false,
  onZoomToggle,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
}) => {
  const router = useRouter();
  const insets = useControlsSafeAreaInsets();
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
          top: insets.top,
          left: insets.left,
          right: insets.right,
          padding: HEADER_LAYOUT.CONTAINER_PADDING,
        },
      ]}
      pointerEvents={showControls ? "auto" : "none"}
      className='flex flex-row justify-between'
    >
      <View className='mr-auto' pointerEvents='box-none'>
        {!Platform.isTV && (!offline || !mediaSource?.TranscodingUrl) && (
          <View pointerEvents='auto'>
            <DropdownView
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              showTechnicalInfo={showTechnicalInfo}
              onToggleTechnicalInfo={onToggleTechnicalInfo}
            />
          </View>
        )}
      </View>

      <View className='flex flex-row items-center space-x-2'>
        {/* Rotate toggle is Android-only: iOS does not reliably rotate the
            player back to portrait programmatically. */}
        {Platform.OS === "android" && (
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
        {!Platform.isTV && startPictureInPicture && (
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
        {/* MPV Zoom Toggle */}
        <ZoomToggle
          isZoomedToFill={isZoomedToFill}
          onToggle={onZoomToggle ?? (() => {})}
          disabled={!onZoomToggle}
        />
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
