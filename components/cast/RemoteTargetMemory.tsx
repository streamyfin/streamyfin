import { useEffect, useRef } from "react";
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
  const connected = target.state === "connected" ? target.target : null;
  // Read when a connection comes, not followed: a settings change, Forget this device among them, writes
  // nothing back for the receiver still connected. updateSettings is a new function at every render.
  const latest = useRef({ connected, settings, updateSettings });
  latest.current = { connected, settings, updateSettings };
  const id = connected?.id;
  const name = connected?.name;

  useEffect(() => {
    const { connected, settings, updateSettings } = latest.current;
    if (!connected || id === undefined) return;
    const quality = settings?.remotePlaybackQuality ?? NO_REMOTE_QUALITY;
    const first = quality.known[0];
    // The receiver already first, under the same name: nothing to write.
    if (first?.id === id && first.name === name) return;
    updateSettings({
      remotePlaybackQuality: rememberTarget(quality, connected),
    });
  }, [id, name]);

  return null;
}
