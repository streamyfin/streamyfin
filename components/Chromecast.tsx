import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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

interface Props extends ViewProps {
  width?: number;
  height?: number;
  background?: "blur" | "transparent";
}

export const Chromecast: React.FC<Props> = ({
  width = 48,
  height = 48,
  background = "transparent",
  ...props
}) => {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const devices = useDevices();
  const sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();

  useEffect(() => {
    (async () => {
      if (!discoveryManager) {
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
      <>
        <TouchableOpacity
          onPress={() => {
            if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
            else CastContext.showCastDialog();
          }}
          className="rounded-full h-10 w-10 flex items-center justify-center b"
          {...props}
        >
          <Feather name="cast" size={22} color={"white"} />
        </TouchableOpacity>
        <AndroidCastButton />
      </>
    );

  if (Platform.OS === "android")
    return (
      <TouchableOpacity
        onPress={() => {
          if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
          else CastContext.showCastDialog();
        }}
        className="rounded-full h-10 w-10 flex items-center justify-center bg-neutral-800/80"
        {...props}
      >
        <Feather name="cast" size={22} color={"white"} />
      </TouchableOpacity>
    );

  return (
    <TouchableOpacity
      onPress={() => {
        if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
        else CastContext.showCastDialog();
      }}
      {...props}
    >
      <BlurView
        intensity={100}
        className="rounded-full overflow-hidden h-10 aspect-square flex items-center justify-center"
        {...props}
      >
        <Feather name="cast" size={22} color={"white"} />
      </BlurView>
      <AndroidCastButton />
    </TouchableOpacity>
  );
};
