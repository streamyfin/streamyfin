import React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/Button";
import { Feather } from "@expo/vector-icons";
import { RoundButton } from "@/components/RoundButton";

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
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useHaptic } from "@/hooks/useHaptic";
import ChromecastControls from "@/components/ChromecastControls";

export default function Player() {
  const castState = useCastState();

  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const devices = useDevices();
  const sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();

  const router = useRouter();

  const lightHapticFeedback = useHaptic("light");

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

  const GoHomeButton = () => (
    <Button
      onPress={() => {
        router.push("/(auth)/(home)/");
      }}
    >
      Go Home
    </Button>
  );

  if (
    castState === CastState.NO_DEVICES_AVAILABLE ||
    castState === CastState.NOT_CONNECTED
  ) {
    // no devices to connect to
    if (devices.length === 0) {
      return (
        <View className="w-screen h-screen flex flex-col ">
          <AndroidCastButton />
          <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
            <Text className="text-white text-lg">
              No Google Cast devices available.
            </Text>
            <Text className="text-gray-400">Are you on the same network?</Text>
          </View>
          <View className="px-10">
            <GoHomeButton />
          </View>
        </View>
      );
    }
    // no device selected
    return (
      <View className="w-screen h-screen flex flex-col ">
        <AndroidCastButton />
        <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
          <RoundButton
            size="large"
            background={false}
            onPress={() => {
              lightHapticFeedback();
              CastContext.showCastDialog();
            }}
          >
            <AndroidCastButton />
            <Feather name="cast" size={42} color={"white"} />
          </RoundButton>
          <Text className="text-white text-xl mt-2">No device selected</Text>
          <Text className="text-gray-400">Click icon to connect.</Text>
        </View>
        <View className="px-10">
          <GoHomeButton />
        </View>
      </View>
    );
  }

  if (castState === CastState.CONNECTING) {
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Text className="text-white font-semibold lg mb-2">
          Establishing connection...
        </Text>
        <Loader />
      </View>
    );
  }

  // connected, but no media playing
  if (!mediaStatus) {
    return (
      <View className="w-screen h-screen flex flex-col ">
        <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
          <Text className="text-white text-lg">No media selected.</Text>
          <Text className="text-gray-400">Start playing any media</Text>
        </View>
        <View className="px-10">
          <GoHomeButton />
        </View>
      </View>
    );
  }

  return <ChromecastControls mediaStatus={mediaStatus} client={client} />;
}