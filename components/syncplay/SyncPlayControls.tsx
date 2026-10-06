import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/Button";
import { Image } from "@/components/common/ServerImage";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import {
  syncPlayQueuePosterUrl,
  syncPlayQueueSubtitle,
} from "@/utils/syncplay/queueDisplay";
import type { SyncPlayRepeatMode } from "@/utils/syncplay/types";
import { SyncPlaySheetGroup, SyncPlaySheetRow } from "./SyncPlaySheetRow";

const repeatModes: SyncPlayRepeatMode[] = [
  "RepeatNone",
  "RepeatAll",
  "RepeatOne",
];

interface Props {
  /** The videos behind the queue, by media id. */
  items: Record<string, BaseItemDto>;
  /** Closes the sheet once the player takes over. */
  onClose?: () => void;
}

/**
 * What the group is doing and how: the video it is on with the way back into
 * the player, or the button that starts its queue, and the modes below. The
 * native players show the same controls in their own queue sheet
 * (SyncPlayQueueView.swift, SyncPlayQueueSheet.kt): keep the three in step.
 */
export function SyncPlayPlayback({ items, onClose }: Props) {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const sync = useSyncPlay();
  const { group, connected, busy, playlist, groupState, watching } = sync;
  const { currentPlaylistItemId } = sync;
  const disabled = !group || !connected || busy;
  const idle = !groupState || groupState === "Idle";
  const paused = groupState !== "Playing";
  const current = playlist.find(
    (entry) => entry.PlaylistItemId === currentPlaylistItemId,
  );
  const item = current ? items[current.ItemId] : undefined;
  const poster = syncPlayQueuePosterUrl(api, item);

  if (!group) return null;

  // Nothing to resume: the queue, if there is one, starts from the top.
  if (idle || !current)
    return playlist.length > 0 ? (
      <Button
        testID='syncplay-controls-play-pause'
        color='purple'
        disabled={disabled}
        onPress={() => void sync.requestUnpause().catch(() => {})}
      >
        {t("syncplay.play_for_everyone")}
      </Button>
    ) : (
      <Text testID='syncplay-how' className='text-[#9899A1]'>
        {t("syncplay.how_to_play")}
      </Text>
    );

  const transport = (
    testID: string,
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    enabled: boolean,
    onPress: () => Promise<void>,
  ) => (
    <TouchableOpacity
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={() => void onPress().catch(() => {})}
      className='w-11 h-11 items-center justify-center'
      style={{ opacity: enabled ? 1 : 0.35 }}
    >
      <Ionicons name={icon} size={24} color='white' />
    </TouchableOpacity>
  );

  return (
    <View className='rounded-xl bg-neutral-800 p-3' style={{ gap: 12 }}>
      <View className='flex-row items-center'>
        <View className='w-11 h-[66px] rounded overflow-hidden bg-neutral-700 mr-3 items-center justify-center'>
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
              cachePolicy='memory-disk'
            />
          ) : (
            <Ionicons name='film' size={18} color='#9899A1' />
          )}
        </View>
        <View className='flex-1'>
          <Text className='text-[#9899A1] text-sm'>
            {t("syncplay.now_playing")}
          </Text>
          <Text numberOfLines={1} className='text-white font-semibold text-lg'>
            {item?.Name || t("syncplay.unavailable_video")}
          </Text>
          {!!item && !!syncPlayQueueSubtitle(item) && (
            <Text numberOfLines={1} className='text-[#9899A1] text-sm'>
              {syncPlayQueueSubtitle(item)}
            </Text>
          )}
        </View>
      </View>
      <View className='flex-row items-center' style={{ gap: 6 }}>
        {/* Only while the player is closed: with it open it covers this. */}
        {!watching && (
          <Button
            testID='syncplay-watch'
            color='purple'
            className='flex-1'
            disabled={disabled}
            onPress={() =>
              void sync
                .startWatching()
                .then(onClose)
                .catch(() => {})
            }
          >
            {t("syncplay.watch")}
          </Button>
        )}
        {watching && <View className='flex-1' />}
        {transport(
          "syncplay-controls-previous",
          "play-skip-back",
          t("live_tv.previous"),
          !disabled && sync.hasPrevious,
          sync.requestPrevious,
        )}
        {transport(
          "syncplay-controls-play-pause",
          paused ? "play" : "pause",
          t(paused ? "syncplay.play" : "syncplay.pause"),
          !disabled,
          paused ? sync.requestUnpause : sync.requestPause,
        )}
        {transport(
          "syncplay-controls-next",
          "play-skip-forward",
          t("live_tv.next"),
          !disabled && sync.hasNext,
          sync.requestNext,
        )}
      </View>
    </View>
  );
}

/** Repeat, shuffle and whether the group waits for this device. */
export function SyncPlayOptions() {
  const { t } = useTranslation();
  const sync = useSyncPlay();
  const { group, connected, busy, repeatMode, shuffleMode, ignoreWait } = sync;
  const disabled = !group || !connected || busy;
  const shuffled = shuffleMode === "Shuffle";

  if (!group) return null;

  // A remote has nothing to flick: on TV the same row is a button that
  // toggles and says where it stands.
  const toggle = (
    testID: string,
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value: boolean,
    onChange: (next: boolean) => Promise<void>,
  ) =>
    Platform.isTV ? (
      <SyncPlaySheetRow
        testID={testID}
        icon={icon}
        title={title}
        value={t(value ? "syncplay.on" : "syncplay.off")}
        disabled={disabled}
        onPress={() => void onChange(!value).catch(() => {})}
      />
    ) : (
      <SyncPlaySheetRow icon={icon} title={title} disabled={disabled}>
        <SettingSwitch
          testID={testID}
          value={value}
          disabled={disabled}
          onValueChange={(next) => void onChange(next).catch(() => {})}
        />
      </SyncPlaySheetRow>
    );

  return (
    <SyncPlaySheetGroup>
      {/* A press steps to the next mode: a menu here would, on Android, be
          a second sheet on top of this one. */}
      <SyncPlaySheetRow
        testID='syncplay-repeat'
        icon='repeat'
        title={t("syncplay.repeat")}
        value={t(`syncplay.repeat_modes.${repeatMode}`)}
        disabled={disabled}
        onPress={() =>
          void sync
            .setRepeatMode(
              repeatModes[
                (repeatModes.indexOf(repeatMode) + 1) % repeatModes.length
              ],
            )
            .catch(() => {})
        }
      />
      {toggle(
        "syncplay-shuffle",
        "shuffle",
        t("syncplay.shuffle"),
        shuffled,
        (on) => sync.setShuffleMode(on ? "Shuffle" : "Sorted"),
      )}
      {toggle(
        "syncplay-ignore-wait",
        "hourglass-outline",
        t("syncplay.ignore_wait"),
        ignoreWait,
        sync.setIgnoreWait,
      )}
    </SyncPlaySheetGroup>
  );
}
