import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import type { RemotePlaybackState } from "@/modules/mpv-player/src/cast/Cast.types";
import { writeErrorLog } from "@/utils/log";

/**
 * What the TV plays, as this account's server sees it: an item it returns (`music` when it is audio), media it does
 * not know (`foreign`, with what the TV says of it), or nothing.
 */
export type RemoteItem =
  | { kind: "known"; item: BaseItemDto }
  | { kind: "music"; item: BaseItemDto }
  | {
      kind: "foreign";
      /** The receiver's item id, when it names one this server refused. */
      itemId: string | null;
      title: string | null;
      imageUrl: string | null;
    }
  | { kind: "nothing" };

const foreign = (state: RemotePlaybackState): RemoteItem => ({
  kind: "foreign",
  itemId: state.itemId,
  title: state.title,
  imageUrl: state.imageUrl,
});

/**
 * Asks this account's server for the item the TV plays. The receiver's item id does not say which server sent it, so
 * an id the server refuses, cannot find or cannot be asked about is another server's: foreign, like media without one.
 */
export const resolveRemoteItem = async (
  deps: { api: Api; userId: string },
  state: RemotePlaybackState,
): Promise<RemoteItem> => {
  if (!state.connected) return { kind: "nothing" };
  const { itemId } = state;
  if (!itemId) return state.foreign ? foreign(state) : { kind: "nothing" };
  try {
    const { data: item } = await getLibraryApi(deps.api).getItem({
      itemId,
      userId: deps.userId,
    });
    return item.MediaType === "Audio"
      ? { kind: "music", item }
      : { kind: "known", item };
  } catch (error) {
    writeErrorLog("The server did not return the item the TV plays", error);
    return foreign(state);
  }
};
