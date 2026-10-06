import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVOptionCard } from "@/components/tv/TVOptionCard";
import { SYNCPLAY_TV_SHEET_DISMISS_MS } from "@/constants/SyncPlay";
import { useScaledTVTypography } from "@/constants/TVTypography";
import type { SyncPlayGroup } from "@/providers/SyncPlayProvider";
import { scaleSize } from "@/utils/scaleSize";
import type { SyncPlayRepeatMode, SyncPlaySeed } from "@/utils/syncplay/types";
import { syncPlayGroupIsPlaying, useSyncPlayPanel } from "./useSyncPlayPanel";
import { useSyncPlayQueueItems } from "./useSyncPlayQueueItems";

const repeatModes: SyncPlayRepeatMode[] = [
  "RepeatNone",
  "RepeatAll",
  "RepeatOne",
];

/** Long enough for a newly mounted row to be laid out and focusable. */
const FOCUS_DELAY_MS = 150;

interface Card {
  key: string;
  label: string;
  sublabel?: string;
  /** A mode that is on. */
  selected?: boolean;
  /** False dims the card. It stays focusable: see `press`. */
  usable?: boolean;
  onPress: () => void;
}

interface Props {
  seed: SyncPlaySeed | null;
  /** Dismisses the route that shows the sheet. */
  onClose: () => void;
}

/**
 * SyncPlay on TV: what the phone sheet (SyncPlayPanel) offers, as rows of
 * cards for a remote. The queue is not here; the player has it.
 */
