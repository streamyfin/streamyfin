import type { Api } from "@jellyfin/sdk";
import type { TFunction } from "i18next";
import type { createStore } from "jotai";
import {
  currentCastSession,
  type RemotePlaybackState,
  type RemoteTarget,
  reloadOnReceiver,
  setRemoteAudioTrack,
  setRemoteSubtitleTrack,
} from "@/modules/mpv-player/src/cast";
import type { ReceiverServerRecord } from "@/modules/mpv-player/src/cast/Cast.types";
import {
  nativePlayerShowNotice,
  updateNativePlayerTrackMenus,
} from "@/modules/mpv-player/src/NativePlayerPresentation";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { effectiveSettingsAtom, type Settings } from "@/utils/atoms/settings";
import {
  type BitrateRequest,
  fromNativeQualityIndex,
  liveTvBitrateRequest,
  PLAYBACK_BITRATES,
  toBitrateRequest,
} from "@/utils/bitrate";
import {
  bitrateRequestFor,
  NO_REMOTE_QUALITY,
  setTargetQuality,
} from "@/utils/cast/remoteQuality";
import type { ReceiverPlay } from "@/utils/cast/sendToReceiver";
import { rememberSeriesTrackFromRow } from "@/utils/seriesTrackMemory";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { buildRemoteTrackMenus } from "./buildRemotePlayerConfig";
import { receiverBitrateFor } from "./playOnRemote";
import {
  evaluateRemoteAutoSubtitle,
  INITIAL_REMOTE_AUTO_SUBTITLE,
  type RemoteAutoSubtitle,
} from "./remoteAutoSubtitle";

export interface RemoteTrackDeps {
  store: Pick<ReturnType<typeof createStore>, "get" | "set">;
  t: TFunction;
}

/** The quality the TV plays `play` at on `remote`, as its menu marks it. */
const qualityOn = (
  play: ReceiverPlay,
  remote: RemoteTarget | null,
  settings: Settings | null | undefined,
): BitrateRequest | undefined =>
  remote
    ? liveTvBitrateRequest(
        play.item,
        bitrateRequestFor(remote, settings?.remotePlaybackQuality),
      )
    : undefined;

/** The remote screen's rows for `play`, `quality` marked. */
const showMenus = async (
  deps: RemoteTrackDeps,
  play: ReceiverPlay,
  quality: BitrateRequest | undefined,
): Promise<void> => {
  const mediaSource =
    play.item.MediaSources?.find(({ Id }) => Id === play.mediaSourceId) ??
    play.item.MediaSources?.[0];
  if (!mediaSource) return;
  await updateNativePlayerTrackMenus(
    buildRemoteTrackMenus({
      mediaSource,
      audioIndex: play.audioIndex,
      subtitleIndex: play.subtitleIndex,
      bitrateValue: quality,
      t: deps.t,
    }),
  );
};

/**
 * A track chosen in the remote player's menus: its Jellyfin index goes to the TV, and the choice is remembered for the
 * series, as the local player does. The row is checked once the TV reports it (`followRemoteTracks`).
 */
export const chooseRemoteTrack = async (
  deps: RemoteTrackDeps,
  kind: "audio" | "subtitle",
  index: number,
): Promise<void> => {
  if (kind === "audio") await setRemoteAudioTrack(index);
  else await setRemoteSubtitleTrack(index);

  const play = deps.store.get(remotePlayAtom)?.play;
  if (!play) return;
  const stream = play.item.MediaSources?.find(
    ({ Id }) => Id === play.mediaSourceId,
  )?.MediaStreams?.find((s) => s.Index === index);
  rememberSeriesTrackFromRow({
    item: play.item,
    kind,
    row:
      kind === "subtitle" && index === SUBTITLES_OFF
        ? { kind: "off" }
        : { kind: "server", language: stream?.Language ?? undefined },
    settings: deps.store.get(effectiveSettingsAtom),
  });
};

/**
 * The tracks the TV reports for the item the screen shows: the held play takes them (Play here goes on with them) and
 * the menus check them. An unknown audio track (-1) keeps the one shown.
 */
