export interface SearchableOption {
  titleKey: string;
  parentRoute: string;
  parentTitleKey: string;
  keywords?: string[];
}

/**
 * Internal options of sub-pages, for deep search ("index + internal settings").
 * SEED LIST — expand by auditing each sub-page component. Every titleKey/
 * parentTitleKey MUST be a real existing i18n key.
 */
export const SETTINGS_SEARCH_INDEX: SearchableOption[] = [
  {
    titleKey: "home.settings.media_controls.forward_skip_length",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["skip", "forward"],
  },
  {
    titleKey: "home.settings.media_controls.rewind_length",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["rewind"],
  },
  {
    titleKey: "home.settings.subtitles.subtitle_size",
    parentRoute: "/settings/audio-subtitles/page",
    parentTitleKey: "home.settings.audio_subtitles.title",
    keywords: ["subtitle", "size"],
  },
  {
    titleKey: "home.settings.gesture_controls.gesture_controls_title",
    parentRoute: "/settings/playback-controls/page",
    parentTitleKey: "home.settings.playback_controls.title",
    keywords: ["gesture", "swipe", "brightness", "volume"],
  },
];
