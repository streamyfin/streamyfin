import {
  type CultureDto,
  SubtitlePlaybackMode,
} from "@jellyfin/sdk/lib/generated-client";
import { useQueryClient } from "@tanstack/react-query";
import { Directory, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { TVPasswordEntryModal } from "@/components/login/TVPasswordEntryModal";
import { TVPINEntryModal } from "@/components/login/TVPINEntryModal";
import type { TVOptionItem } from "@/components/tv";
import {
  TVCustomHeadersSection,
  TVLogoutButton,
  TVSectionHeader,
  TVSettingsOptionButton,
  TVSettingsRow,
  TVSettingsStepper,
  TVSettingsTextInput,
  TVSettingsToggle,
} from "@/components/tv";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useMediaPreferences } from "@/hooks/useMediaPreferences";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVUserSwitchModal } from "@/hooks/useTVUserSwitchModal";
import { APP_LANGUAGES } from "@/i18n";
import { clearCache as clearAudioCache } from "@/providers/AudioStorage";
import {
  apiAtom,
  cacheVersionAtom,
  useJellyfin,
  userAtom,
} from "@/providers/JellyfinProvider";
import {
  AudioTranscodeMode,
  defaultValues,
  getActiveVideoPlayer,
  InactivityTimeout,
  isNativePlayerSupportedTV,
  type MpvCacheMode,
  type MpvVoDriver,
  type SegmentSkipMode,
  TVTypographyScale,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";
import { INTEGRATION_CONFIG_KEY_PREFIX } from "@/utils/customHeaders";
import { ORIGINAL_LANGUAGE } from "@/utils/jellyfin/serverVersion";
import { storage } from "@/utils/mmkv";
import { scaleSize } from "@/utils/scaleSize";
import {
  getPreviousServers,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { clearTopShelfCacheSafely } from "@/utils/topshelf/cache";

const SEGMENT_SKIP_ROWS: {
  key:
    | "skipIntro"
    | "skipOutro"
    | "skipRecap"
    | "skipCommercial"
    | "skipPreview";
  labelKey: string;
}[] = [
  { key: "skipIntro", labelKey: "skip_intro" },
  { key: "skipOutro", labelKey: "skip_outro" },
  { key: "skipRecap", labelKey: "skip_recap" },
  { key: "skipCommercial", labelKey: "skip_commercial" },
  { key: "skipPreview", labelKey: "skip_preview" },
];

export default function SettingsTV() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { logout, loginWithSavedCredential, loginWithPassword } = useJellyfin();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const [, setCacheVersion] = useAtom(cacheVersionAtom);
  const { showOptions } = useTVOptionModal();
  const {
    updateMediaSettings,
    cultures,
    supportsOriginalAudioLanguage,
    isReady,
  } = useMediaPreferences();
  const { showUserSwitchModal } = useTVUserSwitchModal();
  const typography = useScaledTVTypography();
  const queryClient = useQueryClient();

  // Local state for OpenSubtitles API key (only commit on blur)
  const [openSubtitlesApiKey, setOpenSubtitlesApiKey] = useState(
    settings.openSubtitlesApiKey || "",
  );

  // PIN/Password modal state for user switching
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedServer, setSelectedServer] = useState<SavedServer | null>(
    null,
  );
  const [selectedAccount, setSelectedAccount] =
    useState<SavedServerAccount | null>(null);

  // Track if any modal is open to disable background focus
  const isAnyModalOpen = pinModalVisible || passwordModalVisible;

  // Get current server and other accounts
  const currentServer = useMemo(() => {
    if (!api?.basePath) return null;
    const servers = getPreviousServers();
    return servers.find((s) => s.address === api.basePath) || null;
  }, [api?.basePath]);

  const otherAccounts = useMemo(() => {
    if (!currentServer || !user?.Id) return [];
    return currentServer.accounts.filter(
      (account) => account.userId !== user.Id,
    );
  }, [currentServer, user?.Id]);

  const hasOtherAccounts = otherAccounts.length > 0;

  // Handle account selection from modal
  const handleAccountSelect = async (account: SavedServerAccount) => {
    if (!currentServer) return;

    if (account.securityType === "none") {
      // Direct login with saved credential
      try {
        await loginWithSavedCredential(currentServer.address, account.userId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t("server.session_expired");
        const isSessionExpired = errorMessage.includes(
          t("server.session_expired"),
        );
        Alert.alert(
          isSessionExpired
            ? t("server.session_expired")
            : t("login.connection_failed"),
          isSessionExpired ? t("server.please_login_again") : errorMessage,
        );
      }
    } else if (account.securityType === "pin") {
      // Show PIN modal
      setSelectedServer(currentServer);
      setSelectedAccount(account);
      setPinModalVisible(true);
    } else if (account.securityType === "password") {
      // Show password modal
      setSelectedServer(currentServer);
      setSelectedAccount(account);
      setPasswordModalVisible(true);
    }
  };

  // Handle successful PIN entry
  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (selectedServer && selectedAccount) {
      try {
        await loginWithSavedCredential(
          selectedServer.address,
          selectedAccount.userId,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t("server.session_expired");
        const isSessionExpired = errorMessage.includes(
          t("server.session_expired"),
        );
        Alert.alert(
          isSessionExpired
            ? t("server.session_expired")
            : t("login.connection_failed"),
          isSessionExpired ? t("server.please_login_again") : errorMessage,
        );
      }
    }
    setSelectedServer(null);
    setSelectedAccount(null);
  };

  // Handle password submission
  const handlePasswordSubmit = async (password: string) => {
    if (selectedServer && selectedAccount) {
      await loginWithPassword(
        selectedServer.address,
        selectedAccount.username,
        password,
      );
    }
    setPasswordModalVisible(false);
    setSelectedServer(null);
    setSelectedAccount(null);
  };

  // Handle switch user button press
  const handleSwitchUser = () => {
    if (!currentServer || !user?.Id) return;
    showUserSwitchModal(currentServer, user.Id, {
      onAccountSelect: handleAccountSelect,
    });
  };

  // Handle clearing all cache in the entire app
  const handleClearCache = async () => {
    Alert.alert(
      t("home.settings.storage.clear_all_cache_confirm"),
      t("home.settings.storage.clear_all_cache_confirm_desc"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("common.ok"),
          onPress: async () => {
            try {
              // 1. Clear React Query Cache (memory & MMKV)
              storage.remove("REACT_QUERY_OFFLINE_CACHE");
              await queryClient.resetQueries();

              // 2. Clear expo-image cache (memory & disk)
              await Image.clearDiskCache();
              Image.clearMemoryCache();

              // 3. Clear AudioStorage (music) cache
              await clearAudioCache();

              // 4. Clear TopShelf cache
              clearTopShelfCacheSafely();

              // 5. Clear Subtitle Cache
              storage.remove("downloadedSubtitles.json");
              const subtitlesDir = new Directory(
                Paths.cache,
                "streamyfin-subtitles",
              );
              if (subtitlesDir.exists) {
                await subtitlesDir.delete();
              }

              // 6. Clear MMKV caches like extracted image colors and other non-essential storage keys
              const keysToKeep = [
                "settings",
                "serverUrl",
                "token",
                "user",
                "deviceId",
                "previousServers",
                "hasAskedForNotificationPermission",
                "hasShownIntro",
                "multiAccountMigrated",
                "selectedTVServer",
                "downloads.v2.json",
              ];
              const allKeys = storage.getAllKeys();
              for (const key of allKeys) {
                // The per-integration header configs are settings, not cache —
                // clearing them would silently drop the user's proxy auth.
                if (
                  !keysToKeep.includes(key) &&
                  !key.startsWith(INTEGRATION_CONFIG_KEY_PREFIX)
                ) {
                  storage.remove(key);
                }
              }

              // 7. Increment cache version to force remount of components
              setCacheVersion((v) => v + 1);
            } catch (error) {
              console.error("Failed to clear cache:", error);
              Alert.alert(
                t("home.settings.toasts.error_deleting_files"),
                t("home.settings.storage.clear_all_cache_error_desc"),
              );
            }
          },
        },
      ],
    );
  };

  const currentAudioTranscode =
    settings.audioTranscodeMode || AudioTranscodeMode.Auto;
  const currentSubtitleMode =
    settings.subtitleMode || SubtitlePlaybackMode.Default;
  const currentAlignX = settings.subtitleAlignX ?? "center";
  const currentAlignY = settings.subtitleAlignY ?? "bottom";
  const currentTypographyScale =
    settings.tvTypographyScale || TVTypographyScale.Default;
  const currentCacheMode = settings.mpvCacheEnabled ?? "auto";
  const currentVoDriver = settings.mpvVoDriver ?? "gpu-next";
  const currentLanguage = settings.preferedLanguage;

  // Video player selection. MPV is the default; ExoPlayer is only offered
  // as an opt-in alternative on Android TV. The selector is hidden on
  // other platforms. Apple TV instead gets an opt-in toggle for the
  // experimental fully-native tvOS player (default off).
  const isAndroidTv = Platform.OS === "android" && Platform.isTV;
  const currentVideoPlayer = getActiveVideoPlayer(settings);
  const isMpv = currentVideoPlayer !== VideoPlayer.ExoPlayer;

  // Shared style for the ExoPlayer / MPV limitation notes shown under the
  // selector when the respective player is active. All pixel values scaled
  // so the layout holds on 4K TVs (see utils/scaleSize.ts).
  const playerNoteStyle = {
    color: "#9CA3AF",
    fontSize: typography.callout - 2,
    marginTop: scaleSize(4),
    marginBottom: scaleSize(12),
    marginLeft: scaleSize(8),
    marginRight: scaleSize(8),
  } as const;

  // Audio transcoding options
  const audioTranscodeModeOptions: TVOptionItem<AudioTranscodeMode>[] = useMemo(
    () => [
      {
        label: t("home.settings.audio.transcode_mode.auto"),
        value: AudioTranscodeMode.Auto,
        selected: currentAudioTranscode === AudioTranscodeMode.Auto,
      },
      {
        label: t("home.settings.audio.transcode_mode.stereo"),
        value: AudioTranscodeMode.ForceStereo,
        selected: currentAudioTranscode === AudioTranscodeMode.ForceStereo,
      },
      {
        label: t("home.settings.audio.transcode_mode.5_1"),
        value: AudioTranscodeMode.Allow51,
        selected: currentAudioTranscode === AudioTranscodeMode.Allow51,
      },
      {
        label: t("home.settings.audio.transcode_mode.passthrough"),
        value: AudioTranscodeMode.AllowAll,
        selected: currentAudioTranscode === AudioTranscodeMode.AllowAll,
      },
    ],
    [t, currentAudioTranscode],
  );

  const languageName = (culture: CultureDto | null | undefined) =>
    culture?.DisplayName ||
    culture?.ThreeLetterISOLanguageName ||
    t("home.settings.subtitles.unknown_language");

  const audioLanguageOptions: TVOptionItem<CultureDto | null>[] =
    useMemo(() => {
      const selectedLanguage =
        settings.defaultAudioLanguage?.ThreeLetterISOLanguageName;
      return [
        {
          label: t("home.settings.audio.none"),
          value: null,
          selected: !settings.defaultAudioLanguage,
        },
        ...(supportsOriginalAudioLanguage
          ? [
              {
                label: t("home.settings.audio.original_language"),
                value: {
                  ThreeLetterISOLanguageName: ORIGINAL_LANGUAGE,
                } as CultureDto,
                selected: selectedLanguage === ORIGINAL_LANGUAGE,
              },
            ]
          : []),
        ...cultures.map((culture) => ({
          label: languageName(culture),
          value: culture,
          selected:
            selectedLanguage !== undefined &&
            culture.ThreeLetterISOLanguageName === selectedLanguage,
        })),
      ];
    }, [
      cultures,
      settings.defaultAudioLanguage,
      supportsOriginalAudioLanguage,
      t,
    ]);

  const subtitleLanguageOptions: TVOptionItem<CultureDto | null>[] =
    useMemo(() => {
      const selectedLanguage =
        settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName;
      return [
        {
          label: t("home.settings.subtitles.none"),
          value: null,
          selected: !settings.defaultSubtitleLanguage,
        },
        ...cultures.map((culture) => ({
          label: languageName(culture),
          value: culture,
          selected:
            selectedLanguage !== undefined &&
            culture.ThreeLetterISOLanguageName === selectedLanguage,
        })),
      ];
    }, [cultures, settings.defaultSubtitleLanguage, t]);

  // Subtitle mode options
  const subtitleModeOptions: TVOptionItem<SubtitlePlaybackMode>[] = useMemo(
    () => [
      {
        label: t("home.settings.subtitles.modes.Default"),
        value: SubtitlePlaybackMode.Default,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Default,
      },
      {
        label: t("home.settings.subtitles.modes.Smart"),
        value: SubtitlePlaybackMode.Smart,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Smart,
      },
      {
        label: t("home.settings.subtitles.modes.OnlyForced"),
        value: SubtitlePlaybackMode.OnlyForced,
        selected: currentSubtitleMode === SubtitlePlaybackMode.OnlyForced,
      },
      {
        label: t("home.settings.subtitles.modes.Always"),
        value: SubtitlePlaybackMode.Always,
        selected: currentSubtitleMode === SubtitlePlaybackMode.Always,
      },
      {
        label: t("home.settings.subtitles.modes.None"),
        value: SubtitlePlaybackMode.None,
        selected: currentSubtitleMode === SubtitlePlaybackMode.None,
      },
    ],
    [t, currentSubtitleMode],
  );

  const fontOptions: TVOptionItem<string>[] = useMemo(
    () =>
      [
        {
          label: t("home.settings.subtitles.fonts.system"),
          value: "System",
        },
        {
          label: t("home.settings.subtitles.fonts.sans_serif"),
          value: "sans-serif",
        },
        { label: t("home.settings.subtitles.fonts.serif"), value: "serif" },
        {
          label: t("home.settings.subtitles.fonts.monospace"),
          value: "monospace",
        },
        {
          label: t("home.settings.subtitles.fonts.dyslexic"),
          value: "opendyslexic",
        },
      ].map((font) => ({
        ...font,
        selected: font.value === settings.subtitleFont,
      })),
    [settings.subtitleFont, t],
  );

  const subtitleColorOptions: TVOptionItem<string>[] = useMemo(
    () =>
      [
        { label: t("home.settings.subtitles.colors.white"), value: "#FFFFFF" },
        { label: t("home.settings.subtitles.colors.yellow"), value: "#FFFF00" },
        { label: t("home.settings.subtitles.colors.cyan"), value: "#00FFFF" },
        { label: t("home.settings.subtitles.colors.green"), value: "#00FF00" },
        {
          label: t("home.settings.subtitles.colors.magenta"),
          value: "#FF00FF",
        },
        { label: t("home.settings.subtitles.colors.red"), value: "#FF0000" },
      ].map((color) => ({
        ...color,
        selected: color.value === settings.subtitleColor,
      })),
    [settings.subtitleColor, t],
  );

  // MPV alignment options
  const alignXOptions: TVOptionItem<string>[] = useMemo(
    () => [
      {
        label: t("home.settings.subtitles.align.left"),
        value: "left",
        selected: currentAlignX === "left",
      },
      {
        label: t("home.settings.subtitles.align.center"),
        value: "center",
        selected: currentAlignX === "center",
      },
      {
        label: t("home.settings.subtitles.align.right"),
        value: "right",
        selected: currentAlignX === "right",
      },
    ],
    [currentAlignX, t],
  );

  const alignYOptions: TVOptionItem<string>[] = useMemo(
    () => [
      {
        label: t("home.settings.subtitles.align.top"),
        value: "top",
        selected: currentAlignY === "top",
      },
      {
        label: t("home.settings.subtitles.align.center"),
        value: "center",
        selected: currentAlignY === "center",
      },
      {
        label: t("home.settings.subtitles.align.bottom"),
        value: "bottom",
        selected: currentAlignY === "bottom",
      },
    ],
    [currentAlignY, t],
  );

  // Cache mode options
  const cacheModeOptions: TVOptionItem<MpvCacheMode>[] = useMemo(
    () => [
      {
        label: t("home.settings.buffer.cache_auto"),
        value: "auto",
        selected: currentCacheMode === "auto",
      },
      {
        label: t("home.settings.buffer.cache_yes"),
        value: "yes",
        selected: currentCacheMode === "yes",
      },
      {
        label: t("home.settings.buffer.cache_no"),
        value: "no",
        selected: currentCacheMode === "no",
      },
    ],
    [t, currentCacheMode],
  );

  // VO driver options
  const voDriverOptions: TVOptionItem<MpvVoDriver>[] = useMemo(
    () => [
      {
        label: t("home.settings.vo_driver.gpu_next"),
        value: "gpu-next",
        selected: currentVoDriver === "gpu-next",
      },
      {
        label: t("home.settings.vo_driver.gpu"),
        value: "gpu",
        selected: currentVoDriver === "gpu",
      },
    ],
    [t, currentVoDriver],
  );

  // Video player backend options (Android TV only)
  const videoPlayerOptions: TVOptionItem<VideoPlayer>[] = useMemo(
    () => [
      {
        label: t("home.settings.video_player.exoplayer"),
        value: VideoPlayer.ExoPlayer,
        selected: currentVideoPlayer === VideoPlayer.ExoPlayer,
      },
      {
        label: t("home.settings.video_player.mpv"),
        value: VideoPlayer.MPV,
        selected: currentVideoPlayer === VideoPlayer.MPV,
      },
    ],
    [t, currentVideoPlayer],
  );

  // Typography scale options
  const typographyScaleOptions: TVOptionItem<TVTypographyScale>[] = useMemo(
    () => [
      {
        label: t("home.settings.appearance.display_size_small"),
        value: TVTypographyScale.Small,
        selected: currentTypographyScale === TVTypographyScale.Small,
      },
      {
        label: t("home.settings.appearance.display_size_default"),
        value: TVTypographyScale.Default,
        selected: currentTypographyScale === TVTypographyScale.Default,
      },
      {
        label: t("home.settings.appearance.display_size_large"),
        value: TVTypographyScale.Large,
        selected: currentTypographyScale === TVTypographyScale.Large,
      },
      {
        label: t("home.settings.appearance.display_size_extra_large"),
        value: TVTypographyScale.ExtraLarge,
        selected: currentTypographyScale === TVTypographyScale.ExtraLarge,
      },
    ],
    [t, currentTypographyScale],
  );

  // Language options
  const languageOptions: TVOptionItem<string | undefined>[] = useMemo(
    () => [
      {
        label: t("home.settings.languages.system"),
        value: undefined,
        selected: !currentLanguage,
      },
      ...APP_LANGUAGES.map((lang) => ({
        label: lang.label,
        value: lang.value,
        selected: currentLanguage === lang.value,
      })),
    ],
    [t, currentLanguage],
  );

  // Inactivity timeout options (TV security feature)
  const currentInactivityTimeout =
    settings.inactivityTimeout ?? InactivityTimeout.Disabled;

  const inactivityTimeoutOptions: TVOptionItem<InactivityTimeout>[] = useMemo(
    () => [
      {
        label: t("home.settings.security.inactivity_timeout.disabled"),
        value: InactivityTimeout.Disabled,
        selected: currentInactivityTimeout === InactivityTimeout.Disabled,
      },
      {
        label: t("home.settings.security.inactivity_timeout.1_minute"),
        value: InactivityTimeout.OneMinute,
        selected: currentInactivityTimeout === InactivityTimeout.OneMinute,
      },
      {
        label: t("home.settings.security.inactivity_timeout.5_minutes"),
        value: InactivityTimeout.FiveMinutes,
        selected: currentInactivityTimeout === InactivityTimeout.FiveMinutes,
      },
      {
        label: t("home.settings.security.inactivity_timeout.15_minutes"),
        value: InactivityTimeout.FifteenMinutes,
        selected: currentInactivityTimeout === InactivityTimeout.FifteenMinutes,
      },
      {
        label: t("home.settings.security.inactivity_timeout.30_minutes"),
        value: InactivityTimeout.ThirtyMinutes,
        selected: currentInactivityTimeout === InactivityTimeout.ThirtyMinutes,
      },
      {
        label: t("home.settings.security.inactivity_timeout.1_hour"),
        value: InactivityTimeout.OneHour,
        selected: currentInactivityTimeout === InactivityTimeout.OneHour,
      },
      {
        label: t("home.settings.security.inactivity_timeout.4_hours"),
        value: InactivityTimeout.FourHours,
        selected: currentInactivityTimeout === InactivityTimeout.FourHours,
      },
      {
        label: t("home.settings.security.inactivity_timeout.24_hours"),
        value: InactivityTimeout.TwentyFourHours,
        selected:
          currentInactivityTimeout === InactivityTimeout.TwentyFourHours,
      },
    ],
    [t, currentInactivityTimeout],
  );

  // Get display labels for option buttons
  const audioTranscodeLabel = useMemo(() => {
    const option = audioTranscodeModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.audio.transcode_mode.auto");
  }, [audioTranscodeModeOptions, t]);

  const audioLanguageLabel = useMemo(() => {
    const option = audioLanguageOptions.find((o) => o.selected);
    return option?.label || t("home.settings.audio.none");
  }, [audioLanguageOptions, t]);

  const subtitleLanguageLabel = useMemo(() => {
    const option = subtitleLanguageOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.none");
  }, [subtitleLanguageOptions, t]);

  const subtitleModeLabel = useMemo(() => {
    const option = subtitleModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.modes.Default");
  }, [subtitleModeOptions, t]);

  const subtitleFontLabel = useMemo(() => {
    const option = fontOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.fonts.system");
  }, [fontOptions, t]);

  const subtitleColorLabel = useMemo(() => {
    const option = subtitleColorOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.colors.white");
  }, [subtitleColorOptions, t]);

  const alignXLabel = useMemo(() => {
    const option = alignXOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.align.center");
  }, [alignXOptions, t]);

  const alignYLabel = useMemo(() => {
    const option = alignYOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.align.bottom");
  }, [alignYOptions, t]);

  const typographyScaleLabel = useMemo(() => {
    const option = typographyScaleOptions.find((o) => o.selected);
    return option?.label || t("home.settings.appearance.display_size_default");
  }, [typographyScaleOptions, t]);

  const cacheModeLabel = useMemo(() => {
    const option = cacheModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.buffer.cache_auto");
  }, [cacheModeOptions, t]);

  const voDriverLabel = useMemo(() => {
    const option = voDriverOptions.find((o) => o.selected);
    return option?.label || t("home.settings.vo_driver.gpu_next");
  }, [voDriverOptions, t]);

  const videoPlayerLabel = useMemo(() => {
    const option = videoPlayerOptions.find((o) => o.selected);
    return option?.label || "MPV";
  }, [videoPlayerOptions]);

  const languageLabel = useMemo(() => {
    if (!currentLanguage) return t("home.settings.languages.system");
    const option = APP_LANGUAGES.find((l) => l.value === currentLanguage);
    return option?.label || t("home.settings.languages.system");
  }, [currentLanguage, t]);

  const inactivityTimeoutLabel = useMemo(() => {
    const option = inactivityTimeoutOptions.find((o) => o.selected);
    return (
      option?.label || t("home.settings.security.inactivity_timeout.disabled")
    );
  }, [inactivityTimeoutOptions, t]);

  // Segment skip: same auto/ask/none choice for every segment type.
  const segmentSkipModeLabel = (mode: SegmentSkipMode) =>
    t(`home.settings.other.segment_skip_${mode}`);

  const buildSegmentSkipOptions = (
    current: SegmentSkipMode,
  ): TVOptionItem<SegmentSkipMode>[] => [
    {
      label: t("home.settings.other.segment_skip_auto"),
      value: "auto",
      selected: current === "auto",
    },
    {
      label: t("home.settings.other.segment_skip_ask"),
      value: "ask",
      selected: current === "ask",
    },
    {
      label: t("home.settings.other.segment_skip_none"),
      value: "none",
      selected: current === "none",
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 120,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: insets.left + 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text
            style={{
              fontSize: typography.title,
              fontWeight: "bold",
              color: "#FFFFFF",
              marginBottom: 8,
            }}
          >
            {t("home.settings.settings_title")}
          </Text>

          {/* Account Section */}
          <TVSectionHeader title={t("home.settings.switch_user.account")} />
          <TVSettingsOptionButton
            label={t("home.settings.switch_user.switch_user")}
            value={user?.Name || "-"}
            onPress={handleSwitchUser}
            disabled={!hasOtherAccounts || isAnyModalOpen}
            isFirst
          />

          {/* Security Section */}
          <TVSectionHeader title={t("home.settings.security.title")} />
          <TVSettingsOptionButton
            label={t("home.settings.security.inactivity_timeout.title")}
            value={inactivityTimeoutLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.security.inactivity_timeout.title"),
                options: inactivityTimeoutOptions,
                onSelect: (value) =>
                  updateSettings({ inactivityTimeout: value }),
              })
            }
          />

          {/* Video Player Section */}
          <TVSectionHeader title={t("home.settings.video_player.title")} />

          {/* Engine selector — Android TV only */}
          {isAndroidTv && (
            <>
              <TVSettingsOptionButton
                disabledByAdmin={pluginSettings?.videoPlayer?.locked}
                label={t("home.settings.video_player.title")}
                value={videoPlayerLabel}
                onPress={() =>
                  showOptions({
                    title: t("home.settings.video_player.title"),
                    options: videoPlayerOptions,
                    onSelect: (value) => updateSettings({ videoPlayer: value }),
                  })
                }
              />
              {!isMpv && (
                <Text style={playerNoteStyle}>
                  {t("home.settings.video_player.exoplayer_note")}
                </Text>
              )}
              {isMpv && (
                <Text style={playerNoteStyle}>
                  {t("home.settings.video_player.mpv_note")}
                </Text>
              )}
            </>
          )}

          {/* Native tvOS player — Apple TV on tvOS 26+, default on */}
          {isNativePlayerSupportedTV && (
            <>
              <TVSettingsToggle
                disabledByAdmin={pluginSettings?.nativeVideoPlayerTV?.locked}
                label={t("home.settings.video_player.native_tv")}
                value={settings.nativeVideoPlayerTV}
                onToggle={(value) =>
                  updateSettings({ nativeVideoPlayerTV: value })
                }
              />
              <Text style={playerNoteStyle}>
                {t("home.settings.video_player.native_tv_note")}
              </Text>
            </>
          )}

          {/* Native Android TV player opt-in — Android TV, default off */}
          {isAndroidTv && (
            <>
              <TVSettingsToggle
                disabledByAdmin={
                  pluginSettings?.nativeVideoPlayerAndroidTV?.locked
                }
                label={t("home.settings.video_player.native_tv")}
                value={settings.nativeVideoPlayerAndroidTV === true}
                onToggle={(value) =>
                  updateSettings({ nativeVideoPlayerAndroidTV: value })
                }
              />
              <Text style={playerNoteStyle}>
                {t("home.settings.video_player.native_android_tv_note")}
              </Text>
            </>
          )}

          <TVSettingsToggle
            disabledByAdmin={pluginSettings?.showResumeDialog?.locked}
            label={t("home.settings.other.resume_dialog")}
            value={settings.showResumeDialog}
            onToggle={(value) => updateSettings({ showResumeDialog: value })}
          />

          {/* Audio Section */}
          <TVSectionHeader title={t("home.settings.audio.audio_title")} />
          <TVSettingsOptionButton
            label={t("home.settings.audio.audio_language")}
            value={audioLanguageLabel}
            disabledByAdmin={pluginSettings?.defaultAudioLanguage?.locked}
            disabled={!isReady}
            onPress={() =>
              showOptions({
                title: t("home.settings.audio.language"),
                options: audioLanguageOptions,
                onSelect: (value) =>
                  updateMediaSettings({ defaultAudioLanguage: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.audio.play_default_audio_track")}
            value={settings.playDefaultAudioTrack}
            disabledByAdmin={pluginSettings?.playDefaultAudioTrack?.locked}
            onToggle={(value) =>
              updateMediaSettings({ playDefaultAudioTrack: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.audio.set_audio_track")}
            value={settings.rememberAudioSelections}
            disabledByAdmin={pluginSettings?.rememberAudioSelections?.locked}
            onToggle={(value) =>
              updateMediaSettings({ rememberAudioSelections: value })
            }
          />
          <TVSettingsOptionButton
            label={t("home.settings.audio.transcode_mode.title")}
            value={audioTranscodeLabel}
            disabledByAdmin={pluginSettings?.audioTranscodeMode?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.audio.transcode_mode.title"),
                options: audioTranscodeModeOptions,
                onSelect: (value) =>
                  updateSettings({ audioTranscodeMode: value }),
              })
            }
          />

          {/* Subtitles Section */}
          <TVSectionHeader
            title={t("home.settings.subtitles.subtitle_title")}
          />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_language")}
            value={subtitleLanguageLabel}
            disabledByAdmin={pluginSettings?.defaultSubtitleLanguage?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.language"),
                options: subtitleLanguageOptions,
                onSelect: (value) =>
                  updateMediaSettings({ defaultSubtitleLanguage: value }),
              })
            }
          />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_mode")}
            value={subtitleModeLabel}
            disabledByAdmin={pluginSettings?.subtitleMode?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_mode"),
                options: subtitleModeOptions,
                onSelect: (value) =>
                  updateMediaSettings({ subtitleMode: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.set_subtitle_track")}
            value={settings.rememberSubtitleSelections}
            disabledByAdmin={pluginSettings?.rememberSubtitleSelections?.locked}
            onToggle={(value) =>
              updateMediaSettings({ rememberSubtitleSelections: value })
            }
          />

          {/* Subtitle Appearance Section */}
          <TVSectionHeader
            title={t("home.settings.subtitles.subtitle_appearance_title")}
          />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_font")}
            value={subtitleFontLabel}
            disabledByAdmin={pluginSettings?.subtitleFont?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_font"),
                options: fontOptions,
                onSelect: (value) => updateSettings({ subtitleFont: value }),
              })
            }
          />
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_color")}
            value={subtitleColorLabel}
            disabledByAdmin={pluginSettings?.subtitleColor?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_color"),
                options: subtitleColorOptions,
                onSelect: (value) => updateSettings({ subtitleColor: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.subtitles_on_mute")}
            value={settings.subtitlesOnMute}
            disabled={pluginSettings?.subtitlesOnMute?.locked}
            onToggle={(value) => updateSettings({ subtitlesOnMute: value })}
          />
          {settings.subtitlesOnMute && (
            <TVSettingsToggle
              label={t(
                "home.settings.subtitles.subtitles_on_mute_allow_restart",
              )}
              value={settings.subtitlesOnMuteAllowRestart}
              disabled={pluginSettings?.subtitlesOnMuteAllowRestart?.locked}
              onToggle={(value) =>
                updateSettings({ subtitlesOnMuteAllowRestart: value })
              }
            />
          )}
          <TVSettingsStepper
            label={t("home.settings.subtitles.subtitle_size")}
            value={settings.subtitleSize}
            disabledByAdmin={pluginSettings?.subtitleSize?.locked}
            onDecrease={() => {
              const newValue = Math.max(0.1, settings.subtitleSize - 0.1);
              updateSettings({
                subtitleSize: Math.round(newValue * 10) / 10,
              });
            }}
            onIncrease={() => {
              const newValue = Math.min(3.0, settings.subtitleSize + 0.1);
              updateSettings({
                subtitleSize: Math.round(newValue * 10) / 10,
              });
            }}
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
          <TVSettingsStepper
            label={t("home.settings.subtitles.subtitle_margin_y")}
            value={
              settings.subtitleMarginY ?? defaultValues.subtitleMarginY ?? 0
            }
            disabledByAdmin={pluginSettings?.subtitleMarginY?.locked}
            onDecrease={() => {
              const newValue = Math.max(
                -100,
                (settings.subtitleMarginY ??
                  defaultValues.subtitleMarginY ??
                  0) - 5,
              );
              updateSettings({ subtitleMarginY: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                100,
                (settings.subtitleMarginY ??
                  defaultValues.subtitleMarginY ??
                  0) + 5,
              );
              updateSettings({ subtitleMarginY: newValue });
            }}
          />
          {isMpv && (
            <TVSettingsOptionButton
              label={t("home.settings.subtitles.subtitle_align_x")}
              value={alignXLabel}
              disabledByAdmin={pluginSettings?.subtitleAlignX?.locked}
              // ExoPlayer follows authored cue alignment; hide on ExoPlayer.
              onPress={() =>
                showOptions({
                  title: t("home.settings.subtitles.subtitle_align_x"),
                  options: alignXOptions,
                  onSelect: (value) =>
                    updateSettings({
                      subtitleAlignX: value as "left" | "center" | "right",
                    }),
                })
              }
            />
          )}
          <TVSettingsOptionButton
            label={t("home.settings.subtitles.subtitle_align_y")}
            value={alignYLabel}
            disabledByAdmin={pluginSettings?.subtitleAlignY?.locked}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_align_y"),
                options: alignYOptions,
                onSelect: (value) =>
                  updateSettings({
                    subtitleAlignY: value as "top" | "center" | "bottom",
                  }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.subtitle_background")}
            value={settings.subtitleBackground}
            disabledByAdmin={pluginSettings?.subtitleBackground?.locked}
            onToggle={(value) => updateSettings({ subtitleBackground: value })}
          />
          {settings.subtitleBackground && (
            <TVSettingsStepper
              label={t("home.settings.subtitles.subtitle_background_opacity")}
              value={settings.subtitleBackgroundOpacity ?? 60}
              disabledByAdmin={
                pluginSettings?.subtitleBackgroundOpacity?.locked
              }
              onDecrease={() => {
                const newValue = Math.max(
                  0,
                  (settings.subtitleBackgroundOpacity ?? 60) - 5,
                );
                updateSettings({ subtitleBackgroundOpacity: newValue });
              }}
              onIncrease={() => {
                const newValue = Math.min(
                  100,
                  (settings.subtitleBackgroundOpacity ?? 60) + 5,
                );
                updateSettings({ subtitleBackgroundOpacity: newValue });
              }}
              formatValue={(v) => `${v}%`}
            />
          )}
          {settings.subtitleBackground && isMpv && (
            <TVSettingsStepper
              label={t("home.settings.subtitles.subtitle_background_padding")}
              value={settings.subtitleBackgroundPadding ?? 8}
              disabledByAdmin={
                pluginSettings?.subtitleBackgroundPadding?.locked
              }
              onDecrease={() => {
                const newValue = Math.max(
                  0,
                  (settings.subtitleBackgroundPadding ?? 8) - 1,
                );
                updateSettings({ subtitleBackgroundPadding: newValue });
              }}
              onIncrease={() => {
                const newValue = Math.min(
                  30,
                  (settings.subtitleBackgroundPadding ?? 8) + 1,
                );
                updateSettings({ subtitleBackgroundPadding: newValue });
              }}
            />
          )}

          {/* OpenSubtitles Section */}
          <TVSectionHeader
            title={
              t("home.settings.subtitles.opensubtitles_title") ||
              "OpenSubtitles"
            }
          />
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: typography.callout - 2,
              marginBottom: 16,
              marginLeft: 8,
            }}
          >
            {t("home.settings.subtitles.opensubtitles_hint") ||
              "Enter your OpenSubtitles API key to enable client-side subtitle search as a fallback when your Jellyfin server doesn't have a subtitle provider configured."}
          </Text>
          <TVSettingsTextInput
            label={
              t("home.settings.subtitles.opensubtitles_api_key") || "API Key"
            }
            value={openSubtitlesApiKey}
            placeholder={
              t("home.settings.subtitles.opensubtitles_api_key_placeholder") ||
              "Enter API key..."
            }
            onChangeText={setOpenSubtitlesApiKey}
            onBlur={() => updateSettings({ openSubtitlesApiKey })}
            secureTextEntry
          />
          <Text
            style={{
              color: "#6B7280",
              fontSize: typography.callout - 4,
              marginTop: 8,
              marginLeft: 8,
            }}
          >
            {t("home.settings.subtitles.opensubtitles_get_key") ||
              "Get your free API key at opensubtitles.com/en/consumers"}
          </Text>

          {/* Buffer Settings Section */}
          <TVSectionHeader title={t("home.settings.buffer.title")} />
          <TVSettingsOptionButton
            label={t("home.settings.buffer.cache_mode")}
            value={cacheModeLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.buffer.cache_mode"),
                options: cacheModeOptions,
                onSelect: (value) => updateSettings({ mpvCacheEnabled: value }),
              })
            }
          />

          {/* Video Output Section — MPV only (gpu-next/gpu is a libmpv concept) */}
          {isMpv && (
            <>
              <TVSectionHeader title={t("home.settings.vo_driver.title")} />
              <TVSettingsOptionButton
                label={t("home.settings.vo_driver.vo_mode")}
                value={voDriverLabel}
                onPress={() =>
                  showOptions({
                    title: t("home.settings.vo_driver.vo_mode"),
                    options: voDriverOptions,
                    onSelect: (value) => updateSettings({ mpvVoDriver: value }),
                  })
                }
              />
            </>
          )}

          <TVSettingsStepper
            label={t("home.settings.buffer.buffer_duration")}
            value={settings.mpvCacheSeconds ?? 10}
            onDecrease={() => {
              const newValue = Math.max(
                5,
                (settings.mpvCacheSeconds ?? 10) - 5,
              );
              updateSettings({ mpvCacheSeconds: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                120,
                (settings.mpvCacheSeconds ?? 10) + 5,
              );
              updateSettings({ mpvCacheSeconds: newValue });
            }}
            formatValue={(v) => `${v}s`}
          />
          <TVSettingsStepper
            label={t("home.settings.buffer.max_cache_size")}
            value={settings.mpvDemuxerMaxBytes ?? 150}
            onDecrease={() => {
              const newValue = Math.max(
                50,
                (settings.mpvDemuxerMaxBytes ?? 150) - 25,
              );
              updateSettings({ mpvDemuxerMaxBytes: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                500,
                (settings.mpvDemuxerMaxBytes ?? 150) + 25,
              );
              updateSettings({ mpvDemuxerMaxBytes: newValue });
            }}
            formatValue={(v) => `${v} MB`}
          />
          <TVSettingsStepper
            label={t("home.settings.buffer.max_backward_cache")}
            value={settings.mpvDemuxerMaxBackBytes ?? 50}
            onDecrease={() => {
              const newValue = Math.max(
                25,
                (settings.mpvDemuxerMaxBackBytes ?? 50) - 25,
              );
              updateSettings({ mpvDemuxerMaxBackBytes: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                200,
                (settings.mpvDemuxerMaxBackBytes ?? 50) + 25,
              );
              updateSettings({ mpvDemuxerMaxBackBytes: newValue });
            }}
            formatValue={(v) => `${v} MB`}
          />

          {/* Segment Skip Section */}
          <TVSectionHeader
            title={t("home.settings.other.segment_skip_settings")}
          />
          {SEGMENT_SKIP_ROWS.map((row, _index) => {
            const current = (settings[row.key] ?? "ask") as SegmentSkipMode;
            const rowLabel = t(`home.settings.other.${row.labelKey}`);
            const lockedByAdmin = pluginSettings?.[row.key]?.locked ?? false;
            return (
              <TVSettingsOptionButton
                key={row.key}
                label={rowLabel}
                value={segmentSkipModeLabel(current)}
                disabledByAdmin={lockedByAdmin}
                onPress={() => {
                  if (lockedByAdmin) return;
                  showOptions({
                    title: rowLabel,
                    options: buildSegmentSkipOptions(current),
                    onSelect: (value) => updateSettings({ [row.key]: value }),
                  });
                }}
              />
            );
          })}

          {/* Appearance Section */}
          <TVSectionHeader title={t("home.settings.appearance.title")} />
          <TVSettingsOptionButton
            label={t("home.settings.appearance.display_size")}
            value={typographyScaleLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.appearance.display_size"),
                options: typographyScaleOptions,
                onSelect: (value) =>
                  updateSettings({ tvTypographyScale: value }),
              })
            }
          />
          <TVSettingsOptionButton
            label={t("home.settings.languages.app_language")}
            value={languageLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.languages.app_language"),
                options: languageOptions,
                onSelect: (value) =>
                  updateSettings({ preferedLanguage: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t(
              "home.settings.appearance.merge_next_up_continue_watching",
            )}
            value={settings.mergeNextUpAndContinueWatching}
            onToggle={(value) =>
              updateSettings({ mergeNextUpAndContinueWatching: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.use_episode_images_next_up")}
            value={settings.useEpisodeImagesForNextUp}
            onToggle={(value) =>
              updateSettings({ useEpisodeImagesForNextUp: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_home_backdrop")}
            value={settings.showHomeBackdrop}
            onToggle={(value) => updateSettings({ showHomeBackdrop: value })}
          />
          <TVSettingsToggle
            disabledByAdmin={pluginSettings?.showHeroCarousel?.locked}
            label={t("home.settings.appearance.show_hero_carousel")}
            value={settings.showHeroCarousel}
            onToggle={(value) => updateSettings({ showHeroCarousel: value })}
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_series_poster_on_episode")}
            value={settings.showSeriesPosterOnEpisode}
            onToggle={(value) =>
              updateSettings({ showSeriesPosterOnEpisode: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.theme_music")}
            value={settings.tvThemeMusicEnabled}
            onToggle={(value) => updateSettings({ tvThemeMusicEnabled: value })}
          />

          {/* Plugins Section — lookups the client makes directly, without
              going through Jellyfin. */}
          <TVSectionHeader title={t("home.settings.plugins.plugins_title")} />
          <TVSettingsToggle
            label={t("home.settings.plugins.wikidata_awards")}
            value={settings.wikidataAwardsEnabled}
            onToggle={(value) =>
              updateSettings({ wikidataAwardsEnabled: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.plugins.opensubtitles_enabled")}
            value={settings.openSubtitlesEnabled}
            onToggle={(value) =>
              updateSettings({ openSubtitlesEnabled: value })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.plugins.crash_reports")}
            value={settings.sentryEnabled}
            disabledByAdmin={pluginSettings?.sentryEnabled?.locked === true}
            onToggle={(value) => updateSettings({ sentryEnabled: value })}
          />

          {/* Custom proxy auth headers for Jellyfin and each integration */}
          <TVCustomHeadersSection serverUrl={storage.getString("serverUrl")} />

          {/* Storage Section */}
          <TVSectionHeader title={t("home.settings.storage.storage_title")} />
          <TVSettingsOptionButton
            label={t("home.settings.storage.clear_all_cache")}
            value=''
            onPress={handleClearCache}
            isFirst
          />

          {/* User Section */}
          <TVSectionHeader
            title={t("home.settings.user_info.user_info_title")}
          />
          <TVSettingsRow
            label={t("home.settings.user_info.user")}
            value={user?.Name || "-"}
            showChevron={false}
          />
          <TVSettingsRow
            label={t("home.settings.user_info.server")}
            value={api?.basePath || "-"}
            showChevron={false}
          />

          {/* Logout Button */}
          <View style={{ marginTop: 48, alignItems: "center" }}>
            <TVLogoutButton onPress={logout} />
          </View>
        </ScrollView>
      </View>

      {/* PIN Entry Modal */}
      <TVPINEntryModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        onSuccess={handlePinSuccess}
        onForgotPIN={() => {
          setPinModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        serverUrl={selectedServer?.address || ""}
        userId={selectedAccount?.userId || ""}
        username={selectedAccount?.username || ""}
      />

      {/* Password Entry Modal */}
      <TVPasswordEntryModal
        visible={passwordModalVisible}
        onClose={() => {
          setPasswordModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        onSubmit={handlePasswordSubmit}
        username={selectedAccount?.username || ""}
      />
    </View>
  );
}
