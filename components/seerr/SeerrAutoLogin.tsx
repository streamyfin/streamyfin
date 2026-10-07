import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { SeerrApi, useSeerr } from "@/hooks/useSeerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { writeInfoLog, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { deleteSeerrPassword, getSeerrPassword } from "@/utils/seerrPassword";
import { signInWithQuickConnect } from "@/utils/seerrQuickConnect";
import { seerrSignInsAtLoginAtom } from "@/utils/seerrSignInAtLogin";
import { store } from "@/utils/store";

/**
 * Signs in to Seerr on launch using the stored Jellyfin password.
 *
 * Only runs when the Streamyfin Jellyfin plugin supplies the Seerr server
 * URL. In that setup the server is chosen by the admin and every user signs in
 * to Seerr with their Jellyfin account anyway, so re-entering the password
 * whenever the cookie session lapses is pure friction. Users who typed their own
 * URL are left alone: nothing is stored and nothing is attempted for them.
 *
 * Renders nothing; it exists purely for the effect.
 */
export const SeerrAutoLogin: React.FC = () => {
  const { settings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { seerrUser, setSeerrUser } = useSeerr();

  // One attempt per app run. A failed sign-in must not become a retry loop
  // against the user's server.
  const attempted = useRef(false);

  const pluginUrl = pluginSettings?.seerrServerUrl?.value;
  const serverUrl = settings?.seerrServerUrl;
  const enabled = settings?.autoLoginSeerr !== false;
  // With an API key configured, the passwordless sign-in in JellyfinProvider
  // owns this setup — no password is stored and none should be replayed.
  const apiKey = settings?.seerrApiKey;
  const username = user?.Name;
  const userId = user?.Id;
  // A password sign-in in progress signs this user in to Seerr itself.
  const signingIn = useAtomValue(seerrSignInsAtLoginAtom);

  useEffect(() => {
    if (attempted.current) return;
    // Plugin-provided URL only — see the note above.
    if (!enabled || apiKey || !pluginUrl || !serverUrl || !username || !userId)
      return;
    // Not spent while that sign-in runs: once it is over, a session it opened
    // stops this below, and one it could not open leaves this its turn.
    if (signingIn.has(userId)) return;
    // Waiting for the session api rather than spending the one attempt without
    // it: Quick Connect needs it, and a user who signed in to Jellyfin with
    // Quick Connect or OIDC has no stored password to fall back to, so a run
    // started too early would give up for good on the launch that needed it.
    if (!api) return;
    // Already signed in (session restored from storage) — nothing to do.
    if (seerrUser) return;

    const jellyfinUrl = storage.getString("serverUrl");
    if (!jellyfinUrl) return;

    attempted.current = true;

    (async () => {
      try {
        // Same headers as every other Seerr call: without them the
        // sign-in fails behind an auth gateway (custom-header setups).
        // No test() first: it toasts on every failure path, and this runs
        // unprompted at launch — login() failing into the catch below is
        // the silent behavior we want.
        const seerr = new SeerrApi(serverUrl, getIntegrationHeaders("seerr"));

        const stillCurrent = () => store.get(userAtom)?.Id === userId;

        // Quick Connect first, even with no stored password: an OIDC or Quick
        // Connect login to Jellyfin never had one, and this is the launch path
        // that signs those users in to Seerr. When there is a stored password,
        // it goes once Quick Connect works — nothing else would remove it,
        // since a password that still works never looks like a problem.
        const quickConnected = await signInWithQuickConnect(
          seerr,
          api,
          stillCurrent,
        );
        if (quickConnected) {
          setSeerrUser(quickConnected);
          await deleteSeerrPassword(jellyfinUrl, userId).catch((e) =>
            writeToLog(
              "WARN",
              `Could not drop the stored Seerr password: ${e}`,
            ),
          );
          writeInfoLog("Seerr signed in with Quick Connect");
          return;
        }

        // Password replay only when Quick Connect did not sign in.
        const password = await getSeerrPassword(jellyfinUrl, userId);
        if (!password) return;
        // Nor the password for an account that has since been left: it is
        // the previous user's, and would sign the next one in as them.
        if (!stillCurrent()) return;

        setSeerrUser(await seerr.login(username, password));
        writeInfoLog("Seerr auto-login succeeded");
      } catch (e) {
        // Silent on purpose: this runs unprompted at launch, so a failure
        // belongs in the log rather than as a toast over the home screen.
        // WARN keeps it out of Sentry too — server-side failures are already
        // captured once by the SeerrApi response interceptor.
        writeToLog(
          "WARN",
          `Seerr auto-login failed: ${e instanceof Error ? e.message : e}`,
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
    seerrUser,
    setSeerrUser,
    signingIn,
  ]);

  return null;
};

export default SeerrAutoLogin;
