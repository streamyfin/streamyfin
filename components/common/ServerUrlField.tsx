import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
  type ServerUrlResolverState,
  useServerUrlResolver,
} from "@/hooks/useServerUrlResolver";
import type {
  ResolveFailureReason,
  ResolveOptions,
} from "@/utils/serverUrl/resolve";
import type { ServerProbe } from "@/utils/serverUrl/types";
import { Input } from "./Input";
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
  /** Shown in the "version too low" message. */
  minVersion?: string;
  editable?: boolean;
  resolveOptions?: ResolveOptions;
}

function errorMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  reason: ResolveFailureReason,
  version?: string,
  minVersion?: string,
): string {
  switch (reason) {
    case "version-too-low":
      return t("server_url.version_too_low", {
        version: version ?? "?",
        min: minVersion ?? "",
      });
    case "wrong-service":
      return t("server_url.wrong_service");
    case "invalid":
      return t("server_url.invalid_url");
    default:
      return t("server_url.unreachable");
  }
}

/**
 * Unified server-URL input: the user types a loose address (`media.example.com`,
 * `https://…`, `host:port`), it auto-resolves on blur via the given probe and
 * persists the canonical URL. Inline status chip (tap to re-test) + resolved URL.
 */
export function ServerUrlField({
  value,
  onChangeText,
  probe,
  onResolved,
  label,
  hint,
  placeholder,
  minVersion,
  editable = true,
  resolveOptions,
}: ServerUrlFieldProps) {
  const { t } = useTranslation();
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
    if (result.ok) onResolved?.(result.url, result.meta);
  }, [value, resolver, onResolved]);

  const handleBlur = useCallback(() => {
    const input = value.trim();
    if (input && input !== lastResolvedInput.current) runResolve();
  }, [value, runResolve]);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);
      // Editing invalidates a previous result; drop the stale chip.
      if (resolver.status !== "idle") resolver.reset();
      lastResolvedInput.current = null;
    },
    [onChangeText, resolver],
  );

  return (
    <View>
      {label ? <Text className='font-bold mb-1'>{label}</Text> : null}
      {hint ? <Text className='text-xs text-gray-500 mb-2'>{hint}</Text> : null}

      <View className='relative justify-center'>
        <Input
          value={value}
          onChangeText={handleChange}
          onBlur={handleBlur}
          onSubmitEditing={runResolve}
          placeholder={placeholder}
          editable={editable}
          extraClassName='pr-12 border border-neutral-800'
          keyboardType='url'
          autoCapitalize='none'
          autoCorrect={false}
          returnKeyType='done'
          textContentType='URL'
          clearButtonMode='never'
        />
        <View className='absolute right-3 top-0 bottom-0 justify-center'>
          <StatusChip state={resolver} onRetry={runResolve} />
        </View>
      </View>

      {resolver.status === "ok" ? (
        <Text className='text-xs text-green-500 mt-2'>
          {t("server_url.resolved", { url: resolver.resolvedUrl })}
        </Text>
      ) : null}
      {resolver.status === "error" ? (
        <Text className='text-xs text-red-500 mt-2'>
          {errorMessage(t, resolver.reason, resolver.version, minVersion)}
        </Text>
      ) : null}
    </View>
  );
}

function StatusChip({
  state,
  onRetry,
}: {
  state: ServerUrlResolverState;
  onRetry: () => void;
}) {
  if (state.status === "resolving") {
    return <ActivityIndicator size='small' color='#9ca3af' />;
  }

  if (state.status === "ok") {
    const scheme = state.resolvedUrl.startsWith("https") ? "https" : "http";
    return (
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        className='flex-row items-center'
      >
        <Ionicons name='checkmark-circle' size={18} color='#22c55e' />
        <Text className='text-xs text-green-500 ml-1'>{scheme}</Text>
      </Pressable>
    );
  }

  if (state.status === "error") {
    return (
      <Pressable onPress={onRetry} hitSlop={8}>
        <Ionicons name='refresh' size={18} color='#f59e0b' />
      </Pressable>
    );
  }

  return null;
}
