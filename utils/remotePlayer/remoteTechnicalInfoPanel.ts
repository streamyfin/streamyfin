import type { TFunction } from "i18next";
import type { createStore } from "jotai";
import { REMOTE_TECHNICAL_INFO_REFRESH_MS } from "@/constants/RemotePlayer";
import {
  type RemoteTarget,
  remotePlayback,
} from "@/modules/mpv-player/src/cast";
import { updateRemoteTechnicalInfo } from "@/modules/mpv-player/src/RemotePlayerPresentation";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import {
  receiverNameFor,
  toReceiverDeviceName,
} from "@/utils/cast/jellyfinReceiver";
import { findPlayingReceiverSession } from "@/utils/cast/reportOrphanedReceiverStop";
import { describeErrorForLog } from "@/utils/describeErrorForLog";
import { writeErrorLog } from "@/utils/log";
import { mediaSourceOf } from "./buildRemotePlayerConfig";
import { remoteTechnicalInfo } from "./remoteTechnicalInfo";

interface PanelDeps {
  store: Pick<ReturnType<typeof createStore>, "get">;
  t: () => TFunction;
  target: () => RemoteTarget | null;
}

/** The receiver's session on the server for what it plays; none when the server cannot say. */
const receiverSession = async (deps: PanelDeps, itemId: string | null) => {
  const api = deps.store.get(apiAtom);
  const userId = deps.store.get(userAtom)?.Id;
  const remote = deps.target();
  if (!api || !userId || !remote || !itemId) return null;
  // The name the senders gave the receiver, which names no id: the session is listed under it.
  const receiverName = receiverNameFor({ friendlyName: remote.name });
  try {
    const session = await findPlayingReceiverSession({
      api,
      userId,
      deviceName: toReceiverDeviceName(receiverName ?? ""),
      itemId,
    });
    return session ?? null;
  } catch (error) {
    writeErrorLog(
      "The TV's session could not be read for its technical info",
      describeErrorForLog(error),
    );
    return null;
  }
};

/**
 * The remote player's technical info panel: written once it opens, then every REMOTE_TECHNICAL_INFO_REFRESH_MS
 * until it closes. A reply that lands after the close, or after a reopen, writes nothing.
 */
export const remoteTechnicalInfoPanel = (deps: PanelDeps) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let opened = 0;
  const refresh = async (shown: number) => {
    const state = remotePlayback();
    const session = await receiverSession(deps, state.itemId);
    if (shown !== opened || !timer) return;
    const held = deps.store.get(remotePlayAtom);
    // The source is the play shown only while the TV still plays its item.
    const source =
      held && held.play.item.Id === state.itemId
        ? mediaSourceOf(held.play)
        : null;
    await updateRemoteTechnicalInfo(
      remoteTechnicalInfo(state, session, source, deps.t()),
    );
  };
  const close = () => {
    opened += 1;
    if (timer) clearInterval(timer);
    timer = null;
  };
  const open = () => {
    close();
    const shown = opened;
    const read = () => {
      refresh(shown).catch((error) =>
        writeErrorLog(
          "The remote player's technical info failed",
          describeErrorForLog(error),
        ),
      );
    };
    timer = setInterval(read, REMOTE_TECHNICAL_INFO_REFRESH_MS);
    read();
  };
  return { open, close };
};
