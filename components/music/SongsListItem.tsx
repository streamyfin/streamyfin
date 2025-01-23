import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { TouchableOpacity, TouchableOpacityProps, View } from "react-native";
import CastContext, {
  PlayServicesState,
  useCastDevice,
  useRemoteMediaClient,
} from "react-native-google-cast";

interface Props extends TouchableOpacityProps {
  collectionId: string;
  artistId: string;
  albumId: string;
  item: BaseItemDto;
  index: number;
}

export const SongsListItem: React.FC<Props> = ({
  collectionId,
  artistId,
  albumId,
  item,
  index,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const castDevice = useCastDevice();
  const router = useRouter();
  const client = useRemoteMediaClient();
  const { showActionSheetWithOptions } = useActionSheet();

  const { setPlaySettings } = usePlaySettings();

  const openSelect = () => {
    if (!castDevice?.deviceId) {
      play("device");
      return;
    }

    const options = ["Chromecast", "Device", "Cancel"];
    const cancelButtonIndex = 2;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      (selectedIndex: number | undefined) => {
        switch (selectedIndex) {
          case 0:
            play("cast");
            break;
          case 1:
            play("device");
            break;
          case cancelButtonIndex:
            break;
        }
      }
    );
  };

  const play = useCallback(async (type: "device" | "cast") => {
    if (!user?.Id || !api || !item.Id) {
      console.warn("No user, api or item", user, api, item.Id);
      return;
    }

    const data = await setPlaySettings({
      item,
    });

    if (!data?.url) {
      throw new Error("play-music ~ No stream url");
    }

    if (type === "cast" && client) {
      await CastContext.getPlayServicesState().then((state) => {
        if (state && state !== PlayServicesState.SUCCESS)
          CastContext.showPlayServicesErrorDialog(state);
        else {
          client.loadMedia({
            mediaInfo: {
              contentUrl: data.url!,
              contentType: "video/mp4",
              metadata: {
                type: item.Type === "Episode" ? "tvShow" : "movie",
                title: item.Name || "",
                subtitle: item.Overview || "",
              },
            },
            startTime: 0,
          });
        }
      });
    } else {
      console.log("Playing on device", data.url, item.Id);
      router.push("/music-player");
    }
  }, []);

  return (
    <TouchableOpacity
      onPress={() => {
        openSelect();
      }}
      {...props}
    >
      <View className="flex flex-row items-center space-x-4 bg-neutral-900 border-neutral-800 px-4 py-4 rounded-xl">
        <Text className="opacity-50">{index + 1}</Text>
        <View>
          <Text className="mb-0.5 font-semibold">{item.Name}</Text>
          <Text className="opacity-50 text-xs">
            {runtimeTicksToSeconds(item.RunTimeTicks)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
