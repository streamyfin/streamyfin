import type { MediaStream } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AutoSubtitleState,
  carryAutoSubtitleState,
  INITIAL_AUTO_SUBTITLE_STATE,
  resolveAutoSubtitleAction,
} from "@/utils/autoSubtitleOnMute";
import {
  findSubtitleTrackIdentity,
  pickAutoSubtitleTrack,
} from "@/utils/jellyfin/subtitleUtils";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import type { AutoSubtitleNoticeKind } from "../AutoSubtitleNotice";

/**
 * Volume slides through zero while dragging a slider or holding a hardware key,
 * so let the value settle before acting on it.
 */
const MUTE_DEBOUNCE_MS = 400;

type UseAutoSubtitlesOnMuteParams = {
  enabled: boolean;
  allowStreamRestart: boolean;
  isMuted: boolean;
  tracksReady: boolean;
  isPipMode: boolean;
  itemId: string | undefined;
  currentSubtitleIndex: number;
  subtitleStreams: MediaStream[];
  isTranscoding: boolean;
  preferredLanguage: string | null | undefined;
  audioLanguage: string | null | undefined;
  onSelect: (index: number) => void;
};

/**
 * Turn subtitles on while audio is muted and undo it when sound returns.
 *
 * All the policy lives in `resolveAutoSubtitleAction`, which is pure and unit
 * tested; this hook only feeds it debounced input and performs the action.
 */
export const useAutoSubtitlesOnMute = (
  params: UseAutoSubtitlesOnMuteParams,
) => {
  const [notice, setNotice] = useState<AutoSubtitleNoticeKind | null>(null);
  const stateRef = useRef<AutoSubtitleState>(INITIAL_AUTO_SUBTITLE_STATE);
  const wasMutedRef = useRef(false);
  // Read inputs through a ref so the debounced effect never restarts on a
  // stream or callback identity change, only on a real mute transition.
  const latest = useRef(params);
  // Assigned after commit, not during render: an abandoned render must not
  // leave the debounced effect acting on inputs that never became state.
  // Declared before the debounce effect so it always commits first.
  useEffect(() => {
    latest.current = params;
  });

  const { itemId, enabled, tracksReady, isPipMode, isMuted } = params;

  // A new item is a fresh session. Ownership of the active subtitle is the one
  // thing carried over: the app hands the previous selection to the next
  // episode, so a track we applied can arrive already active and would
  // otherwise never be turned back off. Keyed on itemId alone: the mute state
  // is read through the ref, at that instant, on purpose.
  useEffect(() => {
    stateRef.current = carryAutoSubtitleState(stateRef.current, {
      isMuted: latest.current.isMuted,
    });
    wasMutedRef.current = false;
  }, [itemId]);

  const active = enabled && tracksReady && !isPipMode;

  useEffect(() => {
    if (!active) return;

    const timer = setTimeout(() => {
      const current = latest.current;
      const { action, state } = resolveAutoSubtitleAction({
        state: stateRef.current,
        isMuted: current.isMuted,
        wasMuted: wasMutedRef.current,
        currentSubtitleIndex: current.currentSubtitleIndex,
        currentTrack: findSubtitleTrackIdentity(
          current.subtitleStreams,
          current.currentSubtitleIndex,
        ),
        pick: () =>
          pickAutoSubtitleTrack({
            subtitleStreams: current.subtitleStreams,
            preferredLanguage: current.preferredLanguage,
            audioLanguage: current.audioLanguage,
            isTranscoding: current.isTranscoding,
            allowStreamRestart: current.allowStreamRestart,
          }),
      });

      stateRef.current = state;
      wasMutedRef.current = current.isMuted;

      if (action.kind === "apply") {
        current.onSelect(action.index);
        setNotice("enabled");
      } else if (action.kind === "revert") {
        current.onSelect(SUBTITLES_OFF);
      } else if (action.kind === "notice") {
        setNotice(action.reason);
      }
    }, MUTE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `currentSubtitleIndex` is a dependency so a manual change while muted is
    // seen as a user override, and `itemId` because an episode change while the
    // sound stays off moves none of the other inputs (`tracksReady` is never
    // reset), which would otherwise skip the adoption of a carried-over track.
    // Everything else is read from `latest` inside the timeout, by which point
    // the new item's state has settled.
  }, [active, isMuted, itemId, params.currentSubtitleIndex]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { notice, clearNotice };
};
