import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { SyncPlayGroup } from "@/providers/SyncPlayProvider";
import type { SyncPlaySeed } from "@/utils/syncplay/types";
import { SyncPlayOptions, SyncPlayPlayback } from "./SyncPlayControls";
import { SyncPlayQueue } from "./SyncPlayQueue";
import { SyncPlaySheetGroup, SyncPlaySheetRow } from "./SyncPlaySheetRow";
import { syncPlayGroupIsPlaying, useSyncPlayPanel } from "./useSyncPlayPanel";
import { useSyncPlayQueueItems } from "./useSyncPlayQueueItems";

interface Props {
  seed?: SyncPlaySeed;
  /** Closes whatever shows the panel, once it has done its job. */
  onClose?: () => void;
  /** A queue entry is being dragged: whatever scrolls the panel should not. */
  onQueueDragChange?: (dragging: boolean) => void;
}

const PLAYING = "#c084fc";
const SECONDARY = "#9899A1";

/**
 * Everything SyncPlay outside the player: the groups to join and a way to
 * start one, or the group this device is in. The sheet of phones and
 * tablets; TV draws the same thing its own way (TVSyncPlaySheet).
 */
export function SyncPlayPanel({ seed, onClose, onQueueDragChange }: Props) {
  const { t } = useTranslation();
  const panel = useSyncPlayPanel(seed);
  const { sync, available, others, idle, memberLine } = panel;
  const { group, groupState, canCreate, connected, busy, error } = sync;
  const {
    items,
    failed: titlesFailed,
    retry: retryTitles,
  } = useSyncPlayQueueItems();

  const join = (entry: SyncPlayGroup) =>
    void panel
      .join(entry)
      // The player opens over a group that is playing and covers this panel.
      .then(() => syncPlayGroupIsPlaying(entry) && onClose?.())
      .catch(() => {});

  const notices = (
    <>
      {!available && (
        <Text testID='syncplay-unavailable' className='text-amber-200'>
          {sync.supported
            ? t("syncplay.disconnected")
            : t("syncplay.unavailable")}
        </Text>
      )}
      {error && (
        <SyncPlaySheetGroup>
          <View testID='syncplay-error' className='px-4 py-3'>
            <Text className='text-red-400 font-semibold'>
              {t("syncplay.error")}
            </Text>
            <Text className='text-[#9899A1] mt-0.5'>{error}</Text>
          </View>
          <SyncPlaySheetRow
            testID='syncplay-retry'
            icon='refresh'
            title={t("syncplay.retry")}
            disabled={!available || busy}
            onPress={panel.retry}
          />
        </SyncPlaySheetGroup>
      )}
    </>
  );

  const groupList = (
    <View>
      <Text className='ml-4 mb-1 uppercase text-[#8E8D91] text-xs'>
        {t("syncplay.groups_on_server")}
      </Text>
      {others.length === 0 && (
        <Text testID='syncplay-empty' className='ml-4 text-[#9899A1]'>
          {t("syncplay.no_groups")}
        </Text>
      )}
      {others.map((entry) => (
        <View
          key={entry.GroupId}
          className='flex-row items-center py-2.5'
          style={{ gap: 12 }}
        >
          <View className='w-12 h-12 rounded bg-neutral-800 items-center justify-center'>
            <Ionicons name='people' size={22} color={SECONDARY} />
          </View>
          <View className='flex-1'>
            <Text numberOfLines={1} className='text-white text-base'>
              {entry.GroupName}
            </Text>
            <Text
              numberOfLines={1}
              className='text-sm'
              style={{
                color: entry.State === "Playing" ? PLAYING : SECONDARY,
              }}
            >
              {memberLine(entry, entry.State)}
            </Text>
          </View>
          <TouchableOpacity
            testID={`syncplay-join-${entry.GroupId}`}
            accessibilityRole='button'
            disabled={!available || busy}
            onPress={() => join(entry)}
            className='h-11 px-5 rounded-full border-2 border-purple-600 items-center justify-center'
            style={{ opacity: !available || busy ? 0.5 : 1 }}
          >
            <Text className='text-white font-bold'>{t("syncplay.join")}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  if (group && panel.showingGroup)
    return (
      <View testID='syncplay-panel' style={{ gap: 14 }}>
        <View className='flex-row items-center' style={{ gap: 12 }}>
          <View className='w-12 h-12 rounded-[10px] bg-neutral-800 items-center justify-center'>
            <Ionicons name='people' size={24} color={PLAYING} />
          </View>
          <View className='flex-1'>
            <Text
              testID='syncplay-current-group'
              numberOfLines={1}
              className='text-white font-semibold text-lg'
            >
              {group.GroupName}
            </Text>
            <Text
              numberOfLines={1}
              className='text-sm'
              style={{ color: groupState === "Playing" ? PLAYING : SECONDARY }}
            >
              {memberLine(group, groupState)}
            </Text>
          </View>
          {busy && <ActivityIndicator testID='syncplay-loading' />}
        </View>

        {notices}

        <SyncPlayPlayback items={items} onClose={onClose} />
        {titlesFailed && (
          <SyncPlaySheetGroup>
            <SyncPlaySheetRow
              testID='syncplay-queue-titles-retry'
              icon='refresh'
              title={t("syncplay.retry")}
              onPress={retryTitles}
            />
          </SyncPlaySheetGroup>
        )}
        <SyncPlayQueue items={items} onDragActiveChange={onQueueDragChange} />
        <SyncPlayOptions />

        <SyncPlaySheetGroup>
          <SyncPlaySheetRow
            testID='syncplay-controls-stop'
            icon='stop'
            title={t("syncplay.stop_for_everyone")}
            disabled={!connected || busy || idle}
            onPress={() => void sync.requestStop().catch(() => {})}
          />
          <SyncPlaySheetRow
            testID='syncplay-switch'
            icon='swap-horizontal'
            title={t("syncplay.switch_group")}
            disabled={!available || busy}
            onPress={panel.startSwitching}
          />
          <SyncPlaySheetRow
            testID='syncplay-leave'
            icon='log-out-outline'
            title={t("syncplay.leave")}
            color='#f87171'
            disabled={!connected || busy}
            onPress={() => void sync.leaveGroup().catch(() => {})}
          />
        </SyncPlaySheetGroup>
      </View>
    );

  return (
    <View testID='syncplay-panel' style={{ gap: 14 }}>
      <View>
        <View className='flex-row items-center' style={{ gap: 10 }}>
          <Text className='text-2xl font-bold flex-1'>
            {t("syncplay.title")}
          </Text>
          {busy && <ActivityIndicator testID='syncplay-loading' />}
        </View>
        <Text className='text-[#9899A1] mt-0.5'>
          {t("syncplay.description")}
        </Text>
      </View>

      {notices}

      {group ? (
        <TouchableOpacity
          testID='syncplay-back'
          accessibilityRole='button'
          onPress={panel.stopSwitching}
          className='flex-row items-center py-2.5'
          style={{ gap: 12 }}
        >
          <View className='w-12 h-12 rounded bg-neutral-800 items-center justify-center'>
            <Ionicons name='chevron-back' size={22} color='white' />
          </View>
          <Text className='text-white font-semibold text-base flex-1'>
            {t("syncplay.back_to_group", { name: group.GroupName })}
          </Text>
        </TouchableOpacity>
      ) : (
        canCreate && (
          <TouchableOpacity
            testID='syncplay-create'
            accessibilityRole='button'
            disabled={!available || busy}
            onPress={panel.create}
            className='flex-row items-center py-2.5'
            style={{ gap: 12, opacity: !available || busy ? 0.5 : 1 }}
          >
            <View className='w-12 h-12 rounded bg-purple-600 items-center justify-center'>
              <Ionicons name='add' size={26} color='white' />
            </View>
            <View className='flex-1'>
              <Text className='text-white font-semibold text-base'>
                {t("syncplay.new_group")}
              </Text>
              <Text
                testID='syncplay-how'
                numberOfLines={2}
                className='text-[#9899A1] text-sm'
              >
                {panel.seedLine ?? t("syncplay.how_to_play")}
              </Text>
            </View>
          </TouchableOpacity>
        )
      )}

      {groupList}
    </View>
  );
}
