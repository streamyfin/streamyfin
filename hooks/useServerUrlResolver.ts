import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ResolveFailureReason,
  type ResolveOptions,
  type ResolveResult,
  resolveServerUrl,
} from "@/utils/serverUrl/resolve";
import type { ServerProbe } from "@/utils/serverUrl/types";

export type ServerUrlResolverState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "ok"; resolvedUrl: string; meta?: Record<string, unknown> }
  | { status: "error"; reason: ResolveFailureReason };

/**
 * Stateful wrapper around `resolveServerUrl` for screens.
 *
 * `resolve(input)` cancels any in-flight resolution, drives the state machine
 * (idle → resolving → ok | error) and returns the raw result. Pass a stable
 * (module-level) probe; memoize `options` if you supply one.
 */
export function useServerUrlResolver(
  probe: ServerProbe,
  options?: ResolveOptions,
) {
  const [state, setState] = useState<ServerUrlResolverState>({
    status: "idle",
  });
  const abortRef = useRef<AbortController | null>(null);

  const resolve = useCallback(
    async (input: string): Promise<ResolveResult> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: "resolving" });

      const result = await resolveServerUrl(input, probe, {
        ...options,
        signal: controller.signal,
      });

      // Superseded/cancelled resolution: a candidate may have validated
      // before the abort landed, so the raw result can still be `ok`.
      // Report "cancelled" instead so no caller adopts a stale URL over
      // newer input, and leave the state to the newer resolution.
      if (controller.signal.aborted) {
        return { ok: false, reason: "cancelled" };
      }

      setState(
        result.ok
          ? { status: "ok", resolvedUrl: result.url, meta: result.meta }
          : { status: "error", reason: result.reason },
      );
      return result;
    },
    [probe, options],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, resolve, reset };
}
