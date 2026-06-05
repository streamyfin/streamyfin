export interface SearchableOption {
  titleKey: string;
  parentRoute: string;
  parentTitleKey: string;
  keywords?: string[];
  platforms?: ("ios" | "android")[];
}

/**
 * Internal options of sub-pages, for deep search ("index + internal settings").
 * Populated from a per-sub-page audit of every user-facing ListItem/dropdown row.
 * Every titleKey/parentTitleKey MUST be a real existing i18n key.
 */
export const SETTINGS_SEARCH_INDEX: SearchableOption[] = [
  // --- Playback & Controls -------------------------------------------------
  // MediaToggles
  {
    titleKey: "home.settings.media_controls.forward_skip_length",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["skip", "forward", "seconds"],
  },
  {
    titleKey: "home.settings.media_controls.rewind_length",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["rewind", "back", "seconds"],
  },
  // GestureControls
  {
    titleKey: "home.settings.gesture_controls.horizontal_swipe_skip",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["gesture", "swipe", "skip", "seek"],
  },
  {
    titleKey: "home.settings.gesture_controls.left_side_brightness",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["gesture", "swipe", "brightness", "left"],
  },
  {
    titleKey: "home.settings.gesture_controls.right_side_volume",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["gesture", "swipe", "volume", "right"],
  },
  {
    titleKey: "home.settings.gesture_controls.hide_volume_slider",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["volume", "slider", "hide", "gesture"],
  },
  {
    titleKey: "home.settings.gesture_controls.hide_brightness_slider",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["brightness", "slider", "hide", "gesture"],
  },
  // PlaybackControlsSettings (home.settings.other.*)
  {
    titleKey: "home.settings.other.video_orientation",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["orientation", "rotate", "landscape", "portrait"],
  },
  {
    titleKey: "home.settings.other.safe_area_in_controls",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["safe", "area", "notch", "controls", "inset"],
  },
  {
    titleKey: "home.settings.other.default_quality",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["quality", "bitrate", "resolution"],
  },
  {
    titleKey: "home.settings.other.default_playback_speed",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["playback", "speed", "rate"],
  },
  {
    titleKey: "home.settings.other.disable_haptic_feedback",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["haptic", "vibration", "feedback"],
  },
  {
    titleKey: "home.settings.other.auto_play_next_episode",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["autoplay", "auto", "next", "episode"],
  },
  {
    titleKey: "home.settings.other.max_auto_play_episode_count",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["autoplay", "auto", "episode", "count", "limit"],
  },
  // MpvBufferSettings
  {
    titleKey: "home.settings.buffer.cache_mode",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["cache", "buffer", "mode"],
  },
  {
    titleKey: "home.settings.buffer.buffer_duration",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["buffer", "duration", "cache", "seconds"],
  },
  {
    titleKey: "home.settings.buffer.max_cache_size",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["buffer", "cache", "size", "memory"],
  },
  // MpvVoSettings (Android only)
  {
    titleKey: "home.settings.vo_driver.vo_mode",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["video", "output", "driver", "gpu", "mpv"],
    platforms: ["android"],
  },

  // --- Audio & Subtitles ---------------------------------------------------
  // AudioToggles
  {
    titleKey: "home.settings.audio.set_audio_track",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["audio", "track", "remember", "previous"],
  },
  {
    titleKey: "home.settings.audio.audio_language",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["audio", "language", "default"],
  },
  {
    titleKey: "home.settings.audio.transcode_mode.title",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["audio", "transcode", "surround", "stereo", "passthrough"],
  },
  // SubtitleToggles
  {
    titleKey: "home.settings.subtitles.subtitle_language",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["subtitle", "caption", "language", "default"],
  },
  {
    titleKey: "home.settings.subtitles.subtitle_mode",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["subtitle", "caption", "mode", "forced"],
  },
  {
    titleKey: "home.settings.subtitles.set_subtitle_track",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["subtitle", "caption", "track", "remember", "previous"],
  },
  {
    titleKey: "home.settings.subtitles.subtitle_size",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["subtitle", "size", "caption", "scale", "font"],
  },

  // --- Music ---------------------------------------------------------------
  {
    titleKey: "home.settings.music.prefer_downloaded",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "downloaded", "offline", "local"],
  },
  {
    titleKey: "home.settings.music.lookahead_enabled",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "lookahead", "cache", "prefetch"],
  },
  {
    titleKey: "home.settings.music.lookahead_count",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "lookahead", "cache", "count", "tracks"],
  },
  {
    titleKey: "home.settings.music.max_cache_size",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "cache", "size", "storage"],
  },
  {
    titleKey: "home.settings.storage.clear_music_cache",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "cache", "clear", "storage"],
  },
  {
    titleKey: "home.settings.storage.delete_all_downloaded_songs",
    parentRoute: "/settings/music/page",
    parentTitleKey: "home.settings.music.title",
    keywords: ["music", "downloaded", "delete", "songs", "storage"],
  },

  // --- Appearance ----------------------------------------------------------
  {
    titleKey: "home.settings.other.show_custom_menu_links",
    parentRoute: "/settings/appearance/page",
    parentTitleKey: "home.settings.appearance.title",
    keywords: ["menu", "links", "custom", "navigation"],
  },
  {
    titleKey: "home.settings.appearance.merge_next_up_continue_watching",
    parentRoute: "/settings/appearance/page",
    parentTitleKey: "home.settings.appearance.title",
    keywords: ["continue", "watching", "next", "up", "merge", "home"],
  },
  {
    titleKey: "home.settings.other.hide_libraries",
    parentRoute: "/settings/appearance/page",
    parentTitleKey: "home.settings.appearance.title",
    keywords: ["hide", "libraries", "library", "home"],
  },
  {
    titleKey: "home.settings.appearance.hide_remote_session_button",
    parentRoute: "/settings/appearance/page",
    parentTitleKey: "home.settings.appearance.title",
    keywords: ["remote", "session", "button", "hide", "cast"],
  },

  // --- Network -------------------------------------------------------------
  {
    titleKey: "home.settings.network.remote_url",
    parentRoute: "/settings/network/page",
    parentTitleKey: "home.settings.network.title",
    keywords: ["remote", "url", "server", "address"],
  },
  {
    titleKey: "home.settings.network.active_url",
    parentRoute: "/settings/network/page",
    parentTitleKey: "home.settings.network.title",
    keywords: ["active", "url", "server", "connection"],
  },
  {
    titleKey: "home.settings.network.auto_switch_enabled",
    parentRoute: "/settings/network/page",
    parentTitleKey: "home.settings.network.title",
    keywords: ["auto", "switch", "local", "wifi", "network"],
  },
  {
    titleKey: "home.settings.network.local_url",
    parentRoute: "/settings/network/page",
    parentTitleKey: "home.settings.network.title",
    keywords: ["local", "url", "lan", "server", "address"],
  },
];
