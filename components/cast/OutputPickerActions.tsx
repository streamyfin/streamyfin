import { useStore } from "jotai";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  RECEIVER_ITEM_LOOKUP_TIMEOUT_MS,
  RECEIVER_STATUS_TIMEOUT_MS,
} from "@/constants/Cast";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import {
  castClientFor,
  currentCastSession,
  disconnectRemoteTarget,
  onOutputPickerAction,
  remoteTarget,
  showExpandedControls,
} from "@/modules/mpv-player/src/cast";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { playRequestFromReceiver } from "@/utils/cast/playRequestFromReceiver";
import { choosePlay, isLatestPlayChoice } from "@/utils/cast/playTarget";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import { isNotFound } from "@/utils/pluginReads";

type Store = ReturnType<typeof useStore>;
type PlayMedia = ReturnType<typeof usePlayMedia>;

interface ContinueHere {
  store: Store;
  playMedia: PlayMedia;
  /** Whether this device plays for a SyncPlay group now. */
  inGroup: () => boolean;
  /** Tells the user the video could not go on here and plays on where it is. */
  staysThere: () => void;
}

/** Rejects once `ms` pass without an answer: a hung request neither holds the tap nor stops the receiver much later. */
const within = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`No answer within ${ms} ms`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * This device chosen while the receiver plays (Continue here). The receiver forgets its item once stopped, so it is
 * asked where it is and its item is looked up first, and it stops last, right before the video goes on here: a tap
 * that cannot go on leaves it playing and says so. An item this server does not know only stops it, and so does
 * audio, whose queue comes back with B4 (the sheet offers it no Continue here), and so does a SyncPlay member's tap.
 * A later play choice, another receiver or another account by then: nothing is stopped or played.
 */
const continueReceiverHere = async (
  { store, playMedia, inGroup, staysThere }: ContinueHere,
  choice: number,
) => {
  const stopReceiver = () => disconnectRemoteTarget({ stopPlayback: true });
  // A member plays the group's video: the tap only stops the receiver, which needs nothing read first.
  if (inGroup()) return stopReceiver();
  const session = currentCastSession();
  if (!session) {
    // Ended between the sheet's answer and this one, or the module unavailable: nothing to read or stop.
    writeErrorLog("Continue here dropped: no Cast session");
    return;
  }
  const api = store.get(apiAtom);
  const user = store.get(userAtom);
  // Signed out with the sheet still up: there is no account to look the item up with.
  if (!api || !user?.Id) return staysThere();
  const userId = user.Id;
  const tapGoneStale = () => {
    const now = store.get(userAtom);
    return (
      !isLatestPlayChoice(choice) ||
      now?.Id !== userId ||
      now?.ServerId !== user.ServerId
    );
  };
  const outdated = () =>
    tapGoneStale() || currentCastSession()?.id !== session.id;
  const client = castClientFor(session);
  // The status held is the receiver's last report, which falls behind while it plays on: it is asked where it is.
  const status = await client
    .requestMediaStatus(RECEIVER_STATUS_TIMEOUT_MS)
    .then(
      (answer) => answer,
      (error) => {
        logAndCaptureError("The receiver's status could not be read", error);
        return "failed" as const;
      },
    );
  if (outdated()) return;
  // Not answered (a failed request, a timeout, one outlived by a resume): where it is is unknown, so it plays on.
  if (status === "failed" || status?.fresh === false) return staysThere();
  if (!status) {
    // No status at all: a receiver whose media just ended answers with none, its session still connected, and the
    // tap only stops it. A suspended or reconnecting one says nothing of what it plays, so it plays on.
    const target = remoteTarget();
    return target.state === "connected" && !target.reconnecting
      ? stopReceiver()
      : staysThere();
  }
  const request = playRequestFromReceiver(status);
  // Nothing of ours to go on with any more (stopped meanwhile, another sender's media): the tap only stops it.
  if (!request) return stopReceiver();
  const item = await within(
    getUserItemData({ api, itemId: request.itemId, userId }),
    RECEIVER_ITEM_LOOKUP_TIMEOUT_MS,
  ).catch((error) => {
    // A tap gone stale by then says nothing, and another server's item only stops the receiver. Any other failure,
    // a lookup that does not answer among them, leaves it playing and is reported.
    if (outdated() || isNotFound(error)) return null;
    staysThere();
    throw error;
  });
  // The receiver played on during the lookup: the estimate from the answer just had says where it is now.
  const latest = await client.getMediaStatus().catch(() => null);
  if (outdated()) return;
  if (inGroup() || !item || item.MediaType === "Audio") return stopReceiver();
  const now = playRequestFromReceiver(latest);
  const from = now?.itemId === request.itemId ? now : request;
  await stopReceiver();
  // The stop takes a moment: a later choice, another account or a group joined by then gets nothing played here.
  if (tapGoneStale() || inGroup()) return;
  await playMedia(
    {
      ...from,
      bitrateValue: store.get(effectiveSettingsAtom).defaultBitrate?.value,
      offline: false,
    },
    { item, itemIsComplete: true },
  );
};

/**
 * Answers the output sheet's actions for the whole app, mounted once: its remote opens the Cast expanded controls,
 * and this device chosen while the receiver plays continues the receiver's video here. At the root, its plays go
 * through no screen that could lose the focus meanwhile, and no Cast button holds a player. Renders nothing.
 */
export function OutputPickerActions() {
  const { t } = useTranslation();
  const store = useStore();
  const playMedia = usePlayMedia();
  const syncPlay = useSyncPlay();
  // Read when the sheet answers: a group joined while it was open (a SyncPlay rejoin) counts then. Set at the
  // commit, so an answer arriving before the passive effects already reads it.
  const latest = useRef({ playMedia, inGroup: syncPlay.enabled, t });
  useLayoutEffect(() => {
    latest.current = { playMedia, inGroup: syncPlay.enabled, t };
  }, [playMedia, syncPlay.enabled, t]);
  // One Continue here at a time: a second tap while one runs would open a second player.
  const continuing = useRef(false);

  useEffect(() => {
    const subscription = onOutputPickerAction((action) => {
      if (action === "remote") {
        showExpandedControls().catch((error) => {
          logAndCaptureError(
            "The Cast expanded controls failed to open",
            error,
          );
        });
        return;
      }
      // An action this build does not know is left alone.
      if (action !== "playHere" || continuing.current) return;
      continuing.current = true;
      continueReceiverHere(
        {
          store,
          playMedia: (...args) => latest.current.playMedia(...args),
          inGroup: () => latest.current.inGroup,
          staysThere: () =>
            Alert.alert(
              latest.current.t("cast.output.continue_here"),
              latest.current.t("cast.output.continue_here_failed"),
            ),
        },
        choosePlay(),
      )
        .catch((error) => {
          logAndCaptureError(
            "The receiver's video failed to go on here",
            error,
          );
        })
        .finally(() => {
          continuing.current = false;
        });
    });
    return () => subscription.remove();
  }, [store]);

  return null;
}
