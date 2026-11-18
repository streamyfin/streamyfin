import type { Jellyfin } from "@jellyfin/sdk";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import axios from "axios";
import { SIGN_OUT_SESSION_END_TIMEOUT_MS } from "@/constants/Jellyfin";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import {
  getAccountCredential,
  getPreviousServers,
} from "@/utils/secureCredentials";

interface SessionToEnd {
  jellyfin: Jellyfin;
  /** The address the session runs on, which can be the local one. */
  serverUrl: string;
  token: string;
  userId?: string;
}

// The last session end queued, which a sign-in waits for.
let ending: Promise<void> = Promise.resolve();

/**
 * Whether a saved account signs in again with this very token. One with no
 * protection or a PIN does; one with a password asks for it and gets a new
 * token. Looked up under every address the account is listed under: the
 * session can run on another one than it was saved on, the local one at home.
 */
async function savedAccountSignsInWith(
  userId: string,
  token: string,
): Promise<boolean> {
  for (const server of getPreviousServers()) {
    if (!server.accounts?.some((account) => account.userId === userId)) {
      continue;
    }
    const saved = await getAccountCredential(server.address, userId);
    if (saved?.token === token && saved.securityType !== "password") {
      return true;
    }
  }
  return false;
}

/**
 * Ends a session the app signed out of on the server as well, so its token
 * stops working there. Without it the token stays valid until an admin removes
 * the device, however long the app has forgotten it.
 *
 * A saved account that signs in again with this token keeps it: ending it
 * would make the account ask for its password the next time.
 *
 * Never throws: the sign-out has already happened on the device, and the
 * server being out of reach must not undo it. A token the server revoked
 * already counts as ended.
 */
export async function endSessionOnServer({
  jellyfin,
  serverUrl,
  token,
  userId,
}: SessionToEnd): Promise<void> {
  try {
    if (userId && (await savedAccountSignsInWith(userId, token))) return;

    // An api of its own: the session's one answers a 401 by signing out the
    // session current by then, which can already be the next one.
    const api = createApiWithCustomHeaders(jellyfin, serverUrl, token);
    await getSessionApi(api).reportSessionEnded({
      timeout: SIGN_OUT_SESSION_END_TIMEOUT_MS,
    });
    writeInfoLog("Ended the session on the server");
  } catch (error) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;
    if (status === 401) {
      writeInfoLog("The session was already ended on the server");
      return;
    }
    // The status alone: an axios error carries the request, token included.
    const reason = status
      ? `HTTP ${status}`
      : axios.isAxiosError(error)
        ? (error.code ?? "no response")
        : error instanceof Error
          ? error.message
          : "unknown error";
    writeErrorLog(`Failed to end the session on the server: ${reason}`);
  }
}

/**
 * Ends the session once `after` settles, without holding up the sign-out.
 */
export function endSessionOnServerAfter(
  after: Promise<unknown>,
  session: SessionToEnd,
): void {
  const end = () => endSessionOnServer(session);
  ending = after.then(end, end);
}

/**
 * Settles once the session end last queued has. The server ends every session
 * of the device when it ends one, so a sign-in waits for an end still on its
 * way, which would end the session it opens as well. A Quick Connect sign-in
 * needs an approval from another device first, which takes longer than that.
 */
export const sessionEndsSettled = (): Promise<void> => ending;
