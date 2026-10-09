import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useTranslation } from "react-i18next";
import { HeaderButton } from "@/components/common/HeaderButton";
import { useSyncPlaySheet } from "@/hooks/useSyncPlaySheet";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { syncPlayQueueIds } from "@/utils/syncplay/queueItems";

interface Props {
  /** What this page shows: a video, or the episodes of a season or show. */
  items?: (BaseItemDto | null | undefined)[];
  title?: string | null;
}

/**
 * Header entry to SyncPlay, lit while in a group. A group started from a
 * page takes what that page shows as its queue. Nothing plays until someone
 * presses Play.
 */
export function SyncPlayButton({ items, title }: Props) {
  const { t } = useTranslation();
  const openSyncPlay = useSyncPlaySheet();
  const { group, available } = useSyncPlay();

  if (!available) return null;
  return (
    <HeaderButton
      testID='syncplay-open'
      accessibilityRole='button'
      accessibilityLabel={t("syncplay.title")}
      accessibilityHint={t("syncplay.description")}
      onPress={() => {
        const ids = syncPlayQueueIds(items ?? []);
        openSyncPlay(ids.length ? { ids, title: title ?? "" } : undefined);
      }}
    >
      <Ionicons
        name={group ? "people" : "people-outline"}
        size={24}
        color={group ? "#c084fc" : "white"}
      />
    </HeaderButton>
  );
}
