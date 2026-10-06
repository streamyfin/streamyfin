import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import type { SyncPlayRepeatMode } from "@/utils/syncplay/types";
import { SyncPlayAction } from "./SyncPlayAction";

const card = {
  backgroundColor: "#171717",
  borderColor: "#333333",
  borderWidth: 1,
  borderRadius: 18,
  padding: 18,
  gap: 14,
};
const row = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: 8,
};
const repeatModes: SyncPlayRepeatMode[] = [
  "RepeatNone",
  "RepeatAll",
  "RepeatOne",
];

export const syncPlayVideoName = (item: BaseItemDto) =>
  item.Type === "Episode" && item.SeriesName
    ? `${item.SeriesName} · ${item.Name || ""}`
    : item.Name || "";

/** The same server-owned queue controls work in the app, TV and browser. */
export function SyncPlayGroupControls({
  showLibrary = true,
}: {
  showLibrary?: boolean;
}) {
  const { t } = useTranslation();
  const sync = useSyncPlay();
  const {
    group,
    connected,
    busy,
    playlist,
    currentPlaylistItemId,
    repeatMode,
    shuffleMode,
    ignoreWait,
    resolveVideos,
  } = sync;
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [titleError, setTitleError] = useState(false);
  const [retry, setRetry] = useState(0);
  const ids = playlist.map((entry) => entry.ItemId).join(",");
  const disabled = !group || !connected || busy;

  useEffect(() => {
    let active = true;
    if (!ids) setTitles({});
    setTitleError(false);
    if (ids && connected) {
      void resolveVideos(ids.split(","))
        .then((items) => {
          if (active)
            setTitles(
              Object.fromEntries(
                items.map((item) => [item.Id, syncPlayVideoName(item)]),
              ),
            );
        })
        .catch(() => {
          if (active) setTitleError(true);
        });
    }
    return () => {
      active = false;
    };
  }, [ids, connected, resolveVideos, retry]);
  if (!group) return null;

  return (
    <View testID='syncplay-group-controls' style={{ gap: 20 }}>
      <View style={card}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "600" }}>
            {t("syncplay.playback_options")}
          </Text>
          <SyncPlayAction
            testID='syncplay-controls-refresh-group'
            secondary
            disabled={disabled}
            onPress={() => void sync.getGroup(group.GroupId).catch(() => {})}
          >
            {t("syncplay.refresh_group")}
          </SyncPlayAction>
        </View>
        <View style={row}>
          <SyncPlayAction
            testID='syncplay-repeat'
            secondary
            disabled={disabled}
            accessibilityHint={t("syncplay.repeat_hint")}
            onPress={() =>
              void sync
                .setRepeatMode(
                  repeatModes[
                    (repeatModes.indexOf(repeatMode) + 1) % repeatModes.length
                  ],
                )
                .catch(() => {})
            }
          >
            {`${t("syncplay.repeat")}: ${t(`syncplay.repeat_modes.${repeatMode}`)}`}
          </SyncPlayAction>
          <SyncPlayAction
            testID='syncplay-shuffle'
            secondary
            disabled={disabled}
            accessibilityRole='switch'
            checked={shuffleMode === "Shuffle"}
            onPress={() =>
              void sync
                .setShuffleMode(
                  shuffleMode === "Shuffle" ? "Sorted" : "Shuffle",
                )
                .catch(() => {})
            }
          >
            {`${t("syncplay.shuffle")}: ${t(shuffleMode === "Shuffle" ? "syncplay.on" : "syncplay.off")}`}
          </SyncPlayAction>
          <SyncPlayAction
            testID='syncplay-ignore-wait'
            secondary
            disabled={disabled}
            accessibilityRole='switch'
            checked={ignoreWait}
            onPress={() => void sync.setIgnoreWait(!ignoreWait).catch(() => {})}
          >
            {`${t("syncplay.ignore_wait")}: ${t(ignoreWait ? "syncplay.on" : "syncplay.off")}`}
          </SyncPlayAction>
        </View>
        <Text style={{ color: "#a3a3a3", lineHeight: 21 }}>
          {t("syncplay.ignore_wait_hint")}
        </Text>
        <View style={row}>
          <SyncPlayAction
            testID='syncplay-controls-previous'
            secondary
            disabled={disabled || !sync.hasPrevious}
            onPress={() => void sync.requestPrevious().catch(() => {})}
          >
            {t("live_tv.previous")}
          </SyncPlayAction>
          <SyncPlayAction
            testID='syncplay-controls-play-pause'
            disabled={disabled || playlist.length === 0}
            onPress={() =>
              void (
                sync.groupState === "Playing"
                  ? sync.requestPause()
                  : sync.requestUnpause()
              ).catch(() => {})
            }
          >
            {t(
              sync.groupState === "Playing"
                ? "syncplay.pause"
                : "syncplay.play",
            )}
          </SyncPlayAction>
          <SyncPlayAction
            testID='syncplay-controls-next'
            secondary
            disabled={disabled || !sync.hasNext}
            onPress={() => void sync.requestNext().catch(() => {})}
          >
            {t("live_tv.next")}
          </SyncPlayAction>
          <SyncPlayAction
            testID='syncplay-controls-stop'
            secondary
            disabled={disabled || playlist.length === 0}
            onPress={() => void sync.requestStop().catch(() => {})}
          >
            {t("player.stopPlayback")}
          </SyncPlayAction>
        </View>
      </View>
      <View style={card}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>
          {t("syncplay.queue")}
        </Text>
        {titleError && (
          <SyncPlayAction
            testID='syncplay-queue-titles-retry'
            disabled={disabled}
            secondary
            onPress={() => setRetry((value) => value + 1)}
          >
            {t("syncplay.retry")}
          </SyncPlayAction>
        )}
        {playlist.length === 0 && (
          <Text style={{ color: "#a3a3a3" }}>{t("syncplay.empty_queue")}</Text>
        )}
        {playlist.map((entry, index) => {
          const current = entry.PlaylistItemId === currentPlaylistItemId;
          const title = titles[entry.ItemId] || t("syncplay.unavailable_video");
          return (
            <View
              key={entry.PlaylistItemId}
              testID={`syncplay-queue-row-${entry.PlaylistItemId}`}
              style={{
                padding: 12,
                borderWidth: 1,
                borderRadius: 12,
                borderColor: current ? "#a855f7" : "#404040",
                gap: 10,
              }}
            >
              <Text
                style={{ fontWeight: "600" }}
              >{`${index + 1}. ${title}`}</Text>
              {current && (
                <Text style={{ color: "#c084fc", fontSize: 13 }}>
                  {t("syncplay.now_playing")}
                </Text>
              )}
              <View style={row}>
                <SyncPlayAction
                  testID={`syncplay-queue-select-${entry.PlaylistItemId}`}
                  secondary
                  disabled={disabled}
                  onPress={() =>
                    void sync
                      .requestPlaylistItem(entry.PlaylistItemId)
                      .catch(() => {})
                  }
                >
                  {t("syncplay.play")}
                </SyncPlayAction>
                <SyncPlayAction
                  testID={`syncplay-queue-up-${entry.PlaylistItemId}`}
                  secondary
                  disabled={disabled || index === 0}
                  onPress={() =>
                    void sync
                      .movePlaylistItem(entry.PlaylistItemId, index - 1)
                      .catch(() => {})
                  }
                >
                  {t("syncplay.move_up")}
                </SyncPlayAction>
                <SyncPlayAction
                  testID={`syncplay-queue-down-${entry.PlaylistItemId}`}
                  secondary
                  disabled={disabled || index === playlist.length - 1}
                  onPress={() =>
                    void sync
                      .movePlaylistItem(entry.PlaylistItemId, index + 1)
                      .catch(() => {})
                  }
                >
                  {t("syncplay.move_down")}
                </SyncPlayAction>
                <SyncPlayAction
                  testID={`syncplay-queue-remove-${entry.PlaylistItemId}`}
                  secondary
                  disabled={disabled}
                  onPress={() =>
                    void sync
                      .removePlaylistItems([entry.PlaylistItemId])
                      .catch(() => {})
                  }
                >
                  {t("syncplay.remove")}
                </SyncPlayAction>
              </View>
            </View>
          );
        })}
        {playlist.length > 0 && (
          <View style={row}>
            <SyncPlayAction
              testID='syncplay-clear-upcoming'
              secondary
              disabled={disabled || playlist.length < 2}
              onPress={() => void sync.clearPlaylist(false).catch(() => {})}
            >
              {t("syncplay.clear_upcoming")}
            </SyncPlayAction>
            <SyncPlayAction
              testID='syncplay-clear-all'
              destructive
              disabled={disabled}
              onPress={() => void sync.clearPlaylist(true).catch(() => {})}
            >
              {t("syncplay.clear_all")}
            </SyncPlayAction>
          </View>
        )}
      </View>
      {showLibrary && <SyncPlayVideoPicker />}
    </View>
  );
}

