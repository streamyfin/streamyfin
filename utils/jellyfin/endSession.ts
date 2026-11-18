import type { Jellyfin } from "@jellyfin/sdk";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import axios from "axios";
import { SIGN_OUT_SESSION_END_TIMEOUT_MS } from "@/constants/Jellyfin";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { getAccountCredential } from "@/utils/secureCredentials";

/**
 * Ends a session the app signed out of on the server as well, so its token
 * stops working there. Without it the token stays valid until an admin removes
 * the device, however long the app has forgotten it.
 *
 * A saved account keeps its token: signing in to it again from the account
 * list reuses that very token, and ending it would make the account ask for
 * its password the next time.
 *
 * Never throws: the sign-out has already happened on the device, and the
 * server being out of reach or the token being revoked already must not undo
 * it or report it as a failure.
 */
export async function endSessionOnServer({
  jellyfin,
  serverUrl,
  token,
  userId,
}: {
  jellyfin: Jellyfin;
  serverUrl: string;
  token: string;
  userId?: string;
}): Promise<void> {
  try {
    const saved = userId ? await getAccountCredential(serverUrl, userId) : null;
    if (saved?.token === token) return;

    // An api of its own: the session's one answers a 401 by signing out the
    // session current by then, which can already be the next one.
    const api = createApiWithCustomHeaders(jellyfin, serverUrl, token);
    await getSessionApi(api).reportSessionEnded({
      timeout: SIGN_OUT_SESSION_END_TIMEOUT_MS,
    });
    writeInfoLog("Ended the session on the server");
  } catch (error) {
    // The status alone: an axios error carries the request, token included.
    const reason = axios.isAxiosError(error)
      ? (error.response?.status ?? error.code)
      : error instanceof Error
        ? error.message
        : "unknown error";
    writeErrorLog(`Failed to end the session on the server: ${reason}`);
  }
}
