import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue, useStore } from "jotai";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import {
  onRemotePlaybackChanged,
  type RemotePlaybackState,
  type RemoteTarget,
  remotePlayback,
  setRemoteServer,
  skipOnReceiver,
  useRemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { dismissNativePlayer } from "@/modules/mpv-player/src/NativePlayerPresentation";
import {
  addRemotePlayerListener,
  showRemotePlayerFailure,
} from "@/modules/mpv-player/src/RemotePlayerPresentation";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remoteForeignAtom, remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { effectiveSettingsAtom, useSettings } from "@/utils/atoms/settings";
import { receiverNameFor } from "@/utils/cast/jellyfinReceiver";
import { choosePlay, isLatestPlayChoice } from "@/utils/cast/playTarget";
import { remoteErrorMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { remotePlayerRouted } from "@/utils/cast/remotePlayerGate";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import {
  followForeignMedia,
  followRemoteItem,
} from "@/utils/remotePlayer/followRemoteItem";
import { showWhatTheTvPlays } from "@/utils/remotePlayer/openRemotePlayer";
import {
  followOnRemote,
  playOnRemote,
} from "@/utils/remotePlayer/playOnRemote";
import { INITIAL_REMOTE_AUTO_SUBTITLE } from "@/utils/remotePlayer/remoteAutoSubtitle";
import {
  episodeAfter,
  episodeBefore,
} from "@/utils/remotePlayer/remoteEpisodes";
import { remoteSubtitleSearch } from "@/utils/remotePlayer/remoteSubtitleSearch";
import { remoteTechnicalInfoPanel } from "@/utils/remotePlayer/remoteTechnicalInfoPanel";
import {
  changeRemoteQuality,
  chooseRemoteTrack,
  followRemoteMute,
  followRemoteTracks,
} from "@/utils/remotePlayer/remoteTracks";
import { seriesEpisodes } from "@/utils/remotePlayer/seriesEpisodes";
import { secondsToTicks } from "@/utils/time";
import { stopAndPlayHere } from "./OutputPickerActions";

/**
 * Gives native the current account's server, which the remote engine plays from and names in every
 * message, and takes it back at sign out: without a server the engine goes, sending nothing to the TV.
 * While a remote player is up it answers its events: Play here goes on on the phone, an error of the
 * receiver after the load is said on the screen, previous, next and a pick in the episode list send that episode
 * from its start with its own bounded list, the TV going on in the list it got is shown in place, Continue at the end
 * of that list sends what comes after it, and closing it only forgets the play, sending nothing.
 * Only behind the development gate for now. Mounted once, at the root, off TV; renders nothing.
 */
export function RemotePlayerController() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  // The receiver names its Jellyfin device from each message: the TV's name goes with the server. It comes from
  // the hub's target, which a suspended session keeps; the JS session goes null there, and a server without the
  // name would make native drop the engine an open remote screen holds.
  const { target, muted } = useRemoteTarget();
  const receiverName = receiverNameFor(
    target?.kind === "cast" ? { friendlyName: target.name } : null,
  );
  const routed = remotePlayerRouted();
  const serverAddress = api?.basePath;
  const accessToken = api?.accessToken;
  const userId = user?.Id;
  const { t } = useTranslation();
  const store = useStore();
  const playMedia = usePlayMedia();
  const syncPlay = useSyncPlay();
  const { updateSettings } = useSettings();
  // Read when the screen asks: set at the commit, so an event arriving before the passive effects reads it.
  const castTarget = target?.kind === "cast" ? target : null;
  const latest = useRef({
    playMedia,
    inGroup: syncPlay.enabled,
    t,
    castTarget,
    updateSettings,
  });
  useLayoutEffect(() => {
    latest.current = {
      playMedia,
      inGroup: syncPlay.enabled,
      t,
      castTarget,
      updateSettings,
    };
  }, [playMedia, syncPlay.enabled, t, castTarget, updateSettings]);

  // On each write of the held play (a send the TV took, a new item, the TV reporting another track) and each mute
  // change: the TV's tracks, then subtitles while it is muted. Subscribed again with the mute it reads.
  const autoSubtitle = useRef(INITIAL_REMOTE_AUTO_SUBTITLE);
  useEffect(() => {
    if (!routed) return;
    const evaluate = () => {
      // The tracks the TV reported while the play was on its way are read once it took it: no report follows.
      followRemoteTracks(
        { store, t: latest.current.t },
        remotePlayback(),
        latest.current.castTarget,
      ).catch((error) => {
        logAndCaptureError("Following the TV's tracks failed", error);
      });
      followRemoteMute(
        { store, t: latest.current.t },
        autoSubtitle,
        latest.current.castTarget,
        muted,
      ).catch((error) => {
        logAndCaptureError(
          "Turning subtitles on for the muted TV failed",
          error,
        );
      });
    };
    evaluate();
    return store.sub(remotePlayAtom, evaluate);
  }, [routed, store, muted]);

  useEffect(() => {
    if (!routed) return;
    if (!serverAddress || !accessToken || !userId) {
      void setRemoteServer(null);
      return;
    }
    void setRemoteServer({
      serverAddress,
      accessToken,
      userId,
      ...(receiverName ? { receiverName } : {}),
    });
  }, [routed, serverAddress, accessToken, userId, receiverName]);

  useEffect(() => {
    if (!routed) return;
    const playHere = async (positionSec: number) => {
      const held = store.get(remotePlayAtom);
      if (!held) return;
      store.set(remotePlayAtom, null);
      // One player presented at a time: the remote screen goes before the local one opens.
      await dismissNativePlayer();
      const { play } = held;
      const user = store.get(userAtom);
      await stopAndPlayHere(
        { store, playMedia: (...args) => latest.current.playMedia(...args) },
        {
          itemId: play.item.Id ?? "",
          mediaSourceId: play.mediaSourceId,
          audioIndex: play.audioIndex,
          subtitleIndex: play.subtitleIndex,
          // A send the TV never started has no TV position: the phone starts where the send asked.
          playbackPositionTicks: held.loaded
            ? secondsToTicks(positionSec)
            : play.positionTicks,
        },
        play.item,
        () => latest.current.inGroup || store.get(userAtom)?.Id !== user?.Id,
      );
    };
    // An episode from its start, its tracks from the play settings (the language remembered for the series).
    const sendEpisode = async (itemId: string, remote: RemoteTarget) => {
      const api = store.get(apiAtom);
      const userId = store.get(userAtom)?.Id;
      if (!api || !userId) return;
      const choice = choosePlay();
      const { data: item } = await getLibraryApi(api).getItem({
        itemId,
        userId,
      });
      const { mediaSource, audioIndex, subtitleIndex } = getDefaultPlaySettings(
        item,
        store.get(effectiveSettingsAtom),
      );
      const result = await playOnRemote(
        { api, userId, store, t: latest.current.t },
        {
          item,
          positionTicks: 0,
          mediaSourceId: mediaSource?.Id ?? undefined,
          audioIndex,
          subtitleIndex,
        },
        remote,
        () => !isLatestPlayChoice(choice) || store.get(userAtom)?.Id !== userId,
      );
      if (result.status === "failed") {
        writeErrorLog("The remote player could not take the episode", result);
      }
    };
    // The episode next to the one the TV plays, read from the TV and not from the screen. A list that is not a series
    // moves inside the receiver's queue.
    const move = async (direction: "next" | "previous") => {
      const remote = latest.current.castTarget;
      const api = store.get(apiAtom);
      const userId = store.get(userAtom)?.Id;
      const sent = store.get(remotePlayAtom)?.play.item;
      if (!remote || !api || !userId) return;
      if (sent?.Type !== "Episode" || !sent.SeriesId) {
        await skipOnReceiver(direction);
        return;
      }
      const episodes = await seriesEpisodes(api, userId, sent.SeriesId);
      // Once an item ended the TV holds none: the held play is the episode the screen followed to that end.
      const current = remotePlayback().itemId ?? sent.Id ?? null;
      const wanted =
        direction === "next"
          ? episodeAfter(episodes, current)
          : episodeBefore(episodes, current);
      if (wanted) await sendEpisode(wanted.id, remote);
    };
    const moveOrLog = (direction: "next" | "previous") => {
      move(direction).catch((error) => {
        logAndCaptureError("Moving between episodes on the TV failed", error);
      });
    };
    // The list played out: the TV holds no item to move on from, the next up is what came after the list.
    const continueNextUp = () => {
      const nextUpId = store.get(remotePlayAtom)?.list?.nextUpId;
      const remote = latest.current.castTarget;
      if (!nextUpId || !remote) return;
      sendEpisode(nextUpId, remote).catch((error) => {
        logAndCaptureError("Sending the next episode to the TV failed", error);
      });
    };
    // What is being read for the screen: the states the TV sends meanwhile do not read it again.
    let following: string | null = null;
    const track = (key: string, work: Promise<void>, failure: string) => {
      following = key;
      work
        .catch((error) => logAndCaptureError(failure, error))
        .finally(() => {
          if (following === key) following = null;
        });
    };
    // Media the phone did not send: the screen is rebuilt from what this server says of it, never patched.
    const follow = (state: RemotePlaybackState) => {
      const held = store.get(remotePlayAtom);
      const foreign = store.get(remoteForeignAtom);
      const remote = latest.current.castTarget;
      const api = store.get(apiAtom);
      const userId = store.get(userAtom)?.Id;
      if (!remote || !api || !userId) return;
      const deps = { api, userId, store, t: latest.current.t };
      let followed: "same" | "sent" | "other";
      if (held?.loaded && held.list) {
        followed = followRemoteItem(
          held.play.item.Id ?? null,
          state,
          held.list.itemIds,
        );
      } else if (foreign) {
        followed = followForeignMedia(foreign, state);
      } else {
        return;
      }
      if (followed === "same") return;
      const key =
        state.itemId ?? `foreign:${state.title ?? ""}:${state.imageUrl ?? ""}`;
      if (key === following) return;
      if (followed === "sent" && state.itemId) {
        track(
          key,
          followOnRemote(deps, state.itemId, remote, state),
          "Following the TV through the list failed",
        );
        return;
      }
      track(
        key,
        showWhatTheTvPlays(
          {
            ...deps,
            // The app's music player shows music, not this screen.
            onMusic: async () => {
              store.set(remotePlayAtom, null);
              store.set(remoteForeignAtom, null);
              await dismissNativePlayer();
            },
          },
          remote,
          state,
        ).then(() => undefined),
        "Following what the TV plays failed",
      );
    };
    const technicalInfo = remoteTechnicalInfoPanel({
      store,
      t: () => latest.current.t,
      target: () => latest.current.castTarget,
    });
    const subtitleSearch = remoteSubtitleSearch({
      store,
      t: () => latest.current.t,
      target: () => latest.current.castTarget,
    });
    const subscriptions = [
      addRemotePlayerListener("onSubtitleSearchRequested", ({ language }) => {
        subtitleSearch.search(language).catch((error) => {
          logAndCaptureError("Searching subtitles for the TV failed", error);
        });
      }),
      addRemotePlayerListener("onSubtitleDownloadRequested", ({ resultId }) => {
        subtitleSearch.download(resultId).catch((error) => {
          logAndCaptureError("Downloading a subtitle for the TV failed", error);
        });
      }),
      addRemotePlayerListener("onTechnicalInfoRequested", technicalInfo.open),
      addRemotePlayerListener("onTechnicalInfoClosed", technicalInfo.close),
      addRemotePlayerListener("onNextEpisodeRequested", ({ reason }) =>
        reason === "nextUp" ? continueNextUp() : moveOrLog("next"),
      ),
      addRemotePlayerListener("onPreviousEpisodeRequested", () =>
        moveOrLog("previous"),
      ),
      addRemotePlayerListener("onEpisodeSelected", ({ itemId }) => {
        const remote = latest.current.castTarget;
        if (!remote) return;
        sendEpisode(itemId, remote).catch((error) => {
          logAndCaptureError(
            "Sending the episode picked to the TV failed",
            error,
          );
        });
      }),
      addRemotePlayerListener(
        "onTrackSelectionRequested",
        ({ kind, jellyfinIndex }) => {
          chooseRemoteTrack(
            { store, t: latest.current.t },
            kind,
            jellyfinIndex,
          ).catch((error) => {
            logAndCaptureError("Choosing a track on the TV failed", error);
          });
        },
      ),
      addRemotePlayerListener("onQualitySelected", ({ bitrateValue }) => {
        const remote = latest.current.castTarget;
        const api = store.get(apiAtom);
        const userId = store.get(userAtom)?.Id;
        if (!remote || !api?.accessToken || !userId) return;
        const receiverName = receiverNameFor({ friendlyName: remote.name });
        changeRemoteQuality(
          {
            store,
            t: latest.current.t,
            api,
            server: {
              serverAddress: api.basePath,
              accessToken: api.accessToken,
              userId,
              ...(receiverName ? { receiverName } : {}),
            },
            updateSettings: latest.current.updateSettings,
          },
          remote,
          bitrateValue,
        ).catch((error) => {
          logAndCaptureError("Changing the quality on the TV failed", error);
        });
      }),
      addRemotePlayerListener("onPlayHereRequested", ({ positionSec }) => {
        playHere(positionSec).catch((error) => {
          logAndCaptureError("Play here from the remote player failed", error);
        });
      }),
      addRemotePlayerListener("onError", ({ error }) => {
        void showRemotePlayerFailure({
          message: remoteErrorMessage(latest.current.t, error),
          // Play here needs the play the screen shows, which a screen opened elsewhere has none of.
          canPlayHere: store.get(remotePlayAtom) !== null,
        });
      }),
      addRemotePlayerListener("onDismiss", () => {
        technicalInfo.close();
        store.set(remotePlayAtom, null);
        store.set(remoteForeignAtom, null);
      }),
      onRemotePlaybackChanged((state) => {
        followRemoteTracks(
          { store, t: latest.current.t },
          state,
          latest.current.castTarget,
        ).catch((error) => {
          logAndCaptureError("Following the TV's tracks failed", error);
        });
      }),
      onRemotePlaybackChanged(follow),
    ];
    return () => {
      technicalInfo.close();
      for (const subscription of subscriptions) subscription?.remove();
    };
  }, [routed, store]);

  return null;
}