function SyncPlayVideoPicker() {
  const { t } = useTranslation();
  const { listVideos, playItems, queueItems, connected, busy } = useSyncPlay();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !connected) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      void listVideos(search)
        .then((videos) => {
          if (active) setItems(videos);
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search, connected, listVideos, retry]);
  return (
    <View style={card}>
      <SyncPlayAction
        testID='syncplay-add-videos'
        secondary
        disabled={!connected || busy}
        onPress={() => setOpen(!open)}
      >
        {t("syncplay.add_videos")}
      </SyncPlayAction>
      {open && (
        <>
          <TextInput
            testID='syncplay-video-search'
            accessibilityLabel={t("syncplay.search_videos")}
            placeholder={t("syncplay.search_videos")}
            placeholderTextColor='#a3a3a3'
            value={search}
            onChangeText={setSearch}
            autoCapitalize='none'
            autoCorrect={false}
            editable={connected && !busy}
            style={{
              minHeight: 50,
              padding: 12,
              borderWidth: 1,
              borderColor: "#525252",
              borderRadius: 12,
              color: "white",
            }}
          />
          {loading && (
            <ActivityIndicator
              testID='syncplay-videos-loading'
              color='#c084fc'
            />
          )}
          {failed && (
            <>
              <Text
                accessibilityLiveRegion='assertive'
                style={{ color: "#fca5a5" }}
              >
                {t("syncplay.videos_failed")}
              </Text>
              <SyncPlayAction
                testID='syncplay-videos-retry'
                disabled={!connected || busy}
                secondary
                onPress={() => setRetry((value) => value + 1)}
              >
                {t("syncplay.retry")}
              </SyncPlayAction>
            </>
          )}
          {!loading && !failed && items.length === 0 && (
            <Text style={{ color: "#a3a3a3" }}>{t("syncplay.no_videos")}</Text>
          )}
          {!failed &&
            items
              .filter((item) => item.Id)
              .map((item) => (
                <View key={item.Id} style={{ gap: 10, paddingVertical: 8 }}>
                  <Text style={{ fontWeight: "600" }}>
                    {syncPlayVideoName(item) || t("syncplay.unavailable_video")}
                  </Text>
                  <View style={row}>
                    <SyncPlayAction
                      testID={`syncplay-library-play-${item.Id}`}
                      secondary
                      disabled={!connected || busy || loading}
                      onPress={() => void playItems([item.Id!]).catch(() => {})}
                    >
                      {t("syncplay.play_now")}
                    </SyncPlayAction>
                    <SyncPlayAction
                      testID={`syncplay-library-next-${item.Id}`}
                      secondary
                      disabled={!connected || busy || loading}
                      onPress={() =>
                        void queueItems([item.Id!], "QueueNext").catch(() => {})
                      }
                    >
                      {t("syncplay.play_next")}
                    </SyncPlayAction>
                    <SyncPlayAction
                      testID={`syncplay-library-append-${item.Id}`}
                      secondary
                      disabled={!connected || busy || loading}
                      onPress={() =>
                        void queueItems([item.Id!], "Queue").catch(() => {})
                      }
                    >
                      {t("syncplay.append")}
                    </SyncPlayAction>
                  </View>
                </View>
              ))}
        </>
      )}
    </View>
  );
}
