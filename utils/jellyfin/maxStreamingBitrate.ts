import type { Api } from "@jellyfin/sdk";
import { AUTO_BITRATE_VALUE } from "@/constants/Bitrate";
import type { BitrateRequest } from "@/utils/bitrate";
import { writeToLog } from "@/utils/log";
import { detectBitrate } from "./bitrateTest";

/**
 * The max streaming bitrate to ask the server for a quality: its own, none
 * for Max, and for Auto what the connection to the server measures. Auto that
 * cannot be measured sets no cap, as Max, the default before it, did.
 */
export const resolveMaxStreamingBitrate = async (
  api: Api | null | undefined,
  request: BitrateRequest | undefined,
): Promise<number | undefined> => {
  if (request !== AUTO_BITRATE_VALUE) return request;
  if (!api) return undefined;
  try {
    return await detectBitrate(api);
  } catch (error) {
    // A slow or unreachable server is the user's network, not an app bug.
    writeToLog("WARN", "Auto quality could not measure the server", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};
