import { useCallback, useRef } from "react";
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
  label,
  hint,
  placeholder,
  editable = true,
  resolveOptions,
}: ServerUrlFieldProps) {
  const resolver = useServerUrlResolver(probe, resolveOptions);
  const lastResolvedInput = useRef<string | null>(null);

  const runResolve = useCallback(async () => {
    const input = value.trim();
    if (!input) {
      resolver.reset();
      lastResolvedInput.current = null;
      return;
    }
    lastResolvedInput.current = input;
    const result = await resolver.resolve(input);
    if (result.ok) {
      onChangeText(result.url); // adopt the canonical URL into the field
      onResolved?.(result.url, result.meta);
    }
  }, [value, resolver, onChangeText, onResolved]);

  const handleBlur = useCallback(() => {
    const input = value.trim();
    if (input && input !== lastResolvedInput.current) runResolve();
  }, [value, runResolve]);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);
      // Editing invalidates a previous result; drop the stale status.
      if (resolver.status !== "idle") resolver.reset();
      lastResolvedInput.current = null;
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
