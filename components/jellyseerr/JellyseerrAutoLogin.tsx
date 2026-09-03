import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { signInWithQuickConnect } from "@/utils/jellyseerrQuickConnect";
import { writeInfoLog, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  deleteJellyseerrPassword,
  getJellyseerrPassword,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";

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
  const api = useAtomValue(apiAtom);
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
      try {
        // Same headers as every other Jellyseerr call — without them the
        // sign-in fails behind an auth gateway (custom-header setups).
        // No test() first: it toasts on every failure path, and this runs
        // unprompted at launch — login() failing into the catch below is
        // the silent behavior we want.
        const seerr = new JellyseerrApi(
          serverUrl,
          getIntegrationHeaders("jellyseerr"),
        );

        const stillCurrent = () => store.get(userAtom)?.Id === userId;

        // Quick Connect first, even with no stored password: an OIDC or Quick
        // Connect login to Jellyfin never had one, and this is the launch path
        // that signs those users in to Seerr. When there is a stored password,
        // it goes once Quick Connect works — nothing else would remove it,
        // since a password that still works never looks like a problem.
        if (api) {
          const quickConnected = await signInWithQuickConnect(
            seerr,
            api,
            stillCurrent,
          );
          if (quickConnected) {
            setJellyseerrUser(quickConnected);
            await deleteJellyseerrPassword(jellyfinUrl, userId).catch((e) =>
              writeToLog(
                "WARN",
                `Could not drop the stored Jellyseerr password: ${e}`,
              ),
            );
            writeInfoLog("Jellyseerr signed in with Quick Connect");
            return;
          }
        }

        // Password replay only when Quick Connect did not sign in.
        const password = await getJellyseerrPassword(jellyfinUrl, userId);
        if (!password) return;
        // Nor the password for an account that has since been left: it is
        // the previous user's, and would sign the next one in as them.
        if (!stillCurrent()) return;

        setJellyseerrUser(await seerr.login(username, password));
        writeInfoLog("Jellyseerr auto-login succeeded");
      } catch (e) {
        // Silent on purpose: this runs unprompted at launch, so a failure
        // belongs in the log rather than as a toast over the home screen.
        // WARN keeps it out of Sentry too — server-side failures are already
        // captured once by the JellyseerrApi response interceptor.
        writeToLog(
          "WARN",
          `Jellyseerr auto-login failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    })();
  }, [
    api,
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
