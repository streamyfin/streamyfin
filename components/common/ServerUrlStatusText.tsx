import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import type { ServerUrlResolverState } from "@/hooks/useServerUrlResolver";
import { Text } from "./Text";

/**
 * Compact status line for the server-URL resolver, for screens whose layout
 * (e.g. ListItem rows) doesn't fit the full `ServerUrlField`. Renders nothing
 * while idle.
 */
export function ServerUrlStatusText({
  state,
  className = "",
}: {
  state: ServerUrlResolverState;
  className?: string;
}) {
  const { t } = useTranslation();

  if (state.status === "idle") return null;

  if (state.status === "resolving") {
    return (
      <View className={`flex-row items-center ${className}`}>
        <ActivityIndicator size='small' color='#9ca3af' />
        <Text className='text-xs text-neutral-400 ml-2'>
          {t("server_url.resolving")}
        </Text>
      </View>
    );
  }

  if (state.status === "ok") {
    return (
      <Text className={`text-xs text-green-500 ${className}`}>
        {t("server_url.resolved", { url: state.resolvedUrl })}
      </Text>
    );
  }

  const message =
    state.reason === "wrong-service"
      ? t("server_url.wrong_service")
      : state.reason === "invalid" || state.reason === "empty"
        ? t("server_url.invalid_url")
        : t("server_url.unreachable");

  return <Text className={`text-xs text-red-500 ${className}`}>{message}</Text>;
}
