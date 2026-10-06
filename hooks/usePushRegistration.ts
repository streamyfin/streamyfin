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
import { pushRegistrationStep } from "@/utils/pushRegistration";

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

  // Posted once per server, user, token and language. The api and the user object
  // change identity on sign in, so without this the token went out twice within a
  // second. Sign out clears the session, and the key with it, so the next sign in
  // posts again.
  const registeredPush = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.isTV) return;

    // The server's primary address, which the app keeps when the api moves to the
    // LAN one on the home Wi-Fi: a notification is opened wherever the phone is,
    // and its poster is fetched from this address. Moving between the two posts
    // nothing new. No api is no session, as the api's own address used to say.
    const serverUrl = api ? getServerUrlFromStorage() : null;

    const step = pushRegistrationStep(
      registeredPush.current,
      serverUrl,
      user?.Id,
      token,
      language,
    );
    registeredPush.current = step.key;
    if (!step.post || !serverUrl || !api || !user || !token) return;

    api
      .post(PUSH_DEVICE_PATH, {
        token,
        deviceId: getOrSetDeviceId(),
        userId: user.Id,
        // What the plugin writes this device's notifications in, and the address
        // it fetches the poster in them from.
        language,
        serverUrl,
      })
      .catch((_) => {
        // Forgotten only if nothing newer was posted meanwhile, so the next change
        // of session, token or language posts again. No retry on its own, as before.
        if (registeredPush.current === step.key) registeredPush.current = null;
        writeErrorLog("Failed to push expo push token to plugin");
      });
  }, [api, token, user, language]);
};
