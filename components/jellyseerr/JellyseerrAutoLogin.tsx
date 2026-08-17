import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { getJellyseerrPassword } from "@/utils/secureCredentials";

/**
 * Signs in to Jellyseerr on launch using the stored Jellyfin password.
 *
 * Only runs when the Streamyfin Jellyfin plugin supplies the Jellyseerr server
 * URL. In that setup the server is chosen by the admin and every user signs in
 * to Jellyseerr with their Jellyfin account anyway, so re-entering the password
 * whenever the cookie session lapses is pure friction. Users who typed their own
 * URL are left alone: nothing is stored and nothing is attempted for them.
 *
 * Renders nothing; it exists purely for the effect.
 */
export const JellyseerrAutoLogin: React.FC = () => {
  const { settings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const { jellyseerrUser, setJellyseerrUser } = useJellyseerr();

  // One attempt per app run. A failed sign-in must not become a retry loop
  // against the user's server.
  const attempted = useRef(false);

  const pluginUrl = pluginSettings?.jellyseerrServerUrl?.value;
  const serverUrl = settings?.jellyseerrServerUrl;
  const enabled = settings?.autoLoginJellyseerr !== false;
  // With an API key configured, the passwordless sign-in in JellyfinProvider
  // owns this setup — no password is stored and none should be replayed.
  const apiKey = settings?.jellyseerrApiKey;
  const username = user?.Name;
  const userId = user?.Id;

  useEffect(() => {
    if (attempted.current) return;
    // Plugin-provided URL only — see the note above.
    if (!enabled || apiKey || !pluginUrl || !serverUrl || !username || !userId)
      return;
    // Already signed in (session restored from storage) — nothing to do.
    if (jellyseerrUser) return;

    const jellyfinUrl = storage.getString("serverUrl");
    if (!jellyfinUrl) return;

    attempted.current = true;

    (async () => {
      const password = await getJellyseerrPassword(jellyfinUrl, userId);
      if (!password) return;

      try {
        // Same headers as every other Jellyseerr call — without them the
        // sign-in fails behind an auth gateway (custom-header setups).
        // No test() first: it toasts on every failure path, and this runs
        // unprompted at launch — login() failing into the catch below is
        // the silent behavior we want.
        const api = new JellyseerrApi(
          serverUrl,
          getIntegrationHeaders("jellyseerr"),
        );
        setJellyseerrUser(await api.login(username, password));
        writeInfoLog("Jellyseerr auto-login succeeded");
      } catch (e) {
        // Silent on purpose: this runs unprompted at launch, so a failure
        // belongs in the log rather than as a toast over the home screen.
        writeErrorLog(
          `Jellyseerr auto-login failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    })();
  }, [
    enabled,
    apiKey,
    pluginUrl,
    serverUrl,
    username,
    userId,
    jellyseerrUser,
    setJellyseerrUser,
  ]);

  return null;
};

export default JellyseerrAutoLogin;
