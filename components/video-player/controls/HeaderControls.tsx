import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { type Dispatch, type FC, type SetStateAction } from "react";
import {
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings, VideoPlayer } from "@/utils/atoms/settings";
import { ICON_SIZES } from "./constants";
import { VideoProvider } from "./contexts/VideoContext";
import DropdownView from "./dropdown/DropdownView";
import { type ScaleFactor, ScaleFactorSelector } from "./ScaleFactorSelector";
import {
  type AspectRatio,
  AspectRatioSelector,
} from "./VideoScalingModeSelector";

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
  getAudioTracks?: (() => Promise<any[] | null>) | (() => any[]);
  getSubtitleTracks?: (() => Promise<any[] | null>) | (() => any[]);
  setAudioTrack?: (index: number) => void;
  setSubtitleTrack?: (index: number) => void;
  setSubtitleURL?: (url: string, customName: string) => void;
  aspectRatio?: AspectRatio;
  scaleFactor?: ScaleFactor;
  setAspectRatio?: Dispatch<SetStateAction<AspectRatio>>;
  setScaleFactor?: Dispatch<SetStateAction<ScaleFactor>>;
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  setVideoScaleFactor?: (scaleFactor: number) => Promise<void>;
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
  getAudioTracks,
  getSubtitleTracks,
  setAudioTrack,
  setSubtitleTrack,
  setSubtitleURL,
  aspectRatio = "default",
  scaleFactor = 1.0,
  setAspectRatio,
  setScaleFactor,
  setVideoAspectRatio,
  setVideoScaleFactor,
}) => {
  const [settings] = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const lightHapticFeedback = useHaptic("light");

  const handleAspectRatioChange = async (newRatio: AspectRatio) => {
    if (!setAspectRatio || !setVideoAspectRatio) return;

    setAspectRatio(newRatio);
    const aspectRatioString = newRatio === "default" ? null : newRatio;
    await setVideoAspectRatio(aspectRatioString);
  };

  const handleScaleFactorChange = async (newScale: ScaleFactor) => {
    if (!setScaleFactor || !setVideoScaleFactor) return;

    setScaleFactor(newScale);
    await setVideoScaleFactor(newScale);
  };

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
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
          width: settings?.safeAreaInControlsEnabled
            ? screenWidth - insets.left - insets.right
            : screenWidth,
          opacity: showControls ? 1 : 0,
        },
      ]}
      pointerEvents={showControls ? "auto" : "none"}
      className={"flex flex-row w-full pt-2"}
    >
      <View className='mr-auto'>
        {!Platform.isTV && (!offline || !mediaSource?.TranscodingUrl) && (
          <VideoProvider
            getAudioTracks={getAudioTracks}
            getSubtitleTracks={getSubtitleTracks}
            setAudioTrack={setAudioTrack}
            setSubtitleTrack={setSubtitleTrack}
            setSubtitleURL={setSubtitleURL}
          >
            <DropdownView />
          </VideoProvider>
        )}
      </View>

      <View className='flex flex-row items-center space-x-2'>
        {!Platform.isTV &&
          (settings.defaultPlayer === VideoPlayer.VLC_4 ||
            Platform.OS === "android") && (
            <TouchableOpacity
              onPress={startPictureInPicture}
              className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
            >
              <MaterialIcons
                name='picture-in-picture'
                size={ICON_SIZES.HEADER}
                color='white'
                style={{ opacity: showControls ? 1 : 0 }}
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
        <AspectRatioSelector
          currentRatio={aspectRatio}
          onRatioChange={handleAspectRatioChange}
          disabled={!setVideoAspectRatio}
        />
        <ScaleFactorSelector
          currentScale={scaleFactor}
          onScaleChange={handleScaleFactorChange}
          disabled={!setVideoScaleFactor}
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
