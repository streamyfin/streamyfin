import axios from "axios";
import { isVersionBelow } from "../semver";
import type { ServerProbe } from "../types";

/** Jellyseerr/Overseerr minimum supported version. */
const MIN_VERSION = "2.0.0";

/**
 * Probe for a Jellyseerr server. `/api/v1/status` is jellyseerr/overseerr
 * specific and unauthenticated, so it both proves reachability and confirms
 * we hit the right service.
 */
export const jellyseerrProbe: ServerProbe = async (url, signal) => {
  try {
    const { status, data } = await axios.get(`${url}/api/v1/status`, {
      signal,
      timeout: 8000, // backstop; the resolver aborts via signal first
    });

    if (status < 200 || status >= 300) return { status: "unreachable" };

    const version: string | undefined =
      typeof data?.version === "string" ? data.version : undefined;

    // A JSON body carrying version/commitTag identifies a real jellyseerr.
    if (
      !version &&
      !(data && typeof data === "object" && "commitTag" in data)
    ) {
      return { status: "wrong-service" };
    }

    if (version && isVersionBelow(version, MIN_VERSION)) {
      return { status: "version-too-low", version };
    }

    return { status: "ok", meta: { version } };
  } catch {
    return { status: "unreachable" };
  }
};
