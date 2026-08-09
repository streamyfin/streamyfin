import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import type { OrientationLock as OrientationLockType } from "expo-screen-orientation";
import type { TFunction } from "i18next";
import { Platform } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import type {
  NativePlayerConfig,
  NativePlayerStrings,
  NativePlayerSubtitleStyle,
  NativePlayerTrackMenuItem,
  NativePlayerTrackMenus,
  NativePlayerTrickplay,
} from "@/modules/mpv-player";
// The TV-safe wrapper, NOT expo-screen-orientation directly: the native
// module is absent from TV binaries and a top-level value import crashes on
// launch (the type-only import above is erased at build time).
import { OrientationLock } from "@/packages/expo-screen-orientation";
import type { DownloadedItem } from "@/providers/Downloads/types";
import type { Settings } from "@/utils/atoms/settings";
import { getActivePlayerType } from "@/utils/atoms/settings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import {
  getPlayMethod,
  type PlayMethod,
  parseTranscodeReasons,
} from "@/utils/jellyfin/playMethod";
import {
  compareTracksForMenu,
  getExternalSubtitleUrl,
  getMpvAudioId,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import { COMMON_SUBTITLE_LANGUAGES } from "@/utils/opensubtitles/api";
import { generateDeviceProfile } from "@/utils/profiles/native";
import { ticksToSeconds } from "@/utils/time";
import { getTrickplayInfo } from "@/utils/trickplay";
import type { PlayRequest } from "./playRequest";

export interface NativePlayerStreamSeed {
  url: string;
  sessionId: string;
  mediaSource: MediaSourceInfo;
  requiredHttpHeaders?: Record<string, string>;
}

/**
 * Everything the coordinator needs to track the session that the config was
 * built for: session reporting, re-negotiation and next-episode carry-over.
 */
export interface NativePlayerSessionSeed {
  item: BaseItemDto;
  offline: boolean;
  downloadedItem: DownloadedItem | null;
  stream: NativePlayerStreamSeed;
  mediaSourceId?: string;
  bitrateValue?: number;
  audioIndex?: number;
  subtitleIndex: number;
  startTicks: number;
  playMethod: PlayMethod;
}

/** Localized labels for the native UI, built once per present. */
export const buildNativePlayerStrings = (
  t: TFunction,
): NativePlayerStrings => ({
  skipIntro: t("player.skip_intro"),
  skipCredits: t("player.skip_credits"),
  nextEpisode: t("player.next_episode"),
  playNow: t("common.play"),
  cancel: t("common.cancel"),
  episodes: t("common.episodes"),
  speed: t("player.menu.speed"),
  audio: t("player.menu.audio"),
  subtitles: t("player.menu.subtitles"),
  chapters: t("chapters.title"),
  technicalInfo: t("player.menu.show_technical_info"),
  playbackError: t("player.error"),
  close: t("common.close"),
  off: t("common.none"),
  quality: t("player.menu.quality"),
  subtitleSize: t("player.menu.subtitle_scale"),
  zoomToFill: t("player.zoom_to_fill"),
  subtitleSync: t("player.subtitle_sync"),
  audioSync: t("player.audio_sync"),
  volumeBoost: t("player.volume_boost"),
  dialogueBoost: t("player.dialogue_boost"),
  rotate: t("player.rotate"),
  lockControls: t("player.lock_controls"),
  sleepTimer: t("player.sleep_timer"),
  sleepTimerOff: t("player.sleep_timer_off"),
  searchSubtitles: t("player.search_subtitles"),
  searchFailed: t("player.search_failed"),
  noSubtitlesFound: t("player.no_subtitles_found"),
  unlock: t("player.unlock"),
  stillWatching: t("player.still_watching"),
  continueWatching: t("player.continue_watching"),
  goBack: t("player.go_back"),
  // Native substitutes %TIME% (appends the time when a translation lacks
  // the placeholder, e.g. sv "slutar").
  endsAt: t("player.ends_at", { time: "%TIME%" }),
  // Exit confirmation (TV Menu press — mirror of useRemoteControl's alert).
  // Native substitutes %TITLE% with the current item's title.
  stop: t("common.stop"),
  stopPlayback: t("player.stopPlayback"),
  stopPlayingTitle: t("player.stopPlayingTitle", { title: "%TITLE%" }),
  stopPlayingConfirm: t("player.stopPlayingConfirm"),
});

/**
 * The route/player validates the resume position as a whole non-negative
 * integer (deep-linkable params), falling back to the item's stored resume
 * position — mirror of direct-player.tsx startTicks.
 */
const resolveStartTicks = (
  raw: number | undefined,
  item: BaseItemDto,
): number => {
  if (raw !== undefined && Number.isInteger(raw) && raw >= 0) return raw;
  return item.UserData?.PlaybackPositionTicks ?? 0;
};

const mapOrientationLock = (
  lock: OrientationLockType | undefined,
): "landscape" | "none" => {
  switch (lock) {
    case OrientationLock.PORTRAIT:
    case OrientationLock.PORTRAIT_UP:
    case OrientationLock.PORTRAIT_DOWN:
    case OrientationLock.DEFAULT:
    case OrientationLock.ALL:
      return "none";
    default:
      // LANDSCAPE / LANDSCAPE_LEFT / LANDSCAPE_RIGHT and the unset case:
      // video playback defaults to landscape like the JS player route.
      return "landscape";
  }
};

/** Mirror of the subtitle-style effect at direct-player.tsx (mpvSubtitle*). */
const buildSubtitleStyle = (settings: Settings): NativePlayerSubtitleStyle => {
  const style: NativePlayerSubtitleStyle = {
    scale: settings.mpvSubtitleScale,
    marginY: settings.mpvSubtitleMarginY,
    alignX: settings.mpvSubtitleAlignX,
    alignY: settings.mpvSubtitleAlignY,
  };
  if (settings.mpvSubtitleBackgroundEnabled) {
    const opacity = settings.mpvSubtitleBackgroundOpacity ?? 75;
    const alphaHex = Math.round((opacity / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    style.borderStyle = "background-box";
    style.backgroundColor = `#000000${alphaHex}`;
    style.assOverride = "force";
  } else {
    style.borderStyle = "outline-and-shadow";
    style.backgroundColor = "#00000000";
    style.assOverride = "no";
  }
  return style;
};

/** Mirror of hooks/usePlaybackSpeed.ts (media > series > default). */
const resolveInitialPlaybackSpeed = (
  item: BaseItemDto,
  settings: Settings,
): number => {
  let speed = settings.defaultPlaybackSpeed;
  if (item.SeriesId && settings.playbackSpeedPerShow[item.SeriesId]) {
    speed = settings.playbackSpeedPerShow[item.SeriesId];
  }
  if (item.Id && settings.playbackSpeedPerMedia[item.Id] !== undefined) {
    speed = settings.playbackSpeedPerMedia[item.Id];
  }
  return speed ?? 1.0;
};

const toFileUri = (path: string): string =>
  path.startsWith("/") ? `file://${path}` : path;

/**
 * Trickplay descriptor with fully-formed per-sheet URLs so the native side
 * needs no URL templating (offline uses the downloaded sheet files — same
 * path shape as hooks/useTrickplay.ts getTrickplayUrl).
 */
export const buildTrickplayDescriptor = (
  item: BaseItemDto,
  options: {
    api: Api | null;
    offline: boolean;
    downloadedItem: DownloadedItem | null;
  },
): NativePlayerTrickplay | undefined => {
  const info = getTrickplayInfo(item);
  if (!info) return undefined;
  const { Interval, TileWidth, TileHeight, Width, Height } = info.data;
  if (!Interval || !TileWidth || !TileHeight || !Width || !Height) {
    return undefined;
  }

  const sheetUrls: string[] = [];
  for (let index = 0; index < info.totalImageSheets; index++) {
    if (options.offline && options.downloadedItem?.trickPlayData?.path) {
      sheetUrls.push(
        toFileUri(`${options.downloadedItem.trickPlayData.path}${index}.jpg`),
      );
    } else if (options.api) {
      sheetUrls.push(
        `${options.api.basePath}/Videos/${item.Id}/Trickplay/${info.resolution}/${index}.jpg?ApiKey=${options.api.accessToken}`,
      );
    }
  }
  if (sheetUrls.length === 0) return undefined;

  return {
    intervalMs: Interval,
    tileCols: TileWidth,
    tileRows: TileHeight,
    thumbWidth: Width,
    thumbHeight: Height,
    sheetUrls,
  };
};

/**
 * ISO 639-2/T → /B. Jellyfin's CultureDto.ThreeLetterISOLanguageName carries
 * .NET-style /T codes ("fra", "deu"), while COMMON_SUBTITLE_LANGUAGES and the
 * OpenSubtitles 3→2 mapping use /B codes ("fre", "ger") — an unmapped /T code
 * matches neither the picker nor the fallback search. ron maps to the app
 * list's existing "rom" entry rather than the standard "rum".
 */
const ISO_639_2_T_TO_B: Record<string, string> = {
  bod: "tib",
  ces: "cze",
  cym: "wel",
  deu: "ger",
  ell: "gre",
  eus: "baq",
  fas: "per",
  fra: "fre",
  hye: "arm",
  isl: "ice",
  kat: "geo",
  mkd: "mac",
  mri: "mao",
  msa: "may",
  mya: "bur",
  nld: "dut",
  ron: "rom",
  slk: "slo",
  sqi: "alb",
  zho: "chi",
};

/**
 * Sentinel jellyfinIndex for a client-side downloaded sidecar subtitle
 * (OpenSubtitles fallback). It exists only on the mpv handle, not in the
 * Jellyfin media source — the coordinator maps this index back to the local
 * file instead of a server stream.
 */
export const LOCAL_SUBTITLE_MENU_INDEX = -1000;

/**
 * Menu display models for the native track menus. Selection stays in JS —
 * these only carry labels, Jellyfin indices and the requiresReload flag
 * (burned-in subtitle / audio-under-transcode → stream re-negotiation).
 */
export const buildTrackMenus = (options: {
  mediaSource: MediaSourceInfo;
  audioIndex: number | undefined;
  subtitleIndex: number;
  offline: boolean;
  downloadedItem: DownloadedItem | null;
  offLabel: string;
  /** Current max streaming bitrate (undefined = Max). */
  bitrateValue?: number;
  /** Client-side downloaded sidecar subtitle, listed after the server tracks. */
  localSubtitle?: { label: string; selected: boolean };
}): NativePlayerTrackMenus => {
  const isTranscoding = Boolean(options.mediaSource.TranscodingUrl);
  const streams = options.mediaSource.MediaStreams ?? [];

  const subtitleItems: NativePlayerTrackMenuItem[] = [
    {
      label: options.offLabel,
      jellyfinIndex: -1,
      selected: options.subtitleIndex === -1,
    },
    ...streams
      .filter((s) => s.Type === "Subtitle")
      .sort(compareTracksForMenu)
      .map((s) => ({
        label: s.DisplayTitle ?? s.Language ?? `#${s.Index}`,
        jellyfinIndex: s.Index ?? -1,
        selected: s.Index === options.subtitleIndex,
        // Burned-in image subs are pixels, not tracks: switching to (or away
        // from) one while transcoding re-processes the stream server-side.
        requiresReload: isTranscoding && isImageBasedSubtitle(s),
      })),
  ];
  if (options.localSubtitle) {
    subtitleItems.push({
      label: options.localSubtitle.label,
      jellyfinIndex: LOCAL_SUBTITLE_MENU_INDEX,
      selected: options.localSubtitle.selected,
    });
  }

  // A transcoded stream (and a transcoded download) only carries the audio
  // track that was encoded into it — other tracks require re-negotiation
  // (online) or simply don't exist (offline download).
  const offlineTranscoded =
    options.offline && options.downloadedItem?.userData?.isTranscoded === true;
  const audioItems: NativePlayerTrackMenuItem[] = streams
    .filter((s) => s.Type === "Audio")
    .filter((s) => !offlineTranscoded || s.Index === options.audioIndex)
    .map((s) => ({
      label: s.DisplayTitle ?? s.Language ?? `#${s.Index}`,
      jellyfinIndex: s.Index ?? -1,
      selected: s.Index === options.audioIndex,
      requiresReload: isTranscoding,
    }));

  // Quality/bitrate menu (JS DropdownView parity): online only; changing it
  // always re-negotiates the stream, so every entry is requiresReload.
  const qualityItems: NativePlayerTrackMenuItem[] = options.offline
    ? []
    : BITRATES.map((bitrate) => ({
        label: bitrate.key,
        jellyfinIndex: bitrate.value ?? -1,
        selected: (bitrate.value ?? -1) === (options.bitrateValue ?? -1),
        requiresReload: true,
      }));

  return { subtitles: subtitleItems, audio: audioItems, quality: qualityItems };
};

const buildMetadata = (item: BaseItemDto, api: Api | null) => {
  const isEpisode = item.Type === "Episode";
  let subtitle: string | undefined;
  if (isEpisode) {
    const epNumber =
      item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined
        ? `S${item.ParentIndexNumber}E${item.IndexNumber}`
        : undefined;
    subtitle = [item.SeriesName, epNumber].filter(Boolean).join(" · ");
  } else if (item.ProductionYear) {
    subtitle = String(item.ProductionYear);
  }
  return {
    itemId: item.Id ?? undefined,
    title: item.Name ?? undefined,
    subtitle: subtitle || undefined,
    artworkUri:
      getPrimaryImageUrl({ api, item, quality: 90, width: 500 }) ?? undefined,
    isEpisode,
  };
};

/**
 * Replicates direct-player.tsx's fetchItemData + fetchStreamData + videoSource
 * as one async function for the presented native player. Segments, the
 * next-episode preview and the episode list arrive later via updateSegments /
 * updateNextEpisode / updateEpisodeList (they need queries the caller owns).
 */
export async function buildNativePlayerConfig(params: {
  api: Api | null;
  userId: string | undefined;
  settings: Settings;
  req: PlayRequest;
  getDownloadedItemById: (id: string) => DownloadedItem | undefined;
  strings: NativePlayerStrings;
  /** Skip the item refetch when the caller already has it (episode switch). */
  item?: BaseItemDto;
}): Promise<{
  config: NativePlayerConfig;
  seed: NativePlayerSessionSeed;
} | null> {
  const { api, userId, settings, req, strings } = params;
  const offline = req.offline;

  // 1. Item (+ download record when offline)
  let item = params.item ?? null;
  let downloadedItem: DownloadedItem | null = null;
  if (offline) {
    downloadedItem = params.getDownloadedItemById(req.itemId) ?? null;
    if (!item) item = (downloadedItem?.item as BaseItemDto) ?? null;
    if (!downloadedItem) return null;
  } else if (!item) {
    if (!api) return null;
    const res = await getUserLibraryApi(api).getItem({
      itemId: req.itemId,
      userId,
    });
    item = res.data;
  }
  if (!item?.Id) return null;

  const startTicks = resolveStartTicks(req.playbackPositionTicks, item);
  const audioIndex =
    req.audioIndex ??
    (offline ? downloadedItem?.userData?.audioStreamIndex : undefined);
  const subtitleIndex = req.subtitleIndex ?? -1;
  const bitrateValue = req.bitrateValue ?? BITRATES[0].value;

  // 2. Stream (offline: local file; online: PlaybackInfo negotiation with the
  // mpv device profile — the native player renders through the MPV engine)
  let stream: NativePlayerStreamSeed;
  if (offline && downloadedItem) {
    stream = {
      url: downloadedItem.videoFilePath,
      sessionId: "",
      mediaSource: downloadedItem.mediaSource,
    };
  } else {
    if (!api || !userId) return null;
    const res = await getStreamUrl({
      api,
      item,
      startTimeTicks: startTicks,
      userId,
      audioStreamIndex: audioIndex,
      maxStreamingBitrate: bitrateValue,
      mediaSourceId: req.mediaSourceId,
      subtitleStreamIndex: subtitleIndex,
      deviceProfile: generateDeviceProfile({
        player: getActivePlayerType(settings),
        audioMode: settings.audioTranscodeMode,
      }),
    });
    if (!res?.url || !res.mediaSource || !res.sessionId) return null;
    stream = {
      url: res.url,
      sessionId: res.sessionId,
      mediaSource: res.mediaSource,
      requiredHttpHeaders: res.requiredHttpHeaders,
    };
  }

  const mediaSource = stream.mediaSource;
  const isTranscoding = Boolean(mediaSource.TranscodingUrl);
  const playMethod = getPlayMethod(stream, offline);

  // 3. External subtitles + initial audio (mirror of the videoSource memo)
  const externalSubs = mediaSource.MediaStreams?.filter(
    (s) => s.Type === "Subtitle" && s.DeliveryMethod === "External",
  )
    .map((s) => getExternalSubtitleUrl(s, { offline, basePath: api?.basePath }))
    .filter((u): u is string => !!u);

  const initialAudioId = getMpvAudioId(mediaSource, audioIndex, isTranscoding);
  const videoStream = mediaSource.MediaStreams?.find((s) => s.Type === "Video");

  // 4. Headers — online only, auth skipped for remote/external streams
  let headers: Record<string, string> | undefined;
  if (!offline) {
    const built: Record<string, string> = {};
    const isRemoteStream =
      mediaSource.IsRemote && mediaSource.Protocol === "Http";
    if (api?.accessToken && !isRemoteStream) {
      built.Authorization = `MediaBrowser Token="${api.accessToken}"`;
    }
    if (stream.requiredHttpHeaders) {
      Object.assign(built, stream.requiredHttpHeaders);
    }
    if (Object.keys(built).length > 0) headers = built;
  }

  const config: NativePlayerConfig = {
    stream: {
      url: stream.url,
      headers,
      externalSubtitles:
        externalSubs && externalSubs.length > 0 ? externalSubs : undefined,
      startPositionSec: ticksToSeconds(startTicks),
      autoplay: true,
      initialAudioMpvId: initialAudioId,
      playMethod,
      transcodeReasons: parseTranscodeReasons(mediaSource.TranscodingUrl),
      cacheConfig: {
        enabled: settings.mpvCacheEnabled,
        cacheSeconds: settings.mpvCacheSeconds,
        maxBytes: settings.mpvDemuxerMaxBytes,
        maxBackBytes: settings.mpvDemuxerMaxBackBytes,
      },
      videoWidth: videoStream?.Width ?? undefined,
      videoHeight: videoStream?.Height ?? undefined,
    },
    metadata: buildMetadata(item, api),
    chapters:
      item.Chapters?.map((c) => ({
        name: c.Name ?? undefined,
        startSec: ticksToSeconds(c.StartPositionTicks ?? 0),
      })) ?? [],
    trickplay: buildTrickplayDescriptor(item, {
      api,
      offline,
      downloadedItem,
    }),
    tracks: buildTrackMenus({
      mediaSource,
      audioIndex,
      subtitleIndex,
      offline,
      downloadedItem,
      offLabel: strings.off ?? "None",
      bitrateValue,
    }),
    subtitleStyle: buildSubtitleStyle(settings),
    ui: {
      // TV: no orientation, no PiP (v1), no haptics, and volume/brightness
      // belong to the remote/HDMI-CEC — the phone-only chrome stays off.
      orientationLock: Platform.isTV
        ? "none"
        : mapOrientationLock(settings.defaultVideoOrientation),
      allowPip: !Platform.isTV,
      seekForwardSec: settings.forwardSkipTime,
      seekBackwardSec: settings.rewindSkipTime,
      initialPlaybackSpeed: resolveInitialPlaybackSpeed(item, settings),
      hapticsEnabled: !Platform.isTV && !settings.disableHapticFeedback,
      showVolumeSlider: !Platform.isTV && !settings.hideVolumeSlider,
      showBrightnessSlider: !Platform.isTV && !settings.hideBrightnessSlider,
      // Touch gestures — no equivalent on the Siri remote.
      holdToSpeedEnabled: !Platform.isTV && settings.enableHoldToSpeed,
      pinchToZoomEnabled: !Platform.isTV && settings.enablePinchToZoom,
      // Server search needs connectivity; the OpenSubtitles fallback needs
      // the network either way — offline sessions hide the entry.
      subtitleSearchEnabled: !offline && !!api,
      subtitleSearchLanguages: COMMON_SUBTITLE_LANGUAGES.map((l) => ({
        code: l.code,
        name: l.name,
      })),
      subtitleSearchDefaultLanguage: (() => {
        const raw =
          settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName?.toLowerCase();
        if (!raw) return "eng";
        return ISO_639_2_T_TO_B[raw] ?? raw;
      })(),
      strings,
    },
  };

  return {
    config,
    seed: {
      item,
      offline,
      downloadedItem,
      stream,
      mediaSourceId: req.mediaSourceId ?? mediaSource.Id ?? undefined,
      bitrateValue,
      audioIndex,
      subtitleIndex,
      startTicks,
      playMethod,
    },
  };
}
