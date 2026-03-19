import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import GoogleCast, {
  CastButton,
  CastChannel,
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
  // Hooks called for their side effects (keep Chromecast session active)
  useRemoteMediaClient();
  useCastDevice();
  const castState = useCastState();
  useDevices();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const _sessionManager = GoogleCast.getSessionManager();
  // Connection menu state
  const [showConnectionMenu, setShowConnectionMenu] = useState(false);
  const isConnected = castState === CastState.CONNECTED;

  const discoveryAttempts = useRef(0);
  const maxDiscoveryAttempts = 3;

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
        } catch {
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

  const credentialsSentRef = useRef(false);

  useEffect(() => {
    const subscription = GoogleCast.getSessionManager().onSessionStarted(
      async () => {
        if (!api?.basePath || !api?.accessToken || !user?.Id) return;
        if (credentialsSentRef.current) return;

        credentialsSentRef.current = true;
        try {
          const channel = await CastChannel.add("urn:x-cast:streamyfin");
          channel.sendMessage({
            serverUrl: api.basePath,
            accessToken: api.accessToken,
            userId: user.Id,
          });
          await channel.remove();
        } catch (error) {
          console.error("[Chromecast] Failed to send credentials:", error);
          credentialsSentRef.current = false;
        }
      },
    );

    return () => subscription.remove?.();
  }, [api, user]);

  useEffect(() => {
    if (!isConnected) {
      credentialsSentRef.current = false;
    }
  }, [isConnected]);

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
      if (!api?.basePath || !api?.accessToken || !user?.Id) return;
      // Not connected - show cast dialog
      CastContext.showCastDialog();
    }
  }, [isConnected, mediaStatus?.currentItemId, api, user]);

  // Handle disconnect from Chromecast
  const handleDisconnect = useCallback(async () => {
    try {
      const sessionManager = GoogleCast.getSessionManager();
      await sessionManager.endCurrentSession(true);
      console.log("[Chromecast] Disconnected from Chromecast");
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
