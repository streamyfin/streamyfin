import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { BaseItemDto, UserDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getItemsApi,
  getPlaystateApi,
  getSessionApi,
  getUserApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { ScrollView, TextInput, View } from "react-native";
import appConfig from "@/app.json";
import { Text } from "@/components/common/Text";
import { SyncPlayAction } from "@/components/syncplay/SyncPlayAction";
import { SyncPlayManager } from "@/components/syncplay/SyncPlayManager";
import i18n from "@/i18n";
import type {
  MpvPlayerViewRef,
  VideoSource,
} from "@/modules/mpv-player/src/MpvPlayer.types";
import MpvPlayerView from "@/modules/mpv-player/src/MpvPlayerView.web";
import {
  SyncPlayProvider,
  useSyncPlay,
} from "@/providers/SyncPlayProvider.web";
import type {
  SyncPlayLaunchRequest,
  SyncPlayPlayerState,
} from "@/utils/syncplay/types";

const inputStyle = {
  color: "white",
  padding: 14,
  minHeight: 50,
  borderWidth: 1,
  borderColor: "#525252",
  borderRadius: 12,
  backgroundColor: "#171717",
  fontSize: 16,
};
const TICKS = 10_000_000;

function BrowserApp() {
  const { t } = useTranslation();
  const [server, setServer] = useState("http://localhost:8096");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<{ api: Api; user: UserDto } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceId] = useState(() => {
    const saved = sessionStorage.getItem("streamyfin-browser-device");
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem("streamyfin-browser-device", created);
    return created;
  });
  const login = async () => {
    if (busy || !username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const url = new URL(server.trim());
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Invalid server");
      const client = new Jellyfin({
        clientInfo: { name: "Streamyfin Web", version: appConfig.expo.version },
        deviceInfo: { name: "Browser", id: deviceId },
      });
      const api = client.createApi(url.toString().replace(/\/$/, ""));
      const result = (
        await getUserApi(api).authenticateUserByName({
          authenticateUserByName: { Username: username.trim(), Pw: password },
        })
      ).data;
      if (!result.AccessToken || !result.User?.Id)
        throw new Error("No session");
      api.accessToken = result.AccessToken;
      setPassword("");
      setSession({ api, user: result.User });
    } catch {
      setError(t("login.invalid_username_or_password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {session ? (
        <SyncPlayProvider
          api={session.api}
          user={session.user}
          deviceId={deviceId}
        >
          <BrowserSession
            api={session.api}
            user={session.user}
            logout={() => {
              void getSessionApi(session.api)
                .reportSessionEnded()
                .catch(() => {});
              setSession(null);
            }}
          />
        </SyncPlayProvider>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 440,
              alignSelf: "center",
              gap: 18,
            }}
          >
            <Text style={{ fontSize: 34, fontWeight: "700" }}>Streamyfin</Text>
            <Text style={{ color: "#a3a3a3", lineHeight: 22 }}>
              {t("syncplay.description")}
            </Text>
            <Text>{t("server.server_url")}</Text>
            <TextInput
              testID='web-server'
              accessibilityLabel={t("server.server_url")}
              value={server}
              onChangeText={setServer}
              autoCapitalize='none'
              autoCorrect={false}
              style={inputStyle}
            />
            <TextInput
              testID='web-username'
              accessibilityLabel={t("login.username_placeholder")}
              placeholder={t("login.username_placeholder")}
              placeholderTextColor='#a3a3a3'
              value={username}
              onChangeText={setUsername}
              autoCapitalize='none'
              autoComplete='username'
              style={inputStyle}
            />
            <TextInput
              testID='web-password'
              accessibilityLabel={t("login.password_placeholder")}
              placeholder={t("login.password_placeholder")}
              placeholderTextColor='#a3a3a3'
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete='current-password'
              style={inputStyle}
              onSubmitEditing={() => void login()}
            />
            {error && (
              <Text
                accessibilityLiveRegion='assertive'
                style={{ color: "#fca5a5" }}
              >
                {error}
              </Text>
            )}
            <SyncPlayAction
              testID='web-login'
              loading={busy}
              disabled={!username.trim()}
              onPress={() => void login()}
            >
              {t("login.login_button")}
            </SyncPlayAction>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function BrowserSession({
  api,
  user,
  logout,
}: {
  api: Api;
  user: UserDto;
  logout: () => void;
}) {
  const { t } = useTranslation();
  const sync = useSyncPlay();
  const player = useRef<MpvPlayerViewRef>(null);
  const itemRef = useRef<BaseItemDto | null>(null);
  const [items, setItems] = useState<BaseItemDto[]>([]);
  const [source, setSource] = useState<VideoSource>();
  const [sourceGeneration, setSourceGeneration] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const state = useRef<SyncPlayPlayerState>({
    itemId: null,
    positionTicks: 0,
    isPlaying: false,
    isReady: false,
    isBuffering: false,
  });
  const generation = useRef(0);
  const lastReport = useRef(0);

  const launch = useCallback(
    async (request: SyncPlayLaunchRequest, autoplay = false) => {
      if (request.isCurrent?.() === false) return;
      const current = ++generation.current;
      const item = (
        await getUserLibraryApi(api).getItem({
          itemId: request.itemId,
          userId: user.Id,
        })
      ).data;
      if (current !== generation.current || request.isCurrent?.() === false)
        return;
      itemRef.current = item;
      state.current = {
        itemId: request.itemId,
        positionTicks: request.startPositionTicks,
        isPlaying: false,
        isReady: false,
        isBuffering: true,
      };
      const url = new URL(
        `${api.basePath}/Videos/${encodeURIComponent(request.itemId)}/stream.mp4`,
      );
      url.searchParams.set("Static", "true");
      url.searchParams.set("api_key", api.accessToken);
      if (item.MediaSources?.[0]?.Id)
        url.searchParams.set("MediaSourceId", item.MediaSources[0].Id);
      setSourceGeneration(current);
      setSource({
        url: url.toString(),
        autoplay,
        startPosition: request.startPositionTicks / TICKS,
      });
      setFailure(null);
    },
    [api, user.Id],
  );

  useEffect(
    () => sync.registerLauncher(launch),
    [sync.registerLauncher, launch],
  );
  useEffect(
    () =>
      sync.registerPlayer({
        getState: () => state.current,
        pause: () => player.current?.pause(),
        resume: () => player.current?.play(),
        seek: (ticks) => player.current?.seekTo(ticks / TICKS),
        stop: async () => {
          const current = ++generation.current;
          const item = itemRef.current;
          const positionTicks = state.current.positionTicks;
          const paused = player.current?.pause();
          if (item?.Id) {
            void getPlaystateApi(api)
              .reportPlaybackStopped({
                playbackStopInfo: {
                  ItemId: item.Id,
                  MediaSourceId: item.MediaSources?.[0]?.Id,
                  PositionTicks: positionTicks,
                },
              })
              .catch(() => {});
          }
          await paused;
          if (current !== generation.current) return;
          itemRef.current = null;
          state.current = {
            itemId: null,
            positionTicks: 0,
            isPlaying: false,
            isReady: false,
            isBuffering: false,
          };
          setPlaying(false);
          setPosition(0);
          setDuration(0);
          setSource(undefined);
        },
      }),
    [api, sync.registerPlayer],
  );
  useEffect(() => {
    let active = true;
    void getItemsApi(api)
      .getItems({
        userId: user.Id,
        recursive: true,
        includeItemTypes: ["Movie", "Episode", "Video"],
        limit: 100,
        sortBy: ["SortName"],
      })
      .then(({ data }) => {
        if (active) setItems(data.Items ?? []);
      })
      .catch(() => {
        if (active) setFailure(t("login.connection_failed"));
      });
    return () => {
      active = false;
    };
  }, [api, t, user.Id]);

  const report = useCallback(
    (start = false) => {
      const item = itemRef.current;
      if (!item?.Id) return;
      const info = {
        ItemId: item.Id,
        MediaSourceId: item.MediaSources?.[0]?.Id,
        PositionTicks: state.current.positionTicks,
        IsPaused: !state.current.isPlaying,
        CanSeek: true,
        PlayMethod: "DirectPlay" as const,
      };
      void (
        start
          ? getPlaystateApi(api).reportPlaybackStart({
              playbackStartInfo: info,
            })
          : getPlaystateApi(api).reportPlaybackProgress({
              playbackProgressInfo: info,
            })
      ).catch(() => {});
    },
    [api],
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        gap: 24,
        maxWidth: 1440,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 28, fontWeight: "700" }}>
          Streamyfin
        </Text>
        <Text style={{ color: "#a3a3a3" }}>{user.Name}</Text>
        <SyncPlayAction testID='web-logout' secondary onPress={logout}>
          {t("home.settings.log_out_button")}
        </SyncPlayAction>
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 28,
          alignItems: "flex-start",
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: 380, maxWidth: 540 }}>
          <SyncPlayManager showLibrary={false} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 500, gap: 18 }}>
          {failure && (
            <Text
              accessibilityLiveRegion='assertive'
              style={{ color: "#fca5a5" }}
            >
              {failure}
            </Text>
          )}
          <Text style={{ fontSize: 22, fontWeight: "600" }}>
            {itemRef.current?.Name || "Choose a video"}
          </Text>
          {source && (
            <MpvPlayerView
              key={sourceGeneration}
              ref={player}
              source={source}
              style={{ width: "100%", height: 340 }}
              onLoad={() => report(true)}
              onPlaybackEnded={() => {
                if (sync.enabled) sync.notifyEnded();
              }}
              onPlaybackStateChange={({ nativeEvent }) => {
                state.current.isPlaying = nativeEvent.isPlaying ?? false;
                state.current.isReady = nativeEvent.isReadyToSeek ?? false;
                state.current.isBuffering = nativeEvent.isLoading ?? false;
                setPlaying(state.current.isPlaying);
                if (sync.enabled) {
                  sync.notifyBuffering(state.current.isBuffering);
                  if (state.current.isReady && !state.current.isBuffering)
                    sync.notifyReady();
                }
                report();
              }}
              onProgress={({ nativeEvent }) => {
                state.current.positionTicks = Math.round(
                  nativeEvent.position * TICKS,
                );
                setPosition(nativeEvent.position);
                setDuration(nativeEvent.duration);
                sync.notifyProgress();
                if (Date.now() - lastReport.current > 2000) {
                  lastReport.current = Date.now();
                  report();
                }
              }}
              onError={() =>
                setFailure(
                  t("player.an_error_occurred_while_playing_the_video"),
                )
              }
            />
          )}
          <input
            data-testid='web-seek'
            aria-label={"Seek"}
            type='range'
            min='0'
            max={duration || 1}
            step='0.1'
            value={position}
            disabled={!state.current.isReady}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (sync.enabled)
                void sync
                  .requestSeek(Math.round(value * TICKS))
                  .catch(() => {});
              else void player.current?.seekTo(value);
            }}
            style={{ width: "100%", accentColor: "#a855f7" }}
          />
          <Text testID='web-position' style={{ color: "#a3a3a3" }}>
            {Math.floor(position)} / {Math.floor(duration)} s
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <SyncPlayAction
              testID='web-play-pause'
              disabled={!state.current.isReady || sync.busy}
              onPress={() => {
                if (sync.enabled)
                  void (
                    playing ? sync.requestPause() : sync.requestUnpause()
                  ).catch(() => {});
                else
                  void (playing
                    ? player.current?.pause()
                    : player.current?.play());
              }}
            >
              {playing ? t("syncplay.pause") : t("syncplay.play")}
            </SyncPlayAction>
            <SyncPlayAction
              testID='web-mute'
              secondary
              onPress={() => {
                void player.current?.setMute(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? "Unmute" : "Mute"}
            </SyncPlayAction>
            {sync.enabled && (
              <SyncPlayAction
                testID='web-stop'
                secondary
                onPress={() => void sync.requestStop().catch(() => {})}
              >
                {t("player.stopPlayback")}
              </SyncPlayAction>
            )}
          </View>
          <Text style={{ fontSize: 22, fontWeight: "600", marginTop: 8 }}>
            {"Choose a video"}
          </Text>
          {sync.enabled && (
            <SyncPlayAction
              testID='web-play-all'
              disabled={!sync.connected || sync.busy || items.length === 0}
              onPress={() => {
                const ids = items.flatMap((item) => (item.Id ? [item.Id] : []));
                if (ids.length > 0) void sync.playItems(ids).catch(() => {});
              }}
            >
              {`${t("syncplay.play")} (${items.length})`}
            </SyncPlayAction>
          )}
          {items.map((item) => (
            <View key={item.Id} style={{ gap: 8 }}>
              <SyncPlayAction
                testID={`web-play-${item.Id}`}
                secondary
                disabled={!item.Id || sync.busy}
                onPress={() => {
                  if (!item.Id) return;
                  if (sync.enabled)
                    void sync.playItems([item.Id]).catch(() => {});
                  else
                    void launch(
                      {
                        itemId: item.Id,
                        playlistItemId: item.Id,
                        startPositionTicks: 0,
                      },
                      true,
                    ).catch(() =>
                      setFailure(t("syncplay.errors.playback_failed")),
                    );
                }}
              >
                {item.Name || item.Id || ""}
              </SyncPlayAction>
              {sync.enabled && item.Id && (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  <SyncPlayAction
                    testID={`web-next-${item.Id}`}
                    secondary
                    disabled={!sync.connected || sync.busy}
                    onPress={() =>
                      void sync
                        .queueItems([item.Id!], "QueueNext")
                        .catch(() => {})
                    }
                  >
                    {t("syncplay.play_next")}
                  </SyncPlayAction>
                  <SyncPlayAction
                    testID={`web-append-${item.Id}`}
                    secondary
                    disabled={!sync.connected || sync.busy}
                    onPress={() =>
                      void sync.queueItems([item.Id!], "Queue").catch(() => {})
                    }
                  >
                    {t("syncplay.append")}
                  </SyncPlayAction>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export function WebPreview() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserApp />
    </I18nextProvider>
  );
}
