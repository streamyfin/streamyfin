import { useStore } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { RECEIVER_STATUS_TIMEOUT_MS } from "@/constants/Cast";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import {
  castClientFor,
  currentCastSession,
  disconnectRemoteTarget,
  onOutputPickerAction,
  showExpandedControls,
} from "@/modules/mpv-player/src/cast";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { settingsAtom } from "@/utils/atoms/settings";
import { playRequestFromReceiver } from "@/utils/cast/playRequestFromReceiver";
import { choosePlay, isLatestPlayChoice } from "@/utils/cast/playTarget";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { logAndCaptureError } from "@/utils/log";
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
  if (!session) return;
  const api = store.get(apiAtom);
  const user = store.get(userAtom);
  const outdated = () => {
    const now = store.get(userAtom);
    return (
      !isLatestPlayChoice(choice) ||
      currentCastSession()?.id !== session.id ||
      now?.Id !== user?.Id ||
      now?.ServerId !== user?.ServerId
    );
  };
  // The status held is the receiver's last report, which falls behind while it plays on: it is asked where it is.
  const status = await castClientFor(session)
    .requestMediaStatus(RECEIVER_STATUS_TIMEOUT_MS)
    .catch((error) => {
      logAndCaptureError("The receiver's status could not be read", error);
      return null;
    });
  if (outdated()) return;
  // Not answered (a session suspended or resumed by the tap, a timeout): where it is is unknown, so it plays on.
  if (!status || status.fresh === false) return staysThere();
  const request = playRequestFromReceiver(status);
  // Nothing of ours to go on with any more (stopped meanwhile, another sender's media): the tap only stops it.
  if (!request) return stopReceiver();
  const item = await getUserItemData({
    api,
    itemId: request.itemId,
    userId: user?.Id,
  }).catch((error) => {
    // Another server's item only stops the receiver; any other failure leaves it playing and is reported.
    if (isNotFound(error)) return null;
    staysThere();
    throw error;
  });
  if (outdated()) return;
  if (inGroup() || !item || item.MediaType === "Audio") return stopReceiver();
  await stopReceiver();
  if (!isLatestPlayChoice(choice)) return;
  await playMedia(
    {
      ...request,
      bitrateValue: store.get(settingsAtom)?.defaultBitrate?.value,
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
  // Read when the sheet answers: a group joined while it was open (a SyncPlay rejoin) counts then.
  const latest = useRef({ playMedia, inGroup: syncPlay.enabled, t });
  useEffect(() => {
    latest.current = { playMedia, inGroup: syncPlay.enabled, t };
  }, [playMedia, syncPlay.enabled, t]);
  // One Continue here at a time: a second tap while one runs would open a second player.
  const continuing = useRef(false);

  useEffect(() => {
    const subscription = onOutputPickerAction((action) => {
      if (action !== "playHere") {
        showExpandedControls().catch((error) => {
          logAndCaptureError(
            "The Cast expanded controls failed to open",
            error,
          );
        });
        return;
      }
      if (continuing.current) return;
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
