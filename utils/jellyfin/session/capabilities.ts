import type { Settings } from "@/utils/atoms/settings";
import generateDeviceProfile from "@/utils/profiles/native";
import type { Api } from "@jellyfin/sdk";
import type { AxiosResponse } from "axios";
import { getAuthHeaders } from "../jellyfin";

interface PostCapabilitiesParams {
  api: Api | null | undefined;
  itemId: string | null | undefined;
  sessionId: string | null | undefined;
  deviceProfile: Settings["deviceProfile"];
}

/**
 * Marks a media item as not played for a specific user.
 *
 * @param params - The parameters for marking an item as not played
 * @returns A promise that resolves to true if the operation was successful, false otherwise
 */
export const postCapabilities = async ({
  api,
  itemId,
  sessionId,
}: PostCapabilitiesParams): Promise<AxiosResponse> => {
  if (!api || !itemId || !sessionId) {
    throw new Error("Missing parameters for marking item as not played");
  }

  try {
    const d = api.axiosInstance.post(
      `${api.basePath}/Sessions/Capabilities/Full`,
      {
        playableMediaTypes: ["Audio", "Video"],
        supportedCommands: [
          "PlayState",
          "Play",
          "ToggleFullscreen",
          "DisplayMessage",
          "Mute",
          "Unmute",
          "SetVolume",
          "ToggleMute",
        ],
        supportsMediaControl: true,
        id: sessionId,
        DeviceProfile: generateDeviceProfile(),
      },
      {
        headers: getAuthHeaders(api),
      },
    );
    return d;
  } catch (error) {
    throw new Error("Failed to mark as not played");
  }
};
