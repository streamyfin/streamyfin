import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { PUSH_DEVICE_PATH } from "@/constants/Notifications";
import {
  apiAtom,
  getServerUrlFromStorage,
  userAtom,
} from "@/providers/JellyfinProvider";
import { getOrSetDeviceId } from "@/utils/device";
import { writeErrorLog } from "@/utils/log";
import { pushRegistrationKey } from "@/utils/pushRegistration";

/**
 * Registers this device's push token with the plugin of the signed in server,
 * in `language`, the app's own.
 */
export const usePushRegistration = (
  token: string | undefined,
  language: string,
): void => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Each post waits for the one before it to land. Two in flight could land the
  // wrong way round, leaving the plugin with the older registration while the
  // app took the newer one as sent.
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The key the latest run asks for. A post whose turn comes once a newer run
  // asked for another is skipped, so after a burst of changes only the last
  // one goes out.
  const latest = useRef<string | null>(null);
  // The key on the plugin, or on its way there. Posted once per server, user,
  // token and language: the api and the user object change identity on sign in,
  // and without this the token went out twice within a second.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.isTV) return;

    // The server's primary address, which the app keeps when the api moves to the
    // LAN one on the home Wi-Fi: a notification is opened wherever the phone is,
    // and its poster is fetched from this address. Moving between the two posts
    // nothing new. No api is no session, as the api's own address used to say.
    const serverUrl = api ? getServerUrlFromStorage() : null;

    const key = pushRegistrationKey(serverUrl, user?.Id, token, language);
    latest.current = key;
    if (!key || !serverUrl || !api || !user?.Id || !token) {
      // No session, which is what sign out looks like. Sign out deleted the
      // device, so forgetting what was sent lets the same sign in post again.
      sent.current = null;
      return;
    }

    const registration = {
      token,
      deviceId: getOrSetDeviceId(),
      userId: user.Id,
      // What the plugin writes this device's notifications in, and the address
      // it fetches the poster in them from.
      language,
      serverUrl,
    };

    queue.current = queue.current.then(async () => {
      if (latest.current !== key || sent.current === key) return;
      sent.current = key;
      try {
        await api.post(PUSH_DEVICE_PATH, registration);
      } catch {
        // Forgotten, so the next run posts again. No retry on its own, as before.
        sent.current = null;
        writeErrorLog("Failed to push expo push token to plugin");
      }
    });
  }, [api, token, user, language]);
};
