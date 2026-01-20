import { Feather } from "@expo/vector-icons";
import type { PlaybackProgressInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import GoogleCast, {
  CastButton,
  CastContext,
  useCastDevice,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { RoundButton } from "./RoundButton";

export function Chromecast({
  width = 48,
  height = 48,
  background = "transparent",
  ...props
}) {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const devices = useDevices();
  const sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const lastReportedProgressRef = useRef(0);

  useEffect(() => {
    (async () => {
      if (!discoveryManager) {
        console.warn("DiscoveryManager is not initialized");
        return;
      }

      await discoveryManager.startDiscovery();
    })();
  }, [client, devices, castDevice, sessionManager, discoveryManager]);

  // Report video progress to Jellyfin server
  useEffect(() => {
    if (
      !api ||
      !user?.Id ||
      !mediaStatus ||
      !mediaStatus.mediaInfo?.contentId
    ) {
      return;
    }

    const streamPosition = mediaStatus.streamPosition || 0;

    // Report every 10 seconds
    if (Math.abs(streamPosition - lastReportedProgressRef.current) < 10) {
      return;
    }

    const contentId = mediaStatus.mediaInfo.contentId;
    const positionTicks = Math.floor(streamPosition * 10000000);
    const isPaused = mediaStatus.playerState === "paused";
    const streamUrl = mediaStatus.mediaInfo.contentUrl || "";
    const isTranscoding = streamUrl.includes("m3u8");

    const progressInfo: PlaybackProgressInfo = {
      ItemId: contentId,
      PositionTicks: positionTicks,
      IsPaused: isPaused,
      PlayMethod: isTranscoding ? "Transcode" : "DirectStream",
      PlaySessionId: contentId,
    };

    getPlaystateApi(api)
      .reportPlaybackProgress({ playbackProgressInfo: progressInfo })
      .then(() => {
        lastReportedProgressRef.current = streamPosition;
      })
      .catch((error) => {
        console.error("Failed to report Chromecast progress:", error);
      });
  }, [
    api,
    user?.Id,
    mediaStatus?.streamPosition,
    mediaStatus?.mediaInfo?.contentId,
  ]);

  // Android requires the cast button to be present for startDiscovery to work
  const AndroidCastButton = useCallback(
    () =>
      Platform.OS === "android" ? <CastButton tintColor='transparent' /> : null,
    [Platform.OS],
  );

  if (Platform.OS === "ios") {
    return (
      <Pressable
        className='mr-4'
        onPress={() => {
          if (mediaStatus?.currentItemId) router.push("/casting-player");
          else CastContext.showCastDialog();
        }}
        {...props}
      >
        <AndroidCastButton />
        <Feather name='cast' size={22} color={"white"} />
      </Pressable>
    );
  }

  if (background === "transparent")
    return (
      <RoundButton
        size='large'
        className='mr-2'
        background={false}
        onPress={() => {
          if (mediaStatus?.currentItemId) router.push("/casting-player");
          else CastContext.showCastDialog();
        }}
        {...props}
      >
        <AndroidCastButton />
        <Feather name='cast' size={22} color={"white"} />
      </RoundButton>
    );

  return (
    <RoundButton
      size='large'
      onPress={() => {
        if (mediaStatus?.currentItemId) router.push("/casting-player");
        else CastContext.showCastDialog();
      }}
      {...props}
    >
      <AndroidCastButton />
      <Feather name='cast' size={22} color={"white"} />
    </RoundButton>
  );
}
