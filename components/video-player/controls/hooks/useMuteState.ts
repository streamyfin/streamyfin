import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  addSystemVolumeListener,
  getSystemVolume,
  isSystemVolumeAvailable,
  isSystemVolumeFixed,
  type MpvPlayerViewRef,
} from "@/modules";

/**
 * iOS 18 can answer 0 to the very first `outputVolume` read even when the
 * device is not muted (Apple developer forums thread 764731). Re-read once the
 * player has had time to activate its audio session before trusting a zero.
 */
const IOS_INITIAL_READ_RECHECK_MS = 1000;

/**
 * Consolidated mute state for the video player.
 *
 * Two independent sources OR-ed together, because neither is available on every
 * platform: the OS output volume (invisible on tvOS over HDMI, where the TV or
 * the AV receiver owns the volume over CEC, and on Android boxes reporting a
 * fixed volume) and the player's own mute.
 *
 * `toggleMute` drives the player, never the device volume: there is then no
 * previous value to remember and restore, so leaving the player while muted
 * cannot strand the device at zero.
 */
export const useMuteState = ({
  playerRef,
}: {
  playerRef: MutableRefObject<MpvPlayerViewRef | null>;
}) => {
  const [systemMuted, setSystemMuted] = useState(false);
  const [playerMuted, setPlayerMutedState] = useState(false);
  const recheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Observed for as long as the player is mounted, regardless of the automatic
  // subtitle setting: this state is also what the session report sends to
  // Jellyfin as `IsMuted`, which must stay accurate either way.
  useEffect(() => {
    // A fixed-volume device never reports a change, so following it would pin
    // the state to whatever the first read happened to return.
    if (!isSystemVolumeAvailable() || isSystemVolumeFixed()) return;

    let cancelled = false;
    const apply = (volume: number) => {
      if (!cancelled) setSystemMuted(volume <= 0);
    };

    const initial = getSystemVolume();
    if (initial <= 0 && Platform.OS === "ios") {
      recheckTimer.current = setTimeout(() => {
        apply(getSystemVolume());
      }, IOS_INITIAL_READ_RECHECK_MS);
    } else {
      apply(initial);
    }

    const subscription = addSystemVolumeListener(({ volume }) => {
      // A real event supersedes the pending re-check.
      if (recheckTimer.current) {
        clearTimeout(recheckTimer.current);
        recheckTimer.current = null;
      }
      apply(volume);
    });

    return () => {
      cancelled = true;
      if (recheckTimer.current) {
        clearTimeout(recheckTimer.current);
        recheckTimer.current = null;
      }
      subscription.remove();
    };
  }, []);

  const setPlayerMuted = useCallback(
    (muted: boolean) => {
      setPlayerMutedState(muted);
      // The native call can reject when the player is not ready yet; the flag
      // is retained natively and re-applied on creation, so the JS state stays
      // authoritative either way.
      playerRef.current?.setMute?.(muted)?.catch((error) => {
        console.warn("[useMuteState] setMute failed:", error);
      });
    },
    [playerRef],
  );

  const toggleMute = useCallback(() => {
    setPlayerMuted(!playerMuted);
  }, [playerMuted, setPlayerMuted]);

  return {
    isMuted: systemMuted || playerMuted,
    playerMuted,
    toggleMute,
    setPlayerMuted,
  };
};
