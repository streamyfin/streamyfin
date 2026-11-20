import type { Settings } from "@/utils/atoms/settings";
import {
  type AutoSubtitleAction,
  type AutoSubtitleState,
  carryAutoSubtitleState,
  INITIAL_AUTO_SUBTITLE_STATE,
  resolveAutoSubtitleAction,
} from "@/utils/autoSubtitleOnMute";
import {
  findSubtitleTrackIdentity,
  pickAutoSubtitleTrack,
} from "@/utils/jellyfin/subtitleUtils";
import type { ReceiverPlay } from "@/utils/remotePlayer/playOnRemote";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { mediaSourceOf } from "./buildRemotePlayerConfig";

/** The mute-subtitle policy's state for the play the remote player shows. */
export interface RemoteAutoSubtitle {
  state: AutoSubtitleState;
  /** The TV's mute the policy last acted on. */
  wasMuted: boolean;
  /** The item `state` belongs to. */
  itemId: string | null;
}

export const INITIAL_REMOTE_AUTO_SUBTITLE: RemoteAutoSubtitle = {
  state: INITIAL_AUTO_SUBTITLE_STATE,
  wasMuted: false,
  itemId: null,
};

/**
 * The local players' mute-subtitle policy (`resolveAutoSubtitleAction`), fed with the TV's mute and the play the
 * remote screen holds. The TV starts as unmuted, so a TV already muted when the screen shows its play counts as muted
 * now, and a new item carries the track as the local player does. `play` is null once nothing is shown.
 */
export const evaluateRemoteAutoSubtitle = (
  current: RemoteAutoSubtitle,
  input: {
    muted: boolean;
    play: ReceiverPlay | null;
    settings: Settings | null | undefined;
  },
): { next: RemoteAutoSubtitle; action: AutoSubtitleAction } => {
  const { muted, play, settings } = input;
  if (!play) {
    return { next: INITIAL_REMOTE_AUTO_SUBTITLE, action: { kind: "none" } };
  }

  const itemId = play.item.Id ?? null;
  const base: RemoteAutoSubtitle =
    itemId === current.itemId
      ? current
      : {
          state: carryAutoSubtitleState(current.state, {
            isMuted: current.wasMuted,
          }),
          wasMuted: false,
          itemId,
        };

  if (!settings?.subtitlesOnMute) {
    return { next: { ...base, wasMuted: muted }, action: { kind: "none" } };
  }

  const subtitleIndex = play.subtitleIndex ?? SUBTITLES_OFF;
  // The TV reports a track a moment after it was asked for: until then the off it still reports is not the user's.
  if (
    muted === base.wasMuted &&
    base.state.appliedIndex !== null &&
    subtitleIndex === SUBTITLES_OFF
  ) {
    return { next: base, action: { kind: "none" } };
  }

  const streams = mediaSourceOf(play)?.MediaStreams ?? [];
  const subtitleStreams = streams.filter((s) => s.Type === "Subtitle");
  const audioLanguage = streams.find(
    (s) => s.Type === "Audio" && s.Index === play.audioIndex,
  )?.Language;

  const { action, state } = resolveAutoSubtitleAction({
    state: base.state,
    isMuted: muted,
    wasMuted: base.wasMuted,
    currentSubtitleIndex: subtitleIndex,
    currentTrack: findSubtitleTrackIdentity(subtitleStreams, subtitleIndex),
    pick: () =>
      pickAutoSubtitleTrack({
        subtitleStreams,
        preferredLanguage:
          settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName,
        audioLanguage,
        // The receiver cannot draw a picture subtitle: the server burns it into the video, a new stream.
        isTranscoding: true,
        allowStreamRestart: settings.subtitlesOnMuteAllowRestart,
      }),
  });
  return { next: { state, wasMuted: muted, itemId }, action };
};
