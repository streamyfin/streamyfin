import { useAtomValue, useStore } from "jotai";
import { useEffect, useRef } from "react";
import { useRemoteTarget } from "@/modules/mpv-player/src/cast";
import { settingsAtom, useSettings } from "@/utils/atoms/settings";
import { NO_REMOTE_QUALITY, rememberTarget } from "@/utils/cast/remoteQuality";

/**
 * Remembers each receiver the app connects to, for the remote quality settings to list. Mounted once, at the
 * root; renders nothing.
 */
export function RemoteTargetMemory() {
  const target = useRemoteTarget();
  const { updateSettings } = useSettings();
  const store = useStore();
  // Null until storage loads: a write before that would replace the saved receivers and their quality.
  const loaded = useAtomValue(settingsAtom) !== null;
  const connected = target.state === "connected" ? target.target : null;
  // Read when a connection comes, not followed: a settings change, Forget this device among them, writes
  // nothing back for the receiver still connected. updateSettings is a new function at every render.
  const latest = useRef({ connected, updateSettings });
  latest.current = { connected, updateSettings };
  const id = connected?.id;
  const name = connected?.name;

  useEffect(() => {
    const { connected, updateSettings } = latest.current;
    if (!loaded || !connected || id === undefined) return;
    // The stored value now, not the render's: the load may have landed since.
    const quality =
      store.get(settingsAtom)?.remotePlaybackQuality ?? NO_REMOTE_QUALITY;
    const first = quality.known[0];
    // The receiver already first, under the same name: nothing to write.
    if (first?.id === id && first.name === name) return;
    updateSettings({
      remotePlaybackQuality: rememberTarget(quality, connected),
    });
  }, [id, name, loaded, store]);

  return null;
}