export function TVSyncPlaySheet({ seed, onClose }: Props) {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const panel = useSyncPlayPanel(seed);
  const { sync, available, others, idle, memberLine } = panel;
  const { group, groupState, canCreate, connected, busy, error } = sync;
  const { playlist, currentPlaylistItemId, repeatMode } = sync;
  const { items } = useSyncPlayQueueItems();
  const firstCard = useRef<View>(null);
  const current = playlist.find(
    (entry) => entry.PlaylistItemId === currentPlaylistItemId,
  );
  const playing = !idle && !!current;
  const paused = groupState !== "Playing";

  const run = (action: () => Promise<unknown>) => () =>
    void action().catch(() => {});
  // What opens the player goes after this route has gone.
  const closeThen = (action: () => Promise<unknown>) => () => {
    onClose();
    setTimeout(run(action), SYNCPLAY_TV_SHEET_DISMISS_MS);
  };
  const join = (entry: SyncPlayGroup) =>
    syncPlayGroupIsPlaying(entry)
      ? closeThen(() => panel.join(entry))
      : run(() => panel.join(entry));

  const retry: Card[] = error
    ? [{ key: "retry", label: t("syncplay.retry"), onPress: panel.retry }]
    : [];

  const listRows: Card[][] = [
    [
      ...(group
        ? [
            {
              key: "back",
              label: t("syncplay.back_to_group", { name: group.GroupName }),
              onPress: panel.stopSwitching,
            },
          ]
        : canCreate
          ? [
              {
                key: "create",
                label: t("syncplay.new_group"),
                sublabel: panel.seedLine ?? undefined,
                usable: available,
                onPress: panel.create,
              },
            ]
          : []),
      ...others.map((entry) => ({
        key: `join-${entry.GroupId}`,
        label: entry.GroupName,
        sublabel: memberLine(entry, entry.State),
        usable: available,
        onPress: join(entry),
      })),
      ...retry,
    ],
  ];

  const playbackRow: Card[] = playing
    ? [
        // Only while the player is closed, which on TV is whenever this
        // sheet can be opened at all.
        ...(sync.watching
          ? []
          : [
              {
                key: "watch",
                label: t("syncplay.watch"),
                usable: connected,
                onPress: closeThen(sync.startWatching),
              },
            ]),
        {
          key: "previous",
          label: t("live_tv.previous"),
          usable: connected && sync.hasPrevious,
          onPress: run(sync.requestPrevious),
        },
        {
          key: "play-pause",
          label: t(paused ? "syncplay.play" : "syncplay.pause"),
          usable: connected,
          onPress: run(paused ? sync.requestUnpause : sync.requestPause),
        },
        {
          key: "next",
          label: t("live_tv.next"),
          usable: connected && sync.hasNext,
          onPress: run(sync.requestNext),
        },
      ]
    : playlist.length > 0
      ? [
          {
            key: "play-pause",
            label: t("syncplay.play_for_everyone"),
            usable: connected,
            onPress: closeThen(sync.requestUnpause),
          },
        ]
      : [];

  const onOff = (on: boolean) => t(on ? "syncplay.on" : "syncplay.off");
  const shuffled = sync.shuffleMode === "Shuffle";
  const groupRows: Card[][] = [
    playbackRow,
    [
      {
        key: "repeat",
        label: t("syncplay.repeat"),
        sublabel: t(`syncplay.repeat_modes.${repeatMode}`),
        selected: repeatMode !== "RepeatNone",
        usable: connected,
        onPress: run(() =>
          sync.setRepeatMode(
            repeatModes[
              (repeatModes.indexOf(repeatMode) + 1) % repeatModes.length
            ],
          ),
        ),
      },
      {
        key: "shuffle",
        label: t("syncplay.shuffle"),
        sublabel: onOff(shuffled),
        selected: shuffled,
        usable: connected,
        onPress: run(() =>
          sync.setShuffleMode(shuffled ? "Sorted" : "Shuffle"),
        ),
      },
      {
        key: "ignore-wait",
        label: t("syncplay.ignore_wait"),
        sublabel: onOff(sync.ignoreWait),
        selected: sync.ignoreWait,
        usable: connected,
        onPress: run(() => sync.setIgnoreWait(!sync.ignoreWait)),
      },
    ],
    [
      {
        key: "stop",
        label: t("syncplay.stop_for_everyone"),
        usable: connected && !idle,
        onPress: run(sync.requestStop),
      },
      {
        key: "switch",
        label: t("syncplay.switch_group"),
        usable: available,
        onPress: panel.startSwitching,
      },
      {
        key: "leave",
        label: t("syncplay.leave"),
        usable: connected,
        onPress: run(sync.leaveGroup),
      },
      ...retry,
    ],
  ];

  const showingGroup = !!group && panel.showingGroup;
  const rows = (showingGroup ? groupRows : listRows).filter(
    (row) => row.length > 0,
  );
  // The cards of one view are gone in the next, and focus with them: each
  // view takes it to its first card.
  const view = showingGroup ? `group-${group.GroupId}` : group ? "switch" : "";
  useEffect(() => {
    const timer = setTimeout(
      () =>
        (
          firstCard.current as (View & { requestTVFocus?: () => void }) | null
        )?.requestTVFocus?.(),
      FOCUS_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [view]);

  // A card that cannot act right now keeps its focus and does nothing: a
  // disabled one would hand focus to whatever the engine finds nearest.
  const press = (card: Card) => () => {
    if (card.usable !== false && !busy) card.onPress();
  };

  const currentItem = current ? items[current.ItemId] : undefined;
  const secondary = { fontSize: typography.callout, color: MUTED };

  return (
    <View testID='syncplay-tv-sheet'>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text
            testID='syncplay-current-group'
            numberOfLines={1}
            style={[styles.title, { fontSize: typography.heading }]}
          >
            {showingGroup ? group.GroupName : t("syncplay.title")}
          </Text>
          {busy && <ActivityIndicator testID='syncplay-loading' />}
        </View>
        <Text numberOfLines={2} style={secondary}>
          {showingGroup
            ? memberLine(group, groupState)
            : t("syncplay.description")}
        </Text>
        {!available && (
          <Text
            testID='syncplay-unavailable'
            style={{ fontSize: typography.callout, color: WARNING }}
          >
            {sync.supported
              ? t("syncplay.disconnected")
              : t("syncplay.unavailable")}
          </Text>
        )}
        {!!error && (
          <Text
            testID='syncplay-error'
            style={{ fontSize: typography.callout, color: ERROR }}
          >
            {error}
          </Text>
        )}
        {showingGroup && playing && (
          <Text numberOfLines={1} style={secondary}>
            {t("syncplay.now_playing")}
            {"  "}
            <Text style={{ fontSize: typography.callout, color: "#fff" }}>
              {currentItem?.Name || t("syncplay.unavailable_video")}
            </Text>
          </Text>
        )}
        {showingGroup && !playing && playlist.length === 0 && (
          <Text testID='syncplay-how' style={secondary}>
            {t("syncplay.how_to_play")}
          </Text>
        )}
        {!showingGroup && others.length === 0 && (
          <Text testID='syncplay-empty' style={secondary}>
            {t("syncplay.no_groups")}
          </Text>
        )}
      </View>

      <View key={view}>
        {rows.map((row, rowIndex) => (
          // The row is as wide as the sheet, so a move up or down from any
          // card reaches it, however few cards it has.
          <TVFocusGuideView key={row[0].key} autoFocus style={styles.row}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
            >
              {row.map((card, index) => {
                const first = rowIndex === 0 && index === 0;
                return (
                  <View
                    key={card.key}
                    style={{ opacity: card.usable === false ? 0.4 : 1 }}
                  >
                    <TVOptionCard
                      ref={first ? firstCard : undefined}
                      label={card.label}
                      sublabel={card.sublabel}
                      selected={!!card.selected}
                      hasTVPreferredFocus={first}
                      onPress={press(card)}
                      width={scaleSize(230)}
                      height={scaleSize(100)}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </TVFocusGuideView>
        ))}
      </View>
    </View>
  );
}

const MUTED = "rgba(255,255,255,0.6)";
const WARNING = "#fde68a";
const ERROR = "#f87171";

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: scaleSize(48),
    marginBottom: scaleSize(8),
    gap: scaleSize(6),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scaleSize(16),
  },
  title: {
    color: "#fff",
    fontWeight: "600",
    flexShrink: 1,
  },
  row: {
    width: "100%",
    overflow: "visible",
  },
  scroll: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: scaleSize(48),
    // Room for a focused card to scale without being clipped.
    paddingVertical: scaleSize(12),
    gap: scaleSize(12),
  },
});
