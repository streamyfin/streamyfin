import { atom } from "jotai";
import type { ReceiverPlay } from "@/utils/cast/sendToReceiver";

/**
 * The play the remote player shows, set by `playOnRemote` and cleared when the screen closes: what Play here
 * continues on the phone. `loaded` once the TV took it, so its position is the TV's; before that, the send's.
 */
export const remotePlayAtom = atom<{
  play: ReceiverPlay;
  loaded: boolean;
} | null>(null);