export const followRemoteTracks = async (
  deps: RemoteTrackDeps,
  state: RemotePlaybackState,
  remote: RemoteTarget | null,
): Promise<void> => {
  const held = deps.store.get(remotePlayAtom);
  if (!held?.loaded || !state.itemId || state.itemId !== held.play.item.Id)
    return;
  const audioIndex =
    state.audioIndex >= 0 ? state.audioIndex : held.play.audioIndex;
  const { subtitleIndex } = state;
  if (
    audioIndex === held.play.audioIndex &&
    subtitleIndex === held.play.subtitleIndex
  )
    return;
  const play = { ...held.play, audioIndex, subtitleIndex };
  deps.store.set(remotePlayAtom, { ...held, play });
  await showMenus(
    deps,
    play,
    qualityOn(play, remote, deps.store.get(effectiveSettingsAtom)),
  );
};

/**
 * A quality chosen in the remote player: kept as this TV's own, then the TV plays the item again where it is under the
 * new cap; the engine sends the rest of its list with it. The menu marks the new quality at once.
 */
export const changeRemoteQuality = async (
  deps: RemoteTrackDeps & {
    api: Api;
    server: Omit<ReceiverServerRecord, "maxBitrate">;
    updateSettings: (update: Partial<Settings>) => void;
  },
  remote: RemoteTarget,
  nativeIndex: number,
): Promise<void> => {
  const requested = fromNativeQualityIndex(nativeIndex);
  const key = PLAYBACK_BITRATES.find(
    (bitrate) => toBitrateRequest(bitrate) === requested,
  )?.key;
  const settings = deps.store.get(effectiveSettingsAtom);
  const remotePlaybackQuality = setTargetQuality(
    settings?.remotePlaybackQuality ?? NO_REMOTE_QUALITY,
    remote.id,
    key,
  );
  deps.updateSettings({ remotePlaybackQuality });

  const play = deps.store.get(remotePlayAtom)?.play;
  const quality = play ? liveTvBitrateRequest(play.item, requested) : requested;
  const maxBitrate = await receiverBitrateFor(
    deps.api,
    quality,
    settings,
    currentCastSession()?.device?.modelName,
  );
  await reloadOnReceiver({ ...deps.server, maxBitrate });
  if (play) await showMenus(deps, play, quality);
};

/**
 * Subtitles while the TV is muted, as the local players turn them on: the policy sees the TV's mute and the play the
 * screen holds, and its choice goes to the TV. Called on a mute change and on each write of the held play, never on
 * a bare status: a track just asked for is still reported off for a moment. `policy` keeps the state between calls.
 */
export const followRemoteMute = async (
  deps: RemoteTrackDeps,
  policy: { current: RemoteAutoSubtitle },
  remote: RemoteTarget | null,
  muted: boolean,
): Promise<void> => {
  const held = deps.store.get(remotePlayAtom);
  if (!held) {
    policy.current = INITIAL_REMOTE_AUTO_SUBTITLE;
    return;
  }
  // A send in flight holds the phone's tracks, not the TV's; without a TV there is nothing to send to.
  if (!held.loaded || !remote) return;
  const { next, action } = evaluateRemoteAutoSubtitle(policy.current, {
    muted,
    play: held.play,
    settings: deps.store.get(effectiveSettingsAtom),
  });
  policy.current = next;
  // No series memory here: a track turned on for the mute is not the user's choice.
  if (action.kind === "apply") {
    await setRemoteSubtitleTrack(action.index);
    await nativePlayerShowNotice(deps.t("player.auto_subtitles_enabled"));
  } else if (action.kind === "revert") {
    await setRemoteSubtitleTrack(SUBTITLES_OFF);
  } else if (action.kind === "notice") {
    await nativePlayerShowNotice(
      action.reason === "restart-required"
        ? deps.t("player.auto_subtitles_restart_required")
        : deps.t("player.auto_subtitles_none"),
    );
  }
};
