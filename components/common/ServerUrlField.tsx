import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import { useServerUrlResolver } from "@/hooks/useServerUrlResolver";
import type { ResolveOptions } from "@/utils/serverUrl/resolve";
import type { ServerProbe } from "@/utils/serverUrl/types";
import { Input } from "./Input";
import { ServerUrlStatusText } from "./ServerUrlStatusText";
import { Text } from "./Text";

interface ServerUrlFieldProps {
  /** Raw user input (controlled). */
  value: string;
  onChangeText: (text: string) => void;
  /** Service-specific validator. Pass a stable (module-level) reference. */
  probe: ServerProbe;
  /** Called with the canonical URL once a candidate validates. */
  onResolved?: (url: string, meta?: Record<string, unknown>) => void;
  /**
   * Called after a blur/submit resolution attempt with the URL to persist:
   * the canonical URL when resolution succeeded, the raw trimmed input when
   * the server merely didn't answer (so a URL can still be saved while its
   * server is unreachable, e.g. a LAN address configured from elsewhere).
   * Not called for unparseable input nor superseded (cancelled) attempts.
   */
  onCommit?: (url: string, resolved: boolean) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  editable?: boolean;
  resolveOptions?: ResolveOptions;
}

/**
 * Unified server-URL input: the user types a loose address (`media.example.com`,
 * `https://…`, `host:port`); on blur it auto-resolves via the given probe,
 * adopts the canonical URL into the field, and persists it. A small status line
 * (checking / resolved / error) shows underneath.
 */
export function ServerUrlField({
  value,
  onChangeText,
  probe,
  onResolved,
  onCommit,
  label,
  hint,
  placeholder,
  editable = true,
  resolveOptions,
}: ServerUrlFieldProps) {
  const resolver = useServerUrlResolver(probe, resolveOptions);
  const lastResolvedInput = useRef<string | null>(null);
  // Input of the most recent attempt; unlike lastResolvedInput it survives a
  // failure, so the effect below can tell an external value replacement apart
  // from a same-input retry (whose error status must keep showing).
  const lastAttemptInput = useRef<string | null>(null);
  const latestValue = useRef(value);
  // Synced after commit instead of during render: a discarded concurrent
  // render must not leak its value into the stale-resolution guard.
  useLayoutEffect(() => {
    latestValue.current = value;
  }, [value]);

  // The owning screen can replace `value` without going through handleChange
  // (e.g. LocalNetworkSettings loading another server's config). A previous
  // result or in-flight resolution then belongs to the old value: drop the
  // status and abort so nothing stale is adopted or committed.
  useEffect(() => {
    if (
      resolver.status !== "idle" &&
      value.trim() !== lastAttemptInput.current
    ) {
      resolver.reset();
      lastResolvedInput.current = null;
      lastAttemptInput.current = null;
    }
  }, [value, resolver]);

  const runResolve = useCallback(async () => {
    const input = value.trim();
    if (!input) {
      resolver.reset();
      lastResolvedInput.current = null;
      lastAttemptInput.current = null;
      onCommit?.("", false); // clearing the field is a commit too
      return;
    }
    lastResolvedInput.current = input;
    lastAttemptInput.current = input;
    const result = await resolver.resolve(input);
    // Superseded by an external value replacement while in flight: the
    // resolver was aborted by the effect above, but a candidate that had
    // already validated could still surface here. Never adopt it.
    if (latestValue.current.trim() !== input) return;
    if (result.ok) {
      // Remember the canonical URL so the blur following its adoption
      // below doesn't trigger a redundant re-resolve, and so the external
      // replacement effect doesn't mistake the adoption for one.
      lastResolvedInput.current = result.url;
      lastAttemptInput.current = result.url;
      onChangeText(result.url); // adopt the canonical URL into the field
      onResolved?.(result.url, result.meta);
      onCommit?.(result.url, true);
      return;
    }
    if (result.reason === "cancelled") return; // superseded by newer input
    // Allow the next blur on the same input to retry (transient failures);
    // guard against a newer attempt having already claimed the ref.
    if (lastResolvedInput.current === input) lastResolvedInput.current = null;
    // Unreachable input is still worth persisting (the server may simply be
    // unreachable from here right now); unparseable input is not.
    if (result.reason !== "invalid") onCommit?.(input, false);
  }, [value, resolver, onChangeText, onResolved, onCommit]);

  const handleBlur = useCallback(() => {
    const input = value.trim();
    if (!input || input !== lastResolvedInput.current) runResolve();
  }, [value, runResolve]);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);
      // Editing invalidates a previous result; drop the stale status.
      if (resolver.status !== "idle") resolver.reset();
      lastResolvedInput.current = null;
      lastAttemptInput.current = null;
    },
    [onChangeText, resolver],
  );

  return (
    <View>
      {label ? <Text className='font-bold mb-1'>{label}</Text> : null}
      {hint ? <Text className='text-xs text-gray-500 mb-2'>{hint}</Text> : null}

      <Input
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        onSubmitEditing={runResolve}
        placeholder={placeholder}
        editable={editable}
        extraClassName='border border-neutral-800'
        keyboardType='url'
        autoCapitalize='none'
        autoCorrect={false}
        returnKeyType='go'
        textContentType='URL'
        clearButtonMode='never'
      />

      <ServerUrlStatusText state={resolver} className='mt-2' />
    </View>
  );
}
