import axios from "axios";
import type { ServerProbe } from "../types";

/**
 * Probe for a Jellyseerr server. `/api/v1/status` is jellyseerr/overseerr
 * specific and unauthenticated, so it both proves reachability and confirms we
 * hit the right service. The minimum-version requirement is enforced at login
 * time (see JellyseerrApi.test) — not surfaced here, to keep the field UI clean.
 */
export const jellyseerrProbe: ServerProbe = async (url, signal) => {
  try {
    const { status, data } = await axios.get(`${url}/api/v1/status`, {
      signal,
      timeout: 8000, // backstop; the resolver aborts via signal first
    });

    if (status < 200 || status >= 300) return { status: "unreachable" };

    // A JSON body carrying version/commitTag identifies a real jellyseerr.
    const looksLikeJellyseerr =
      !!data &&
      typeof data === "object" &&
      (typeof data.version === "string" || "commitTag" in data);
    if (!looksLikeJellyseerr) return { status: "wrong-service" };

    return { status: "ok", meta: { version: data.version } };
  } catch {
    return { status: "unreachable" };
  }
};
