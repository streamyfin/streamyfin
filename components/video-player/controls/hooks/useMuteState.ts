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
    if (initial <= 0 && Platform.isTV && Platform.OS === "ios") {
      // Apple TV over HDMI: the volume belongs to the display or the receiver
      // over CEC and the app is only shown a placeholder, which can read zero
      // on a set that is not muted at all. Trust a zero here only once a real
      // change has been observed, which is what an AirPlay, HomePod or AirPods
      // output does deliver. The mute button is the path that always works.
      apply(1);
    } else if (initial <= 0 && Platform.OS === "ios") {
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

  /**
   * Push the current flag at a player that has just become available. A mute
   * asked for while the view was still mounting reached no native handle: the
   * flag is retained natively only across an mpv re-creation, not before the
   * first one. Without this the player stays audible while the session report
   * and the automatic subtitles both believe it is muted.
   */
  const reapplyPlayerMute = useCallback(() => {
    if (!playerMuted) return;
    playerRef.current?.setMute?.(true)?.catch((error) => {
      console.warn("[useMuteState] setMute failed:", error);
    });
  }, [playerMuted, playerRef]);

  return {
    isMuted: systemMuted || playerMuted,
    playerMuted,
    toggleMute,
    setPlayerMuted,
    reapplyPlayerMute,
  };
};
