import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { isVersionBelow } from "@/utils/serverUrl/semver";

const RELEASES_API =
  "https://api.github.com/repos/streamyfin/streamyfin/releases/latest";

/**
 * True only inside the Electron shell. `Platform.OS === "web"` alone would also
 * match anyone serving the web bundle in a plain browser, where there is no
 * downloadable build to offer. The flag comes from desktop/preload.js.
 */
const IS_DESKTOP =
  Platform.OS === "web" &&
  typeof globalThis !== "undefined" &&
  (globalThis as { streamyfinDesktop?: { isDesktop?: boolean } })
    .streamyfinDesktop?.isDesktop === true;

interface LatestRelease {
  version: string;
  url: string;
}

/**
 * Tells desktop users when a newer release exists.
 *
 * Mobile and TV get updates through their stores, so this is web-only. It does
 * not self-update: the builds are unsigned, so a silent updater would be
 * neither verifiable nor trustworthy. The button opens the release page and
 * the user installs deliberately.
 */
export const DesktopUpdateBanner: React.FC = () => {
  const { t } = useTranslation();
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!IS_DESKTOP) return;

    const current = Constants.expoConfig?.version;
    if (!current) return;

    let cancelled = false;
    const controller = new AbortController();
    // GitHub can hang; a launch-time check must never keep a request open.
    const timeout = setTimeout(() => controller.abort(), 10_000);

    (async () => {
      try {
        const response = await fetch(RELEASES_API, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        // Releases are tagged "v0.55.0"; compare the bare numbers.
        const version = String(data?.tag_name ?? "").replace(/^v/, "");
        if (!version || !isVersionBelow(current, version)) return;
        if (!cancelled) {
          setLatest({ version, url: data?.html_url ?? RELEASES_API });
        }
      } catch {
        // Offline, rate-limited, aborted, or GitHub is down: stay quiet. An
        // update notice is not worth an error in the user's face.
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  if (!IS_DESKTOP || !latest || dismissed) return null;

  return (
    <View className='absolute top-0 left-0 right-0 z-50 flex flex-row items-center justify-center gap-x-3 bg-purple-600 px-4 py-2'>
      <Text className='text-sm font-semibold'>
        {t("desktop.update_available", { version: latest.version })}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(latest.url)}
        accessibilityRole='button'
        accessibilityLabel={t("desktop.update_now")}
        className='rounded-md bg-black/30 px-3 py-1'
      >
        <Text className='text-sm font-semibold'>{t("desktop.update_now")}</Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole='button'
        accessibilityLabel={t("desktop.update_later")}
        className='px-2 py-1'
      >
        <Text className='text-sm opacity-80'>{t("desktop.update_later")}</Text>
      </Pressable>
    </View>
  );
};

export default DesktopUpdateBanner;
