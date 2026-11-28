import { parseTranscodeReasons } from "../playMethod";
import {
  type DownloadRequestParams,
  requestDownloadPlaybackInfo,
} from "./getStreamUrl";

/** Whether a download comes down as the original file, and if not, why. */
export type DownloadDecision =
  | { kind: "direct" }
  | { kind: "transcode"; reasons: string[] };

/**
 * Asks the server what it would do with this download, without starting it.
 * Throws when it cannot tell, so the caller can show the item as unchecked.
 */
export async function getDownloadDecision(
  params: DownloadRequestParams,
  signal?: AbortSignal,
): Promise<DownloadDecision> {
  const info = await requestDownloadPlaybackInfo(params, signal);
  if (!info) {
    throw new Error("No media source offered for download");
  }
  const { TranscodingUrl } = info.mediaSource;
  return TranscodingUrl
    ? { kind: "transcode", reasons: parseTranscodeReasons(TranscodingUrl) }
    : { kind: "direct" };
}
