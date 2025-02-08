import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect } from "react";
import { Platform, TouchableOpacity, ViewProps } from "react-native";
import GoogleCast, {
  CastButton,
  CastContext,
  useCastDevice,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  width?: number;
  height?: number;
  background?: "blur" | "transparent";
}

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

  useEffect(() => {
    (async () => {
      if (!discoveryManager) {
        console.warn("DiscoveryManager is not initialized");
        return;
      }

      await discoveryManager.startDiscovery();
    })();
  }, [client, devices, castDevice, sessionManager, discoveryManager]);

  // Android requires the cast button to be present for startDiscovery to work
  const AndroidCastButton = useCallback(
    () =>
      Platform.OS === "android" ? (
        <CastButton tintColor="transparent" />
      ) : (
        <></>
      ),
    [Platform.OS]
  );

  if (background === "transparent")
    return (
      <RoundButton
        size="large"
        className="mr-2"
        background={false}
        onPress={() => {
          if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
          else CastContext.showCastDialog();
        }}
        {...props}
      >
        <AndroidCastButton />
        <Feather name="cast" size={22} color={"white"} />
      </RoundButton>
    );

  return (
    <RoundButton
      size="large"
      onPress={() => {
        if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
        else CastContext.showCastDialog();
      }}
      {...props}
    >
      <AndroidCastButton />
      <Feather name="cast" size={22} color={"white"} />
    </RoundButton>
  );
}
