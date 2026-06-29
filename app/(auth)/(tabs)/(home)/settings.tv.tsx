import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Directory, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { TVPasswordEntryModal } from "@/components/login/TVPasswordEntryModal";
import { TVPINEntryModal } from "@/components/login/TVPINEntryModal";
import type { TVOptionItem } from "@/components/tv";
import {
  TVLogoutButton,
  TVSectionHeader,
  TVSettingsOptionButton,
  TVSettingsRow,
  TVSettingsStepper,
  TVSettingsTextInput,
  TVSettingsToggle,
} from "@/components/tv";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
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
  InactivityTimeout,
  type MpvCacheMode,
  type MpvVoDriver,
  TVTypographyScale,
  useSettings,
} from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";
import {
  getPreviousServers,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { clearTopShelfCacheSafely } from "@/utils/topshelf/cache";

export default function SettingsTV() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { logout, loginWithSavedCredential, loginWithPassword } = useJellyfin();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const [, setCacheVersion] = useAtom(cacheVersionAtom);
  const { showOptions } = useTVOptionModal();
  const { showUserSwitchModal } = useTVUserSwitchModal();
  const typography = useScaledTVTypography();
  const queryClient = useQueryClient();
  const { jellyseerrApi, setJellyseerrUser, clearAllJellyseerData } =
    useJellyseerr();

  // Jellyseerr connection state
  const [jellyseerrServerUrl, setJellyseerrServerUrl] = useState(
    settings.jellyseerrServerUrl || "",
  );
  const [jellyseerrPassword, setJellyseerrPassword] = useState("");

  const isJellyseerrLocked =
    pluginSettings?.jellyseerrServerUrl?.locked === true;
  const isJellyseerrConnected = !!jellyseerrApi;

  const handleJellyseerrUrlBlur = useCallback(() => {
    const url = jellyseerrServerUrl.trim();
    updateSettings({ jellyseerrServerUrl: url || undefined });
  }, [jellyseerrServerUrl, updateSettings]);

  const jellyseerrLoginMutation = useMutation({
    mutationFn: async () => {
      const url = jellyseerrServerUrl.trim();
      if (!url) throw new Error("Missing server url");
      if (!user?.Name) throw new Error("Missing user info");
      const tempApi = new JellyseerrApi(url);
      const testResult = await tempApi.test();
      if (!testResult.isValid) throw new Error("Invalid server url");
      return tempApi.login(user.Name, jellyseerrPassword);
    },
    onSuccess: (loggedInUser) => {
      setJellyseerrUser(loggedInUser);
      updateSettings({ jellyseerrServerUrl: jellyseerrServerUrl.trim() });
    },
    onError: () => {
      toast.error(t("jellyseerr.failed_to_login"));
    },
    onSettled: () => {
      setJellyseerrPassword("");
    },
  });

  const handleDisconnectJellyseerr = useCallback(() => {
    clearAllJellyseerData();
    setJellyseerrServerUrl("");
    setJellyseerrPassword("");
  }, [clearAllJellyseerData]);

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
                if (!keysToKeep.includes(key)) {
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
  const currentAlignX = settings.mpvSubtitleAlignX ?? "center";
  const currentAlignY = settings.mpvSubtitleAlignY ?? "bottom";
  const currentTypographyScale =
    settings.tvTypographyScale || TVTypographyScale.Default;
  const currentCacheMode = settings.mpvCacheEnabled ?? "auto";
  const currentVoDriver = settings.mpvVoDriver ?? "gpu-next";
  const currentLanguage = settings.preferedLanguage;

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

  // MPV alignment options
  const alignXOptions: TVOptionItem<string>[] = useMemo(
    () => [
      { label: "Left", value: "left", selected: currentAlignX === "left" },
      {
        label: "Center",
        value: "center",
        selected: currentAlignX === "center",
      },
      { label: "Right", value: "right", selected: currentAlignX === "right" },
    ],
    [currentAlignX],
  );

  const alignYOptions: TVOptionItem<string>[] = useMemo(
    () => [
      { label: "Top", value: "top", selected: currentAlignY === "top" },
      {
        label: "Center",
        value: "center",
        selected: currentAlignY === "center",
      },
      {
        label: "Bottom",
        value: "bottom",
        selected: currentAlignY === "bottom",
      },
    ],
    [currentAlignY],
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

  const subtitleModeLabel = useMemo(() => {
    const option = subtitleModeOptions.find((o) => o.selected);
    return option?.label || t("home.settings.subtitles.modes.Default");
  }, [subtitleModeOptions, t]);

  const alignXLabel = useMemo(() => {
    const option = alignXOptions.find((o) => o.selected);
    return option?.label || "Center";
  }, [alignXOptions]);

  const alignYLabel = useMemo(() => {
    const option = alignYOptions.find((o) => o.selected);
    return option?.label || "Bottom";
  }, [alignYOptions]);

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

          {/* Audio Section */}
          <TVSectionHeader title={t("home.settings.audio.audio_title")} />
          <TVSettingsOptionButton
            label={t("home.settings.audio.transcode_mode.title")}
            value={audioTranscodeLabel}
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
            label={t("home.settings.subtitles.subtitle_mode")}
            value={subtitleModeLabel}
            onPress={() =>
              showOptions({
                title: t("home.settings.subtitles.subtitle_mode"),
                options: subtitleModeOptions,
                onSelect: (value) => updateSettings({ subtitleMode: value }),
              })
            }
          />
          <TVSettingsToggle
            label={t("home.settings.subtitles.set_subtitle_track")}
            value={settings.rememberSubtitleSelections}
            onToggle={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
          <TVSettingsStepper
            label={t("home.settings.subtitles.subtitle_size")}
            value={settings.mpvSubtitleScale ?? 1.0}
            onDecrease={() => {
              const newValue = Math.max(
                0.1,
                (settings.mpvSubtitleScale ?? 1.0) - 0.1,
              );
              updateSettings({
                mpvSubtitleScale: Math.round(newValue * 10) / 10,
              });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                3.0,
                (settings.mpvSubtitleScale ?? 1.0) + 0.1,
              );
              updateSettings({
                mpvSubtitleScale: Math.round(newValue * 10) / 10,
              });
            }}
            formatValue={(v) => `${v.toFixed(1)}x`}
          />
          <TVSettingsStepper
            label='Vertical Margin'
            value={settings.mpvSubtitleMarginY ?? 0}
            onDecrease={() => {
              const newValue = Math.max(
                0,
                (settings.mpvSubtitleMarginY ?? 0) - 5,
              );
              updateSettings({ mpvSubtitleMarginY: newValue });
            }}
            onIncrease={() => {
              const newValue = Math.min(
                100,
                (settings.mpvSubtitleMarginY ?? 0) + 5,
              );
              updateSettings({ mpvSubtitleMarginY: newValue });
            }}
          />
          <TVSettingsOptionButton
            label='Horizontal Alignment'
            value={alignXLabel}
            onPress={() =>
              showOptions({
                title: "Horizontal Alignment",
                options: alignXOptions,
                onSelect: (value) =>
                  updateSettings({
                    mpvSubtitleAlignX: value as "left" | "center" | "right",
                  }),
              })
            }
          />
          <TVSettingsOptionButton
            label='Vertical Alignment'
            value={alignYLabel}
            onPress={() =>
              showOptions({
                title: "Vertical Alignment",
                options: alignYOptions,
                onSelect: (value) =>
                  updateSettings({
                    mpvSubtitleAlignY: value as "top" | "center" | "bottom",
                  }),
              })
            }
          />

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

          {/* Video Output Section */}
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
            label={t("home.settings.appearance.show_home_backdrop")}
            value={settings.showHomeBackdrop}
            onToggle={(value) => updateSettings({ showHomeBackdrop: value })}
          />
          <TVSettingsToggle
            label={t("home.settings.appearance.show_hero_carousel")}
            value={settings.showTVHeroCarousel}
            onToggle={(value) => updateSettings({ showTVHeroCarousel: value })}
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

          {/* seerr Section */}
          <TVSectionHeader title='seerr' />
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: typography.callout - 2,
              marginBottom: 16,
              marginLeft: 8,
            }}
          >
            {t("home.settings.plugins.jellyseerr.server_url_hint")}
          </Text>
          <TVSettingsTextInput
            label={t("home.settings.plugins.jellyseerr.server_url")}
            value={jellyseerrServerUrl}
            placeholder={t(
              "home.settings.plugins.jellyseerr.server_url_placeholder",
            )}
            onChangeText={setJellyseerrServerUrl}
            onBlur={handleJellyseerrUrlBlur}
            disabled={isJellyseerrLocked || jellyseerrLoginMutation.isPending}
          />
          {!isJellyseerrConnected && !isJellyseerrLocked && (
            <>
              <TVSettingsTextInput
                label={t("home.settings.plugins.jellyseerr.password")}
                value={jellyseerrPassword}
                placeholder={t(
                  "home.settings.plugins.jellyseerr.password_placeholder",
                  { username: user?.Name },
                )}
                onChangeText={setJellyseerrPassword}
                secureTextEntry
                disabled={jellyseerrLoginMutation.isPending}
              />
              <TVSettingsOptionButton
                label={
                  jellyseerrLoginMutation.isPending
                    ? t("common.connecting")
                    : t("common.connect")
                }
                value=''
                onPress={() => jellyseerrLoginMutation.mutate()}
                disabled={jellyseerrLoginMutation.isPending}
              />
            </>
          )}
          <TVSettingsRow
            label={
              isJellyseerrConnected
                ? t("common.connected")
                : t("common.not_connected")
            }
            value=''
            showChevron={false}
          />
          {isJellyseerrConnected && !isJellyseerrLocked && (
            <TVSettingsOptionButton
              label={t(
                "home.settings.plugins.jellyseerr.reset_jellyseerr_config_button",
              )}
              value=''
              onPress={handleDisconnectJellyseerr}
            />
          )}

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
