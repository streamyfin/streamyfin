/**
 * The parts of the SyncPlay harness that do not need a live server, kept apart from
 * controller-integration.ts so that specs can import them: that script runs on import.
 */

import type { Api } from "@jellyfin/sdk";
import {
  getAuthenticationApi,
  getSessionApi,
  getUserApi,
} from "@jellyfin/sdk/lib/utils/api";
import axios from "axios";

/**
 * How long one request to the server may take. Axios waits for ever by default, so a server
 * that took the connection and never answered held the run, and its cleanup, for good.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** The axios instance every harness client talks to the server through. */
export const harnessAxios = () => axios.create({ timeout: REQUEST_TIMEOUT_MS });

/** A harness client, signed in under its own device id. */
export interface SignedInClient {
  readonly name: string;
  readonly api: Api;
}

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Signs a harness client in, and hands it to `signedIn` as soon as it holds a token: the
 * capabilities post after it may still fail, and the cleanup signs out every token of the run.
 */
export async function signIn(
  name: string,
  api: Api,
  account: { readonly name: string; readonly password: string },
  signedIn: SignedInClient[],
): Promise<void> {
  // SDK 1.0 moved the sign-in from the user API to the authentication API.
  const response = await getAuthenticationApi(api).authenticateUserByName({
    authenticateUserByName: { Username: account.name, Pw: account.password },
  });
  api.update({ accessToken: response.data.AccessToken ?? "" });
  signedIn.push({ name, api });
  await getSessionApi(api).postFullCapabilities({
    clientCapabilitiesDto: {
      PlayableMediaTypes: ["Video"],
      SupportsMediaControl: true,
      SupportedCommands: ["Play"],
    },
  });
}

/**
 * The item codes must name as many movies: the next and previous waits match on the item id, so a
 * movie tagged with two of the codes would let them pass before playback moved.
 */
export function assertDistinctMovies(
  items: readonly { readonly id: string; readonly name: string }[],
  codes: readonly string[],
): void {
  items.forEach((item, index) => {
    const first = items.findIndex((other) => other.id === item.id);
    if (first !== index) {
      throw new Error(
        `${codes[first]} and ${codes[index]} tag the same movie, ${item.name}; tag a different movie with each code`,
      );
    }
  });
}

/**
 * The requests that leave something on the server, a token or an account, while they run. The
 * cleanup reads which tokens and which account to remove, so it settles them first: a Ctrl-C
 * while the restricted account was being created read no id, and the account outlived the run.
 * Once the cleanup has started, no new work begins.
 */
export const serverWork = () => {
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  return {
    track<T>(work: () => Promise<T>): Promise<T> {
      if (closed) {
        return Promise.reject(new Error("the run is cleaning up"));
      }
      const running = work();
      pending.add(running);
      const forget = () => pending.delete(running);
      running.then(forget, forget);
      return running;
    },
    async settle(): Promise<void> {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  };
};

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
  stepTimeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string[]> {
  const failures: string[] = [];
  // Each step has its own deadline, whatever client it goes through: one request left
  // unanswered must not keep the steps after it from running.
  const attempt = async (what: string, work: () => Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer after ${stepTimeoutMs} ms`)),
        stepTimeoutMs,
      );
    });
    try {
      await Promise.race([work(), deadline]);
    } catch (error) {
      failures.push(`${what}: ${reason(error)}`);
    } finally {
      clearTimeout(timer);
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
 * and the restricted account behind; the handler runs the same cleanup, says what it could not
 * clean up, as the run's own `finally` does, then exits as SIGINT would.
 */
export const interruptHandler =
  (cleanUpRun: () => Promise<unknown>, exit: (code: number) => void) =>
  (): void => {
    process.stderr.write("Interrupted: cleaning up the run before exiting\n");
    void cleanUpRun()
      .then(
        (failures) => {
          if (!Array.isArray(failures)) return;
          for (const failure of failures) {
            process.stderr.write(`FAIL cleanup ${failure}\n`);
          }
        },
        (error) => {
          process.stderr.write(`FAIL cleanup ${reason(error)}\n`);
        },
      )
      .finally(() => exit(130));
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
