import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import type { FC } from "react";
import {
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings } from "@/utils/atoms/settings";
import { ICON_SIZES } from "./constants";
import DropdownView from "./dropdown/DropdownView";
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
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
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
  setVideoAspectRatio: _setVideoAspectRatio,
  isZoomedToFill = false,
  onZoomToggle,
}) => {
  const { settings } = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: _screenWidth } = useWindowDimensions();
  const lightHapticFeedback = useHaptic("light");

  const onClose = async () => {
    lightHapticFeedback();
    router.back();
  };

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
        {/*<AspectRatioSelector
          currentRatio={aspectRatio}
          onRatioChange={async (newRatio) => {
            if (setVideoAspectRatio) {
              const aspectRatioString = newRatio === "default" ? null : newRatio;
              await setVideoAspectRatio(aspectRatioString);
            }
          }}
          disabled={!setVideoAspectRatio}
        />*/}
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
