import { Feather } from "@expo/vector-icons";
import type { PlaybackProgressInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import GoogleCast, {
  CastButton,
  CastContext,
  CastState,
  useCastDevice,
  useCastState,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { ChromecastConnectionMenu } from "./chromecast/ChromecastConnectionMenu";
import { RoundButton } from "./RoundButton";

export function Chromecast({
  width = 48,
  height = 48,
  background = "transparent",
  ...props
}) {
  const _client = useRemoteMediaClient();
  const _castDevice = useCastDevice();
  const castState = useCastState();
  const devices = useDevices();
  const _sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Connection menu state
  const [showConnectionMenu, setShowConnectionMenu] = useState(false);
  const isConnected = castState === CastState.CONNECTED;

  const lastReportedProgressRef = useRef(0);
  const playSessionIdRef = useRef<string | null>(null);
  const lastContentIdRef = useRef<string | null>(null);
  const discoveryAttempts = useRef(0);
  const maxDiscoveryAttempts = 3;
  const hasLoggedDevices = useRef(false);

  // Enhanced discovery with retry mechanism - runs once on mount
  useEffect(() => {
    let isSubscribed = true;
    let retryTimeout: NodeJS.Timeout;

    const startDiscoveryWithRetry = async () => {
      if (!discoveryManager) {
        return;
      }

      try {
        // Stop any existing discovery first
        try {
          await discoveryManager.stopDiscovery();
        } catch (_e) {
          // Ignore errors when stopping
        }

        // Start fresh discovery
        await discoveryManager.startDiscovery();
        discoveryAttempts.current = 0; // Reset on success
      } catch (error) {
        console.error("[Chromecast Discovery] Failed:", error);

        // Retry on error
        if (discoveryAttempts.current < maxDiscoveryAttempts && isSubscribed) {
          discoveryAttempts.current++;
          retryTimeout = setTimeout(() => {
            if (isSubscribed) {
              startDiscoveryWithRetry();
            }
          }, 2000);
        }
      }
    };

    startDiscoveryWithRetry();

    return () => {
      isSubscribed = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [discoveryManager]); // Only re-run if discoveryManager changes

  // Log device changes for debugging - only once per session
  useEffect(() => {
    if (devices.length > 0 && !hasLoggedDevices.current) {
      console.log(
        "[Chromecast] Found device(s):",
        devices.map((d) => d.friendlyName || d.deviceId).join(", "),
      );
      hasLoggedDevices.current = true;
    }
  }, [devices]);

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

    // Generate a new PlaySessionId when the content changes
    if (contentId !== lastContentIdRef.current) {
      playSessionIdRef.current = `${contentId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      lastContentIdRef.current = contentId;
    }

    const positionTicks = Math.floor(streamPosition * 10000000);
    const isPaused = mediaStatus.playerState === "paused";
    const streamUrl = mediaStatus.mediaInfo.contentUrl || "";
    const isTranscoding = streamUrl.includes("m3u8");

    const progressInfo: PlaybackProgressInfo = {
      ItemId: contentId,
      PositionTicks: positionTicks,
      IsPaused: isPaused,
      PlayMethod: isTranscoding ? "Transcode" : "DirectStream",
      PlaySessionId: playSessionIdRef.current || contentId,
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

  // Handle press - show connection menu when connected, otherwise show cast dialog
  const handlePress = useCallback(() => {
    if (isConnected) {
      if (mediaStatus?.currentItemId) {
        // Media is playing - navigate to full player
        router.push("/casting-player");
      } else {
        // Connected but no media - show connection menu
        setShowConnectionMenu(true);
      }
    } else {
      // Not connected - show cast dialog
      CastContext.showCastDialog();
    }
  }, [isConnected, mediaStatus?.currentItemId]);

  // Handle disconnect from Chromecast
  const handleDisconnect = useCallback(async () => {
    try {
      const sessionManager = GoogleCast.getSessionManager();
      await sessionManager.endCurrentSession(true);
    } catch (error) {
      console.error("[Chromecast] Disconnect error:", error);
    }
  }, []);

  if (Platform.OS === "ios") {
    return (
      <>
        <Pressable className='mr-4' onPress={handlePress} {...props}>
          <AndroidCastButton />
          <Feather
            name='cast'
            size={22}
            color={isConnected ? "#a855f7" : "white"}
          />
        </Pressable>
        <ChromecastConnectionMenu
          visible={showConnectionMenu}
          onClose={() => setShowConnectionMenu(false)}
          onDisconnect={handleDisconnect}
        />
      </>
    );
  }

  if (background === "transparent")
    return (
      <>
        <RoundButton
          size='large'
          className='mr-2'
          background={false}
          onPress={handlePress}
          {...props}
        >
          <AndroidCastButton />
          <Feather
            name='cast'
            size={22}
            color={isConnected ? "#a855f7" : "white"}
          />
        </RoundButton>
        <ChromecastConnectionMenu
          visible={showConnectionMenu}
          onClose={() => setShowConnectionMenu(false)}
          onDisconnect={handleDisconnect}
        />
      </>
    );

  return (
    <>
      <RoundButton size='large' onPress={handlePress} {...props}>
        <AndroidCastButton />
        <Feather
          name='cast'
          size={22}
          color={isConnected ? "#a855f7" : "white"}
        />
      </RoundButton>
      <ChromecastConnectionMenu
        visible={showConnectionMenu}
        onClose={() => setShowConnectionMenu(false)}
        onDisconnect={handleDisconnect}
      />
    </>
  );
}
