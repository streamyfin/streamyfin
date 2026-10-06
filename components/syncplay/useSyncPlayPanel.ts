import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { userAtom } from "@/providers/JellyfinProvider";
import { type SyncPlayGroup, useSyncPlay } from "@/providers/SyncPlayProvider";
import type { SyncPlaySeed } from "@/utils/syncplay/types";

/** A group that is not idle opens the player on whoever joins it. */
export const syncPlayGroupIsPlaying = (entry: SyncPlayGroup) =>
  !!entry.State && entry.State !== "Idle";

/**
 * What the SyncPlay sheet does, whatever draws it: the phone sheet
 * (SyncPlayPanel) and the TV one (TVSyncPlaySheet) differ in layout only.
 */
export function useSyncPlayPanel(seed?: SyncPlaySeed | null) {
  const { t } = useTranslation();
  const user = useAtomValue(userAtom);
  const sync = useSyncPlay();
  const { group, groups, groupState, supported, connected } = sync;
  const { refreshGroups } = sync;
  // A group started from a page takes that page as its queue, once the
  // server has made the group. Someone else's group keeps its own queue.
  const [seedWhenJoined, setSeedWhenJoined] = useState(false);
  // In a group, the list of the others is one step away.
  const [switching, setSwitching] = useState(false);
  const available = supported && connected;
  const seeded = !!seed?.ids.length;

  // On opening, and whenever this device joins or leaves: the list it has
  // still counts it in the group it just left.
  const groupId = group?.GroupId;
  useEffect(() => {
    if (available) void refreshGroups().catch(() => {});
  }, [available, refreshGroups, groupId]);

  useEffect(() => {
    if (!seedWhenJoined || !group) return;
    setSeedWhenJoined(false);
    if (seed?.ids.length)
      void sync.queueItems(seed.ids, "Queue").catch(() => {});
  }, [seedWhenJoined, group]);

  // Nothing starts with the group. Its queue is filled from the page it was
  // started on, and from then on Play buttons play for everyone in it.
  const create = () => {
    setSeedWhenJoined(seeded);
    void sync
      .createGroup(
        t("syncplay.default_group_name", { name: user?.Name ?? "" }).trim(),
      )
      .catch(() => setSeedWhenJoined(false));
  };

  /** Rejects when the server refuses, with the error already in `sync`. */
  const join = (entry: SyncPlayGroup) =>
    (group
      ? sync.switchGroup(entry.GroupId)
      : sync.joinGroup(entry.GroupId)
    ).then(() => setSwitching(false));

  const startSwitching = () => {
    setSwitching(true);
    void refreshGroups().catch(() => {});
  };

  const retry = () => {
    sync.clearError();
    void refreshGroups().catch(() => {});
  };

  const memberLine = useCallback(
    (entry: SyncPlayGroup, state?: string | null) =>
      [
        entry.Participants.join(", ") || t("syncplay.no_participants"),
        state ? t(`syncplay.states.${state}`) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [t],
  );

  return {
    sync,
    available,
    /** In a group and looking at it, not at the list of the others. */
    showingGroup: !!group && !switching,
    others: groups.filter((entry) => entry.GroupId !== group?.GroupId),
    idle: !groupState || groupState === "Idle",
    /** What "New group" will queue, or null when the page offers nothing. */
    seedLine: seeded
      ? t("syncplay.new_group_queues", {
          title: seed.title,
          count: seed.ids.length,
        })
      : null,
    create,
    join,
    startSwitching,
    stopSwitching: () => setSwitching(false),
    retry,
    memberLine,
  };
}
