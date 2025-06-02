import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

interface UseWebSocketProps {
  isPlaying: boolean;
  togglePlay: () => void;
  stopPlayback: () => void;
  offline: boolean;

  nextTrack?: () => void;
  previousTrack?: () => void;
  rewindPlayback?: () => void;
  fastForwardPlayback?: () => void;
  seekPlayback?: (positionTicks: number) => void;
  volumeUp?: () => void;
  volumeDown?: () => void;
  toggleMute?: () => void;
  toggleOsd?: () => void;
  toggleFullscreen?: () => void;
  goHome?: () => void;
  goToSettings?: () => void;
  setAudioStreamIndex?: (index: number) => void;
  setSubtitleStreamIndex?: (index: number) => void;

  moveUp?: () => void;
  moveDown?: () => void;
  moveLeft?: () => void;
  moveRight?: () => void;
  select?: () => void;
  pageUp?: () => void;
  pageDown?: () => void;
  setVolume?: (volume: number) => void;
  setRepeatMode?: (mode: string) => void;
  setShuffleMode?: (mode: string) => void;
  togglePictureInPicture?: () => void;
  takeScreenshot?: () => void;
  sendString?: (text: string) => void;
  sendKey?: (key: string) => void;
  playMediaSource?: (itemIds: string[], startPositionTicks?: number) => void;
  playTrailers?: (itemId: string) => void;
}

