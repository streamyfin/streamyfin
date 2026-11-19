import type { Api } from "@jellyfin/sdk";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
import {
  LIVE_STREAM_CLOSE_ATTEMPTS,
  LIVE_STREAM_CLOSE_RETRY_DELAY_MS,
} from "@/constants/Playback";

export type CloseLiveStreamOptions = {
  /** How many times the close goes out at most. */
  attempts?: number;
  /** The wait before the first retry, in ms, doubled before each later one. */
  retryDelayMs?: number;
};

/**
 * Gives one live stream reference back to the server.
 *
 * A close is not idempotent: the server counts one reference per negotiation
 * on a stream it shares between sessions, and every close it handles takes
 * one off. It is sent again only when no answer came back at all. An error
 * status means the server, or a gateway in front of it, handled the request:
 * a 500 comes from closing the stream once the count has dropped, and a 504
 * can come from a close still waiting behind a tuner being opened.
 *
 * The risk taken: a close the server handled and whose answer was lost looks
 * the same as one that never arrived. Its retry takes a second reference off
 * a stream still shared, which closes it under another device on the channel
 * (on a stream already closed, the retry finds nothing and does nothing).
 * Taken because a close that never arrived leaves nothing to give the
 * reference back, and the stream and its tuner stay held; and because while
 * another device holds a reference the server handles a close at once, so its
 * answer is rarely lost then.
 */
export async function closeLiveStream(
  api: Api,
  liveStreamId: string,
  {
    attempts = LIVE_STREAM_CLOSE_ATTEMPTS,
    retryDelayMs = LIVE_STREAM_CLOSE_RETRY_DELAY_MS,
  }: CloseLiveStreamOptions = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await getMediaInfoApi(api).closeLiveStream({ liveStreamId });
      return;
    } catch (error) {
      const unanswered = isAxiosError(error) && !error.response;
      if (!unanswered || attempt >= attempts) throw error;
      const wait = retryDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
