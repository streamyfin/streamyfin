import axios from "axios";
import type { ServerProbe } from "../types";

/**
 * Probe for a Seerr server. `/api/v1/status` is seerr/overseerr
 * specific and unauthenticated, so it both proves reachability and confirms we
 * hit the right service. The minimum-version requirement is enforced at login
 * time (see SeerrApi.test) — not surfaced here, to keep the field UI clean.
 */
export const seerrProbe: ServerProbe = async (url, signal, headers) => {
  try {
    const { status, data } = await axios.get(`${url}/api/v1/status`, {
      signal,
      timeout: 8000, // backstop; the resolver aborts via signal first
      headers,
    });

    if (status < 200 || status >= 300) return { status: "unreachable" };

    // A JSON body carrying version/commitTag identifies a real seerr.
    const looksLikeSeerr =
      !!data &&
      typeof data === "object" &&
      (typeof data.version === "string" || "commitTag" in data);
    if (!looksLikeSeerr) return { status: "wrong-service" };

    return { status: "ok", meta: { version: data.version } };
  } catch {
    return { status: "unreachable" };
  }
};