export const useWebSocket = ({
  isPlaying,
  togglePlay,
  stopPlayback,
  offline,
  nextTrack,
  previousTrack,
  rewindPlayback,
  fastForwardPlayback,
  seekPlayback,
  volumeUp,
  volumeDown,
  toggleMute,
  toggleOsd,
  toggleFullscreen,
  goHome,
  goToSettings,
  setAudioStreamIndex,
  setSubtitleStreamIndex,
  moveUp,
  moveDown,
  moveLeft,
  moveRight,
  select,
  pageUp,
  pageDown,
  setVolume,
  setRepeatMode,
  setShuffleMode,
  togglePictureInPicture,
  takeScreenshot,
  sendString,
  sendKey,
  playMediaSource,
  playTrailers,
}: UseWebSocketProps) => {
  const router = useRouter();
  const { lastMessage } = useWebSocketContext();
  const { t } = useTranslation();
  const { clearLastMessage } = useWebSocketContext();

  useEffect(() => {
    if (!lastMessage) return;
    if (offline) return;

    const messageType = lastMessage.MessageType;
    const command: string | undefined =
      lastMessage?.Data?.Command || lastMessage?.Data?.Name;

    const args = lastMessage?.Data?.Arguments as
      | Record<string, string>
      | undefined; // Arguments are Dictionary<string, string>

    console.log("[WS] ~ ", lastMessage);

    if (command === "PlayPause") {
      console.log("Command ~ PlayPause");
      togglePlay();
    } else if (command === "Stop") {
      console.log("Command ~ Stop");
      stopPlayback();
      router.canGoBack() && router.back();
    } else if (command === "Pause") {
      console.log("Command ~ Pause");
      if (isPlaying) {
        togglePlay();
      }
    } else if (command === "Unpause") {
      console.log("Command ~ Unpause");
      if (!isPlaying) {
        togglePlay();
      }
    } else if (command === "NextTrack") {
      console.log("Command ~ NextTrack");
      nextTrack?.();
    } else if (command === "PreviousTrack") {
      console.log("Command ~ PreviousTrack");
      previousTrack?.();
    } else if (command === "Rewind") {
      console.log("Command ~ Rewind");
      rewindPlayback?.();
    } else if (command === "FastForward") {
      console.log("Command ~ FastForward");
      fastForwardPlayback?.();
    } else if (command === "Seek") {
      const positionStr = args?.SeekPositionTicks;
      console.log("Command ~ Seek", { positionStr });
      if (positionStr) {
        const position = Number.parseInt(positionStr, 10);
        if (!Number.isNaN(position)) {
          seekPlayback?.(position);
        }
      }
    } else if (command === "Back") {
      console.log("Command ~ Back");
      if (router.canGoBack()) {
        router.back();
      }
    } else if (command === "GoHome") {
      console.log("Command ~ GoHome");
      goHome ? goHome() : router.push("/");
    } else if (command === "GoToSettings") {
      console.log("Command ~ GoToSettings");
      goToSettings ? goToSettings() : router.push("/settings");
    } else if (command === "VolumeUp") {
      console.log("Command ~ VolumeUp");
      volumeUp?.();
    } else if (command === "VolumeDown") {
      console.log("Command ~ VolumeDown");
      volumeDown?.();
    } else if (command === "ToggleMute") {
      console.log("Command ~ ToggleMute");

      toggleMute?.();
    } else if (command === "ToggleOsd") {
      console.log("Command ~ ToggleOsd");
      toggleOsd?.();
    } else if (command === "ToggleFullscreen") {
      console.log("Command ~ ToggleFullscreen");
      toggleFullscreen?.();
    } else if (command === "SetAudioStreamIndex") {
      const indexStr = args?.Index;
      console.log("Command ~ SetAudioStreamIndex", { indexStr });
      if (indexStr) {
        const index = Number.parseInt(indexStr, 10);
        if (!Number.isNaN(index)) {
          setAudioStreamIndex?.(index);
        }
      }
    } else if (command === "SetSubtitleStreamIndex") {
      const indexStr = args?.Index;
      console.log("Command ~ SetSubtitleStreamIndex", { indexStr });
      if (indexStr) {
        const index = Number.parseInt(indexStr, 10);
        if (!Number.isNaN(index)) {
          setSubtitleStreamIndex?.(index);
        }
      }
    }
    // Neue Befehle hier implementieren
    else if (command === "MoveUp") {
      console.log("Command ~ MoveUp");
      moveUp?.();
    } else if (command === "MoveDown") {
      console.log("Command ~ MoveDown");
      moveDown?.();
    } else if (command === "MoveLeft") {
      console.log("Command ~ MoveLeft");
      moveLeft?.();
    } else if (command === "MoveRight") {
      console.log("Command ~ MoveRight");
      moveRight?.();
    } else if (command === "Select") {
      console.log("Command ~ Select");
      select?.();
    } else if (command === "PageUp") {
      console.log("Command ~ PageUp");
      pageUp?.();
    } else if (command === "PageDown") {
      console.log("Command ~ PageDown");
      pageDown?.();
    } else if (command === "SetVolume") {
      const volumeStr = args?.Volume;
      console.log("Command ~ SetVolume", { volumeStr });
      if (volumeStr) {
        const volumeValue = Number.parseInt(volumeStr, 10);
        if (!Number.isNaN(volumeValue)) {
          setVolume?.(volumeValue);
        }
      }
    } else if (command === "SetRepeatMode") {
      const mode = args?.Mode;
      console.log("Command ~ SetRepeatMode", { mode });
      if (mode) {
        setRepeatMode?.(mode);
      }
    } else if (command === "SetShuffleMode") {
      const mode = args?.Mode;
      console.log("Command ~ SetShuffleMode", { mode });
      if (mode) {
        setShuffleMode?.(mode);
      }
    } else if (command === "TogglePictureInPicture") {
      console.log("Command ~ TogglePictureInPicture");
      togglePictureInPicture?.();
    } else if (command === "TakeScreenshot") {
      console.log("Command ~ TakeScreenshot");
      takeScreenshot?.();
    } else if (command === "SendString") {
      const text = args?.Text;
      console.log("Command ~ SendString", { text });
      if (text) {
        sendString?.(text);
      }
    } else if (command === "SendKey") {
      const key = args?.Key;
      console.log("Command ~ SendKey", { key });
      if (key) {
        sendKey?.(key);
      }
    } else if (command === "PlayMediaSource") {
      const itemIdsStr = args?.ItemIds;
      const startPositionTicksStr = args?.StartPositionTicks;
      console.log("Command ~ PlayMediaSource", {
        itemIdsStr,
        startPositionTicksStr,
      });
      if (itemIdsStr) {
        const itemIds = itemIdsStr.split(",");
        let startPositionTicks: number | undefined = undefined;
        if (startPositionTicksStr) {
          const parsedTicks = Number.parseInt(startPositionTicksStr, 10);
          if (!Number.isNaN(parsedTicks)) {
            startPositionTicks = parsedTicks;
          }
        }
        playMediaSource?.(itemIds, startPositionTicks);
      }
    } else if (command === "PlayTrailers") {
      const itemId = args?.ItemId;
      console.log("Command ~ PlayTrailers", { itemId });
      if (itemId) {
        playTrailers?.(itemId);
      }
    } else if (command === "DisplayMessage") {
      console.log("Command ~ DisplayMessage");
      const title = args?.Header;
      const body = args?.Text;
      Alert.alert(t("player.message_from_server", { message: title }), body);
    }
    clearLastMessage();
  }, [
    lastMessage,
    offline,
    isPlaying,
    togglePlay,
    stopPlayback,
    router,
    nextTrack,
    previousTrack,
    rewindPlayback,
    fastForwardPlayback,
    seekPlayback,
    volumeUp,
    volumeDown,
    toggleMute,
    toggleOsd,
    toggleFullscreen,
    goHome,
    goToSettings,
    setAudioStreamIndex,
    setSubtitleStreamIndex,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    select,
    pageUp,
    pageDown,
    setVolume,
    setRepeatMode,
    setShuffleMode,
    togglePictureInPicture,
    takeScreenshot,
    sendString,
    sendKey,
    playMediaSource,
    playTrailers,
    t,
    clearLastMessage,
  ]);
};
