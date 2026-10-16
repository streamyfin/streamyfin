import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { QUICK_CONNECT_POLL_INTERVAL_MS } from "@/constants/QuickConnect";

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
}

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
        { headers },
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
      setStatus("waiting");

      const schedule = () => {
        if (isCurrent(attempt)) {
          attempt.timer = setTimeout(() => {
            void poll();
          }, QUICK_CONNECT_POLL_INTERVAL_MS);
        }
      };

      const poll = async () => {
        if (!isCurrent(attempt)) return;
        try {
          const pollResponse = await api.axiosInstance.get(
            `${api.basePath}/QuickConnect/Connect?Secret=${encodeURIComponent(Secret)}`,
          );
          if (!isCurrent(attempt)) return;
          if (pollResponse.status === 200 && pollResponse.data.Authenticated) {
            setStatus("authenticating");
            const authResponse = await api.axiosInstance.post(
              `${api.basePath}/Users/AuthenticateWithQuickConnect`,
              { secret: Secret },
              { headers },
            );
            if (!isCurrent(attempt)) return;

            // Committing replaces the API and unmounts the login screen. End
            // this attempt first so that cleanup cannot undo the signed-in state
            // or make a slow plugin refresh authenticate the same code twice.
            cancelAttempt();
            setStatus("signed-in");
            try {
              await onAuthenticatedRef.current(authResponse.data, api);
            } catch {
              // Never retry an already committed session or log its credentials.
              console.error("Failed to finish Quick Connect sign-in");
            }
            return;
          }
        } catch (error) {
          if (!isCurrent(attempt)) return;
          const status = axios.isAxiosError(error)
            ? error.response?.status
            : undefined;
          if (status === 400 || status === 404 || status === 401) {
            cancelAttempt();
            setStatus(status === 401 ? "disabled" : "expired");
            return;
          }
          // Network errors and temporary server failures leave the code valid.
          // A timer-driven request must not reject into the event loop.
          setStatus("waiting");
        }
        // Schedule after the previous request settles: a slow response must not
        // overlap another poll or exchange the same secret more than once.
        schedule();
      };

      schedule();
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
