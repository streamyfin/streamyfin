import axios from "axios";
import type { ServerProbe } from "../types";

/** Public, unauthenticated Jellyfin endpoint; `ProductName` confirms the service. */
const PRODUCT_NAME = "Jellyfin Server";

export const jellyfinProbe: ServerProbe = async (url, signal, headers) => {
  try {
    const { status, data } = await axios.get(`${url}/System/Info/Public`, {
      signal,
      timeout: 8000, // backstop; the resolver aborts via signal first
      headers,
    });

    if (status < 200 || status >= 300) return { status: "unreachable" };
    if (data?.ProductName !== PRODUCT_NAME) return { status: "wrong-service" };

    return {
      status: "ok",
      meta: { version: data?.Version, serverName: data?.ServerName },
    };
  } catch {
    return { status: "unreachable" };
  }
};
