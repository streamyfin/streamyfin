import { useActionSheet } from "@expo/react-native-action-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { syncPlayQueueIds } from "@/utils/syncplay/queueItems";
import type { SyncPlayQueueMode } from "@/utils/syncplay/types";

interface Props {
  /** One video, or the episodes of a season or a show, in order. */
  items: (BaseItemDto | null | undefined)[];
  /** Round like the buttons beside Play, or a bare icon for a toolbar row. */
  variant?: "round" | "icon";
  /** Tints the round button like its neighbours. */
  color?: string;
  iconColor?: string;
  /**
   * Space to the next control. A prop and not a style: a row that spaces its
   * children (`space-x-*`) hands each of them a style with its margin, which
   * would add to the gap the row already has before this button.
   */
  trailingGap?: number;
}

/**
 * Adds what the page shows to the group's queue. Only there in a group:
 * outside one there is no queue to add to.
 */
export function SyncPlayQueueButton({
  items,
  variant = "round",
  color = "#262626",
  iconColor = "white",
  trailingGap = 0,
}: Props) {
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const isOffline = useOfflineMode();
  const { enabled, connected, busy, queueItems } = useSyncPlay();
  const ids = syncPlayQueueIds(items);

  if (!enabled || isOffline || ids.length === 0) return null;

  const add = (mode: SyncPlayQueueMode) =>
    void queueItems(ids, mode)
      .then(() => toast.success(t("syncplay.added_to_queue")))
      .catch(() => toast.error(t("syncplay.errors.request_failed")));

  const choose = () =>
    showActionSheetWithOptions(
      {
        options: [
          t("syncplay.play_next"),
          t("syncplay.add_to_queue"),
          t("common.cancel"),
        ],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) add("QueueNext");
        if (index === 1) add("Queue");
      },
    );

  const icon = (
    <MaterialCommunityIcons
      name='playlist-plus'
      size={variant === "round" ? 26 : 22}
      color={iconColor}
    />
  );

  return (
    <TouchableOpacity
      testID='syncplay-queue-add'
      accessibilityRole='button'
      accessibilityLabel={t("syncplay.add_to_queue")}
      disabled={!connected || busy}
      onPress={choose}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      className='relative'
      style={{ marginRight: trailingGap }}
    >
      {variant === "round" ? (
        <>
          <View
            style={{ backgroundColor: color, opacity: 0.7 }}
            className='absolute w-12 h-12 rounded-full'
          />
          <View className='w-12 h-12 rounded-full z-10 items-center justify-center'>
            {icon}
          </View>
        </>
      ) : (
        icon
      )}
    </TouchableOpacity>
  );
}
