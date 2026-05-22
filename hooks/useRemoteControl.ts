/**
 * Dispatches Jellyfin remote-control WebSocket messages to the active
 * PlaybackController. DisplayMessage is shown as an in-app toast and needs no
 * controller.
 */

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { toast } from "sonner-native";
import { activePlaybackControllerAtom } from "@/utils/playback/playbackController";
import {
  mapRemoteCommand,
  type RemoteWsMessage,
} from "@/utils/playback/remoteCommands";

/** Handle one remote-control message (call it whenever a new WS message arrives). */
export const useRemoteControl = (lastMessage: RemoteWsMessage | null): void => {
  const controller = useAtomValue(activePlaybackControllerAtom);

  useEffect(() => {
    if (!lastMessage) return;
    const action = mapRemoteCommand(lastMessage);
    if (!action) return;

    if (action.kind === "displayMessage") {
      toast(action.text);
      return;
    }

    if (!controller) return;

    switch (action.kind) {
      case "playPause":
        controller.playPause();
        break;
      case "pause":
        controller.pause();
        break;
      case "unpause":
        controller.unpause();
        break;
      case "stop":
        controller.stop();
        break;
      case "seek":
        controller.seek(action.positionMs);
        break;
      case "next":
        controller.next();
        break;
      case "previous":
        controller.previous();
        break;
      case "setVolume":
        controller.setVolume(action.level);
        break;
      case "toggleMute":
        controller.toggleMute();
        break;
    }
  }, [lastMessage, controller]);
};
