import { SystemApi } from "@jellyfin/sdk/lib/generated-client/api/system-api";
import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client/models";
import axios from "axios";
import type { ServerProbe } from "../types";

/** Public, unauthenticated Jellyfin endpoint; `ProductName` confirms the service. */
const PRODUCT_NAME = "Jellyfin Server";

/** Checks that public system information identifies a Jellyfin server. */
export const isJellyfinServerInfo = (data: unknown): data is PublicSystemInfo =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  "ProductName" in data &&
  data.ProductName === PRODUCT_NAME;

export const jellyfinProbe: ServerProbe = async (url, signal, headers) => {
  try {
    const systemApi = new SystemApi(
      undefined,
      url.replace(/\/+$/, ""),
      axios.create(),
    );
    const { status, data } = await systemApi.getPublicSystemInfo({
      signal,
      timeout: 8000, // backstop; the resolver aborts via signal first
      headers,
    });

    if (status < 200 || status >= 300) return { status: "unreachable" };
    if (!isJellyfinServerInfo(data)) return { status: "wrong-service" };

    return {
      status: "ok",
      meta: { version: data?.Version, serverName: data?.ServerName },
    };
  } catch {
    return { status: "unreachable" };
  }
};
