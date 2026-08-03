import axios from "axios";
import type { ServerProbe } from "../types";

/**
 * Minimal probe for services without a known/unauthenticated health endpoint
 * (e.g. Marlin Search, Streamystats). Any HTTP response — even 4xx — proves the
 * host is up and speaking HTTP at this protocol/port, which is enough to pick
 * https vs http. It cannot detect a "wrong service".
 */
export const reachabilityProbe: ServerProbe = async (url, signal) => {
  try {
    await axios.get(url, {
      signal,
      timeout: 8000,
      validateStatus: () => true, // any status = the server answered
    });
    return { status: "ok" };
  } catch (error) {
    // A delivered response that still threw counts as reachable.
    if ((error as { response?: unknown })?.response) return { status: "ok" };
    return { status: "unreachable" };
  }
};
