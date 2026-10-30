/**
 * The parts of the SyncPlay harness that do not need a live server, kept apart from
 * controller-integration.ts so that specs can import them: that script runs on import.
 */

import type { Api } from "@jellyfin/sdk";
import { getSessionApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";

/** A harness client, signed in under its own device id. */
export interface SignedInClient {
  readonly name: string;
  readonly api: Api;
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Ends what a run leaves on the server: a token stays valid until it is signed out, so every run
 * used to leave its clients' tokens behind, an administrator's among them, and a failed delete of
 * the restricted account went unnoticed. The administrator signs out last, since the delete needs
 * its token. Returns what could not be cleaned up, for the caller to report.
 */
export async function cleanUp(
  clients: readonly SignedInClient[],
  admin: Api | undefined,
  temporaryUserId: string | undefined,
): Promise<string[]> {
  const failures: string[] = [];
  const attempt = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      failures.push(`${what}: ${reason(error)}`);
    }
  };
  for (const client of clients.filter((client) => client.api !== admin)) {
    await attempt(`sign out ${client.name}`, () =>
      getSessionApi(client.api).reportSessionEnded(),
    );
  }
  if (admin && temporaryUserId) {
    await attempt(`delete the restricted account ${temporaryUserId}`, () =>
      getUserApi(admin).deleteUser({ userId: temporaryUserId }),
    );
  }
  for (const client of clients.filter((client) => client.api === admin)) {
    await attempt(`sign out ${client.name}`, () =>
      getSessionApi(client.api).reportSessionEnded(),
    );
  }
  return failures;
}

/**
 * What Ctrl-C runs. Bun exits on SIGINT without running `finally` blocks, which left the tokens
 * and the restricted account behind; the handler runs the same cleanup, then exits as SIGINT would.
 */
export const interruptHandler =
  (cleanUpRun: () => Promise<unknown>, exit: (code: number) => void) =>
  (): void => {
    process.stderr.write("Interrupted: cleaning up the run before exiting\n");
    void cleanUpRun().finally(() => exit(130));
  };

/**
 * The SyncPlay endpoint a response came from, as the coverage step names it, or null. A server
 * behind a sub-path answers under that path (/jellyfin/SyncPlay/New), so it is stripped first.
 */
export const syncPlayEndpoint = (
  url: string,
  serverUrl: string,
): string | null => {
  const base = new URL(serverUrl).pathname.replace(/\/+$/, "");
  let pathname = new URL(url, serverUrl).pathname;
  if (base && pathname.startsWith(`${base}/`)) {
    pathname = pathname.slice(base.length);
  }
  if (!pathname.startsWith("/SyncPlay/")) return null;
  return /^\/SyncPlay\/[0-9a-f-]{32,36}$/i.test(pathname)
    ? "/SyncPlay/{id}"
    : pathname;
};
