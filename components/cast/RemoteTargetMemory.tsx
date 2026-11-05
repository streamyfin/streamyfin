import { useEffect } from "react";
import { useRemoteTarget } from "@/modules/mpv-player/src/cast";
import { useSettings } from "@/utils/atoms/settings";
import { NO_REMOTE_QUALITY, rememberTarget } from "@/utils/cast/remoteQuality";

/**
 * Remembers each receiver the app connects to, for the remote quality settings to list. Mounted once, at the
 * root; renders nothing.
 */
export function RemoteTargetMemory() {
  const target = useRemoteTarget();
  const { settings, updateSettings } = useSettings();
  const quality = settings?.remotePlaybackQuality ?? NO_REMOTE_QUALITY;
  const connected = target.state === "connected" ? target.target : null;

  useEffect(() => {
    if (!connected) return;
    const latest = quality.known[0];
    // The receiver already first, under the same name: nothing to write.
    if (latest?.id === connected.id && latest.name === connected.name) return;
    updateSettings({
      remotePlaybackQuality: rememberTarget(quality, connected),
    });
  }, [connected, quality, updateSettings]);

  return null;
}
