import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUICK_CONNECT_CODE_LIFETIME_MS,
  QUICK_CONNECT_POLL_INTERVAL_MS,
  QUICK_CONNECT_REQUEST_TIMEOUT_MS,
} from "@/constants/QuickConnect";
import { writeErrorLog } from "@/utils/log";

export type QuickConnectStatus =
  | "idle"
  | "waiting"
  | "authenticating"
  | "expired"
  | "disabled"
  | "signed-in";

interface AuthenticationResult {
  AccessToken: string;
  User: UserDto;
}

interface Options {
  api: Api | null;
  headers: Record<string, string>;
  onAuthenticated: (
    result: AuthenticationResult,
    sourceApi: Api,
  ) => void | Promise<void>;
}

interface Attempt {
  api: Api;
  timer?: ReturnType<typeof setTimeout>;
  /** When the server stops honouring the code. */
  endsAt?: number;
  /** A failure that is not an HTTP answer was logged; once is enough. */
  reported?: boolean;
}

/**
 * What an HTTP answer means for the code: 400 and 404, the server no longer
 * knows it; 401, Quick Connect is turned off. Anything else may pass.
 */
const outcomeOf = (error: unknown): QuickConnectStatus | undefined => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) return "disabled";
  if (status === 400 || status === 404) return "expired";
  return undefined;
};

/** A sign-in answer the session can be built from. */
const isAuthenticationResult = (data: unknown): data is AuthenticationResult =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as AuthenticationResult).AccessToken === "string" &&
  (data as AuthenticationResult).AccessToken.length > 0 &&
  typeof (data as AuthenticationResult).User?.Id === "string";

/** One code owns its polling and authentication, even across late responses. */
export function useQuickConnect({ api, headers, onAuthenticated }: Options) {
  const [quickConnectStatus, setStatus] = useState<QuickConnectStatus>("idle");
  const attemptRef = useRef<Attempt | null>(null);
  const apiRef = useRef(api);
  const onAuthenticatedRef = useRef(onAuthenticated);
  apiRef.current = api;
  onAuthenticatedRef.current = onAuthenticated;

  const cancelAttempt = useCallback(() => {
    if (attemptRef.current) clearTimeout(attemptRef.current.timer);
    attemptRef.current = null;
  }, []);

  const isCurrent = useCallback(
    (attempt: Attempt) =>
      attemptRef.current === attempt && apiRef.current === attempt.api,
    [],
  );

  const stopQuickConnectPolling = useCallback(() => {
    cancelAttempt();
    setStatus("idle");
  }, [cancelAttempt]);

  useEffect(() => {
    if (attemptRef.current && attemptRef.current.api !== api) {
      stopQuickConnectPolling();
    }
  }, [api, stopQuickConnectPolling]);

  useEffect(() => cancelAttempt, [cancelAttempt]);

  const initiateQuickConnect = useCallback(async () => {
    cancelAttempt();
    if (!api) return;
    const attempt: Attempt = { api };
    attemptRef.current = attempt;

    try {
      const response = await api.axiosInstance.post(
        `${api.basePath}/QuickConnect/Initiate`,
        null,
        { headers, timeout: QUICK_CONNECT_REQUEST_TIMEOUT_MS },
      );
      if (!isCurrent(attempt)) return;
      const { Code, Secret } = response.data;
      if (
        response.status !== 200 ||
        typeof Code !== "string" ||
        !Code ||
        typeof Secret !== "string" ||
        !Secret
      ) {
        throw new Error("Failed to initiate quick connect");
      }
      attempt.endsAt = Date.now() + QUICK_CONNECT_CODE_LIFETIME_MS;
      setStatus("waiting");

      // Ends the attempt on an answer that decides the code's fate, and
      // otherwise says whether to try again.
      const settle = (error: unknown) => {
        const outcome = outcomeOf(error);
        if (outcome) {
          cancelAttempt();
          setStatus(outcome);
          return false;
        }
        // Not an HTTP answer at all, so possibly a bug rather than a network.
        if (!axios.isAxiosError(error) && !attempt.reported) {
          attempt.reported = true;
          writeErrorLog("Quick Connect request failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // Network errors and temporary server failures leave the code valid.
        return true;
      };

      // The server drops the code at the end of its lifetime: rather than ask
      // again then, the attempt ends as expired, whatever kept it going.
      const expireIfOver = () => {
        if (Date.now() < (attempt.endsAt ?? 0)) return false;
        cancelAttempt();
        setStatus("expired");
        return true;
      };

      // Schedule after the previous request settles: a slow response must not
      // overlap another request or exchange the same secret more than once.
      const retry = (step: () => Promise<void>) => {
        if (!isCurrent(attempt) || expireIfOver()) return;
        attempt.timer = setTimeout(() => {
          if (isCurrent(attempt) && !expireIfOver()) void step();
        }, QUICK_CONNECT_POLL_INTERVAL_MS);
      };

      const authenticate = async () => {
        if (!isCurrent(attempt)) return;
        try {
          const authResponse = await api.axiosInstance.post(
            `${api.basePath}/Users/AuthenticateWithQuickConnect`,
            { secret: Secret },
            { headers, timeout: QUICK_CONNECT_REQUEST_TIMEOUT_MS },
          );
          if (!isCurrent(attempt)) return;
          // Not a session, a proxy's own page for one: asking again would get
          // the same answer.
          if (!isAuthenticationResult(authResponse.data)) {
            cancelAttempt();
            setStatus("expired");
            writeErrorLog("Quick Connect sign-in answered without a session");
            return;
          }

          // Committing replaces the API and unmounts the login screen. End
          // this attempt first so that cleanup cannot undo the signed-in state
          // or make a slow plugin refresh authenticate the same code twice.
          cancelAttempt();
          setStatus("signed-in");
          try {
            await onAuthenticatedRef.current(authResponse.data, api);
          } catch {
            // Never retry an already committed session or log its credentials.
            writeErrorLog("Failed to finish Quick Connect sign-in");
          }
        } catch (error) {
          if (!isCurrent(attempt)) return;
          // The server approved the code: try the sign-in itself again, without
          // going back to the code or through Connect.
          if (settle(error)) retry(authenticate);
        }
      };

      const poll = async () => {
        if (!isCurrent(attempt)) return;
        try {
          const pollResponse = await api.axiosInstance.get(
            `${api.basePath}/QuickConnect/Connect?Secret=${encodeURIComponent(Secret)}`,
            { timeout: QUICK_CONNECT_REQUEST_TIMEOUT_MS },
          );
          if (!isCurrent(attempt)) return;
          if (pollResponse.status === 200 && pollResponse.data.Authenticated) {
            setStatus("authenticating");
            await authenticate();
            return;
          }
        } catch (error) {
          if (!isCurrent(attempt)) return;
          if (!settle(error)) return;
        }
        retry(poll);
      };

      retry(poll);
      return Code;
    } catch (error) {
      // Back, another server, or a replacement code also invalidates failures.
      if (!isCurrent(attempt)) return;
      cancelAttempt();
      throw error;
    }
  }, [api, headers, cancelAttempt, isCurrent]);

  return { initiateQuickConnect, stopQuickConnectPolling, quickConnectStatus };
}
