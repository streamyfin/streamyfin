import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TrackInfo } from "@/modules/VlcPlayer.types";
import { useSettings, VideoPlayer } from "@/utils/atoms/settings";
import { VideoProvider } from "../contexts/VideoContext";
import DropdownView from "../dropdown/DropdownView";
import { type ScaleFactor, ScaleFactorSelector } from "../ScaleFactorSelector";
import {
  type AspectRatio,
  AspectRatioSelector,
} from "../VideoScalingModeSelector";

interface TopControlsBarProps {
  item: BaseItemDto;
  mediaSource?: MediaSourceInfo | null;
  offline: boolean;
  showControls: boolean;
  aspectRatio: AspectRatio;
  scaleFactor: ScaleFactor;
  previousItem?: BaseItemDto;
  nextItem?: BaseItemDto;
  animatedControlsStyle: any;
  screenWidth: number;
  getAudioTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  getSubtitleTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  setSubtitleURL?: (url: string, customName: string) => void;
  setSubtitleTrack?: (index: number) => void;
  setAudioTrack?: (index: number) => void;
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  setVideoScaleFactor?: (scaleFactor: number) => Promise<void>;
  startPictureInPicture?: () => Promise<void>;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onScaleFactorChange: (scale: ScaleFactor) => void;
  onEpisodeModeToggle: () => void;
  onGoToPreviousItem: () => void;
  onGoToNextItem: () => void;
  onClose: () => void;
}

export const TopControlsBar: React.FC<TopControlsBarProps> = ({
  item,
  mediaSource,
  offline,
  showControls,
  aspectRatio,
  scaleFactor,
  previousItem,
  nextItem,
  animatedControlsStyle,
  screenWidth,
  getAudioTracks,
  getSubtitleTracks,
  setSubtitleURL,
  setSubtitleTrack,
  setAudioTrack,
  setVideoAspectRatio,
  setVideoScaleFactor,
  startPictureInPicture,
  onAspectRatioChange,
  onScaleFactorChange,
  onEpisodeModeToggle,
  onGoToPreviousItem,
  onGoToNextItem,
  onClose,
}) => {
  const [settings] = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: settings?.safeAreaInControlsEnabled ? insets.top : 0,
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
          width: settings?.safeAreaInControlsEnabled
            ? screenWidth - insets.left - insets.right
            : screenWidth,
        },
        animatedControlsStyle,
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

      <View className='flex flex-row items-center space-x-2 '>
        {!Platform.isTV &&
          (settings.defaultPlayer === VideoPlayer.VLC_4 ||
            Platform.OS === "android") && (
            <TouchableOpacity
              onPress={startPictureInPicture}
              className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
            >
              <MaterialIcons
                name='picture-in-picture'
                size={24}
                color='white'
                style={{ opacity: showControls ? 1 : 0 }}
              />
            </TouchableOpacity>
          )}
        {item?.Type === "Episode" && (
          <TouchableOpacity
            onPress={onEpisodeModeToggle}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons name='list' size={24} color='white' />
          </TouchableOpacity>
        )}
        {previousItem && (
          <TouchableOpacity
            onPress={onGoToPreviousItem}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons name='play-skip-back' size={24} color='white' />
          </TouchableOpacity>
        )}
        {nextItem && (
          <TouchableOpacity
            onPress={onGoToNextItem}
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
          >
            <Ionicons name='play-skip-forward' size={24} color='white' />
          </TouchableOpacity>
        )}
        {/* Video Controls */}
        <AspectRatioSelector
          currentRatio={aspectRatio}
          onRatioChange={onAspectRatioChange}
          disabled={!setVideoAspectRatio}
        />
        <ScaleFactorSelector
          currentScale={scaleFactor}
          onScaleChange={onScaleFactorChange}
          disabled={!setVideoScaleFactor}
        />
        <TouchableOpacity
          onPress={onClose}
          className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
        >
          <Ionicons name='close' size={24} color='white' />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};
