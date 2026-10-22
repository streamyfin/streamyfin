import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";
import { getDeviceNameSync } from "react-native-device-info";
import { getOrSetDeviceId } from "@/utils/device";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import { storage } from "@/utils/mmkv";
import { APP_VERSION } from "@/utils/version";

// Kept out of providers/JellyfinProvider so utils/atoms/settings can read the
// api without importing the provider, which imports settings back.
const initialApi = (() => {
  try {
    const token = storage.getString("token") || null;
    const serverUrl = storage.getString("serverUrl") || null;
    if (serverUrl && token) {
      const id = getOrSetDeviceId();
      const deviceName = getDeviceNameSync();
      const jellyfinInstance = new Jellyfin({
        clientInfo: { name: "Streamyfin", version: APP_VERSION },
        deviceInfo: {
          name: deviceName,
          id,
        },
      });
      return createApiWithCustomHeaders(jellyfinInstance, serverUrl, token);
    }
  } catch (e) {
    console.error("Failed to initialize API synchronously:", e);
  }
  return null;
})();

const initialUser = (() => {
  try {
    // Only return a stored user if we also have a token. Otherwise the
    // user atom would be populated while the api atom is null (e.g. after
    // a logout that left stale user JSON in storage), which causes
    // useProtectedRoute to keep us inside the (auth) group instead of
    // redirecting to /login.
    const token = storage.getString("token");
    if (!token) return null;
    const userStr = storage.getString("user");
    if (userStr) {
      return JSON.parse(userStr) as UserDto;
    }
  } catch (e) {
    console.error("Failed to parse initial user synchronously:", e);
  }
  return null;
})();

export const apiAtom = atom<Api | null>(initialApi);
export const userAtom = atom<UserDto | null>(initialUser);
