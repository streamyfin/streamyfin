import { atom } from "jotai";
import type { ReceiverPlay } from "@/utils/remotePlayer/playOnRemote";

/**
 * The play the remote player shows, set by `playOnRemote` and cleared when the screen closes: what Play here
 * continues on the phone. `loaded` once the TV took it, so its position is the TV's; before that, the send's.
 */
export const remotePlayAtom = atom<{
  play: ReceiverPlay;
  loaded: boolean;
  /** The items the TV got and what comes after them, once it took them: the screen follows the TV through them. */
  list?: { itemIds: string[]; nextUpId: string | null };
} | null>(null);

/**
 * The media of another server the reduced remote player shows, as the Cast status names it: cleared when the screen
 * closes, when a send takes it and when it shows an item this server knows.
 */
export const remoteForeignAtom = atom<{
  /** The receiver's item id, when it names one this server refused. */
  itemId: string | null;
  title: string | null;
  imageUrl: string | null;
} | null>(null);
