import type { FC } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { Text } from "@/components/common/Text";

export type AutoSubtitleNoticeKind = "enabled" | "restart-required" | "none";

const VISIBLE_MS = 2500;

const MESSAGE_KEY: Record<AutoSubtitleNoticeKind, string> = {
  enabled: "player.auto_subtitles_enabled",
  "restart-required": "player.auto_subtitles_restart_required",
  none: "player.auto_subtitles_none",
};

/**
 * Transient explanation of what the automatic subtitle feature just did, or why
 * it could not act.
 *
 * Purely informational: no pressable and no focusable child, so it can never
 * steal or trap TV focus while the player controls are up.
 */
export const AutoSubtitleNotice: FC<{
  notice: AutoSubtitleNoticeKind | null;
  onDismiss: () => void;
}> = ({ notice, onDismiss }) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  return (
    <View
      pointerEvents='none'
      style={{
        position: "absolute",
        alignSelf: "center",
        bottom: Platform.isTV ? 160 : 120,
        maxWidth: "80%",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: "rgba(0,0,0,0.75)",
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: Platform.isTV ? 20 : 14,
          textAlign: "center",
        }}
      >
        {t(MESSAGE_KEY[notice])}
      </Text>
    </View>
  );
};
