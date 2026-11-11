import type { Api } from "@jellyfin/sdk";
import { AUTO_BITRATE_VALUE, MAX_BITRATE_VALUE } from "@/constants/Bitrate";
import type { BitrateRequest } from "@/utils/bitrate";
import { writeToLog } from "@/utils/log";
import {
  type AutoBitrateOptions,
  autoBitrateOptions,
} from "./autoBitrateOptions";
import { type DetectionContext, detectBitrate } from "./bitrateTest";

/**
 * The max streaming bitrate to ask the server for a quality: its own, none
 * for Max, and for Auto what the connection to the server measures. Auto that
 * cannot be measured sets no cap, as Max does. A swap tells the detection its
 * outgoing stream still plays over the link.
 */
export const resolveMaxStreamingBitrate = async (
  api: Api | null | undefined,
  request: BitrateRequest,
  options: AutoBitrateOptions = autoBitrateOptions(undefined),
  context: DetectionContext = {},
): Promise<number | undefined> => {
  if (request === MAX_BITRATE_VALUE) return undefined;
  if (request !== AUTO_BITRATE_VALUE) return request;
  if (!api) return undefined;
  try {
    return await detectBitrate(api, false, options, {
      linkInUse: context.linkInUse === true,
    });
  } catch (error) {
    // A slow or unreachable server is the user's network, not an app bug.
    writeToLog("WARN", "Auto quality could not measure the server", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};
