import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import type { ServerUrlResolverState } from "@/hooks/useServerUrlResolver";
import { Text } from "./Text";

/**
 * Compact status line for the server-URL resolver, for screens whose layout
 * (e.g. ListItem rows) doesn't fit the full `ServerUrlField`. Renders nothing
 * while idle.
 */
export function ServerUrlStatusText({
  state,
  style,
}: {
  state: ServerUrlResolverState;
  /**
   * Spacing from the caller. NativeWind resolves a `className` written on
   * this component into `style` before the props get here, so `style` is the
   * one to read: reading `className` left every caller's margin and padding
   * unapplied.
   */
  style?: StyleProp<ViewStyle & TextStyle>;
  className?: string;
}) {
  const { t } = useTranslation();

  if (state.status === "idle") return null;

  if (state.status === "resolving") {
    return (
      <View style={style} className='flex-row items-center'>
        <ActivityIndicator size='small' color='#9ca3af' />
        <Text className='text-xs text-neutral-400 ml-2'>
          {t("server_url.resolving")}
        </Text>
      </View>
    );
  }

  if (state.status === "ok") {
    return (
      <Text style={style} className='text-xs text-green-500'>
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

  return (
    <Text style={style} className='text-xs text-red-500'>
      {message}
    </Text>
  );
}
