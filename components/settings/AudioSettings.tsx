import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { AudioBufferMode } from "@/providers/AudioPlayer/types";
import { useSettings } from "@/utils/atoms/settings";

const SKIP_OPTIONS = [5, 10, 15, 30, 45, 60];
const BUFFER_TRACK_OPTIONS = [1, 2, 3, 5, 7, 10];
const BUFFER_SIZE_OPTIONS = [10, 25, 50, 100, 150, 200];
const CACHE_OPTIONS = [100, 250, 500, 1000, 2000];
const LIBRARY_SIZE_OPTIONS = [500, 1000, 2000, 5000, 10000];
const PLAY_COUNT_OPTIONS = [1, 3, 5, 10, 15, 20];
const MAX_AGE_OPTIONS = [7, 14, 30, 60, 90];
const PREFETCH_COUNT_OPTIONS = [1, 2, 3, 5];
const PREFETCH_THRESHOLD_OPTIONS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9];
const AUDIO_BITRATE_OPTIONS = [128000, 192000, 256000, 320000];

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && (
          <Text style={styles.settingDescription}>{description}</Text>
        )}
      </View>
      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

interface StepperProps {
  value: number;
  options: number[];
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

function Stepper({ value, options, onChange, formatValue }: StepperProps) {
  const currentIndex = options.indexOf(value);
  const canDecrease = currentIndex > 0;
  const canIncrease = currentIndex < options.length - 1;

  const handleDecrease = () => {
    if (canDecrease) {
      onChange(options[currentIndex - 1]);
    }
  };

  const handleIncrease = () => {
    if (canIncrease) {
      onChange(options[currentIndex + 1]);
    }
  };

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        onPress={handleDecrease}
        style={[
          styles.stepperButton,
          !canDecrease && styles.stepperButtonDisabled,
        ]}
        disabled={!canDecrease}
      >
        <Ionicons
          name='remove'
          size={18}
          color={canDecrease ? "white" : "#4a4a4c"}
        />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{displayValue}</Text>
      <TouchableOpacity
        onPress={handleIncrease}
        style={[
          styles.stepperButton,
          !canIncrease && styles.stepperButtonDisabled,
        ]}
        disabled={!canIncrease}
      >
        <Ionicons
          name='add'
          size={18}
          color={canIncrease ? "white" : "#4a4a4c"}
        />
      </TouchableOpacity>
    </View>
  );
}

export function AudioSettings() {
  const { settings, updateSettings } = useSettings();

  // Buffer mode toggle
  const handleBufferModeChange = useCallback(() => {
    const newMode: AudioBufferMode =
      settings.audioBufferMode === "tracks" ? "size" : "tracks";
    updateSettings({ audioBufferMode: newMode });
  }, [settings.audioBufferMode, updateSettings]);

  // Gapless playback toggle
  const handleGaplessChange = useCallback(
    (value: boolean) => {
      updateSettings({ gaplessPlayback: value });
    },
    [updateSettings],
  );

  const formatSize = (mb: number) => {
    if (mb >= 1000) {
      return `${(mb / 1000).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  const formatBitrate = (bps: number) => {
    return `${bps / 1000} kbps`;
  };

  const formatThreshold = (threshold: number) => {
    return `${Math.round(threshold * 100)}%`;
  };

  return (
    <View style={styles.container}>
      {/* Buffer Settings */}
      <SettingSection title='Playback Buffer'>
        <SettingRow
          label='Buffer Mode'
          description={
            settings.audioBufferMode === "tracks"
              ? `Buffer next ${settings.audioBufferTracks} tracks`
              : `Buffer up to ${formatSize(settings.audioBufferSizeMB)}`
          }
        >
          <TouchableOpacity
            style={styles.modeToggle}
            onPress={handleBufferModeChange}
          >
            <Text style={styles.modeToggleText}>
              {settings.audioBufferMode === "tracks" ? "Tracks" : "Size"}
            </Text>
            <Ionicons name='swap-horizontal' size={16} color='#9ca3af' />
          </TouchableOpacity>
        </SettingRow>

        {settings.audioBufferMode === "tracks" ? (
          <SettingRow
            label='Buffer Tracks'
            description='Number of tracks to preload'
          >
            <Stepper
              value={settings.audioBufferTracks}
              options={BUFFER_TRACK_OPTIONS}
              onChange={(value) => updateSettings({ audioBufferTracks: value })}
            />
          </SettingRow>
        ) : (
          <SettingRow label='Buffer Size' description='Maximum preload size'>
            <Stepper
              value={settings.audioBufferSizeMB}
              options={BUFFER_SIZE_OPTIONS}
              onChange={(value) => updateSettings({ audioBufferSizeMB: value })}
              formatValue={formatSize}
            />
          </SettingRow>
        )}

        <SettingRow
          label='Gapless Playback'
          description='Seamless album transitions'
        >
          <Switch
            value={settings.gaplessPlayback}
            onValueChange={handleGaplessChange}
            trackColor={{ false: "#3a3a3c", true: "#9333ea" }}
            thumbColor='white'
          />
        </SettingRow>
      </SettingSection>

      {/* Cache Settings */}
      <SettingSection title='Cache Limits'>
        <SettingRow
          label='Favorite Songs Cache'
          description='Max storage for auto-favorited songs'
        >
          <Stepper
            value={settings.favoriteSongCacheSizeMB}
            options={CACHE_OPTIONS}
            onChange={(value) =>
              updateSettings({ favoriteSongCacheSizeMB: value })
            }
            formatValue={formatSize}
          />
        </SettingRow>

        <SettingRow
          label='Temporary Cache'
          description='Max storage for buffered tracks'
        >
          <Stepper
            value={settings.temporarySongCacheSizeMB}
            options={CACHE_OPTIONS}
            onChange={(value) =>
              updateSettings({ temporarySongCacheSizeMB: value })
            }
            formatValue={formatSize}
          />
        </SettingRow>

        <SettingRow
          label='Cache Max Age'
          description='Remove songs not played in this period'
        >
          <Stepper
            value={settings.temporaryCacheMaxAgeDays}
            options={MAX_AGE_OPTIONS}
            onChange={(value) =>
              updateSettings({ temporaryCacheMaxAgeDays: value })
            }
            formatValue={(days) => `${days} days`}
          />
        </SettingRow>

        <SettingRow
          label='Music Library Limit'
          description='Max storage for downloaded music'
        >
          <Stepper
            value={settings.maxMusicLibrarySizeMB}
            options={LIBRARY_SIZE_OPTIONS}
            onChange={(value) =>
              updateSettings({ maxMusicLibrarySizeMB: value })
            }
            formatValue={formatSize}
          />
        </SettingRow>
      </SettingSection>

      {/* Auto-Favorite Settings */}
      <SettingSection title='Auto-Favorite'>
        <SettingRow
          label='Play Count Threshold'
          description={`Auto-favorite after ${settings.autoFavoritePlayCount} plays`}
        >
          <Stepper
            value={settings.autoFavoritePlayCount}
            options={PLAY_COUNT_OPTIONS}
            onChange={(value) =>
              updateSettings({ autoFavoritePlayCount: value })
            }
          />
        </SettingRow>
      </SettingSection>

      {/* Skip Controls */}
      <SettingSection title='Skip Controls'>
        <SettingRow label='Skip Forward' description='Jump ahead time'>
          <View style={styles.chipContainer}>
            {SKIP_OPTIONS.map((seconds) => (
              <TouchableOpacity
                key={seconds}
                style={[
                  styles.chip,
                  settings.audioSkipForward === seconds && styles.chipActive,
                ]}
                onPress={() => updateSettings({ audioSkipForward: seconds })}
              >
                <Text
                  style={[
                    styles.chipText,
                    settings.audioSkipForward === seconds &&
                      styles.chipTextActive,
                  ]}
                >
                  {seconds}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>

        <SettingRow label='Skip Backward' description='Jump back time'>
          <View style={styles.chipContainer}>
            {SKIP_OPTIONS.map((seconds) => (
              <TouchableOpacity
                key={seconds}
                style={[
                  styles.chip,
                  settings.audioSkipBackward === seconds && styles.chipActive,
                ]}
                onPress={() => updateSettings({ audioSkipBackward: seconds })}
              >
                <Text
                  style={[
                    styles.chipText,
                    settings.audioSkipBackward === seconds &&
                      styles.chipTextActive,
                  ]}
                >
                  {seconds}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingRow>
      </SettingSection>

      {/* Smart Prefetching */}
      <SettingSection title='Smart Prefetching'>
        <SettingRow
          label='Enable Prefetching'
          description='Automatically download upcoming tracks while playing'
        >
          <Switch
            value={settings.audioPrefetchEnabled}
            onValueChange={(value) =>
              updateSettings({ audioPrefetchEnabled: value })
            }
            trackColor={{ false: "#3a3a3c", true: "#9333ea" }}
            thumbColor='white'
          />
        </SettingRow>

        <SettingRow
          label='Prefetch Count'
          description={`Download next ${settings.audioPrefetchCount} track${settings.audioPrefetchCount > 1 ? "s" : ""}`}
        >
          <Stepper
            value={settings.audioPrefetchCount}
            options={PREFETCH_COUNT_OPTIONS}
            onChange={(value) => updateSettings({ audioPrefetchCount: value })}
          />
        </SettingRow>

        <SettingRow
          label='Prefetch Trigger'
          description={`Start prefetch at ${formatThreshold(settings.audioPrefetchThreshold)} of track`}
        >
          <Stepper
            value={settings.audioPrefetchThreshold}
            options={PREFETCH_THRESHOLD_OPTIONS}
            onChange={(value) =>
              updateSettings({ audioPrefetchThreshold: value })
            }
            formatValue={formatThreshold}
          />
        </SettingRow>

        <SettingRow
          label='Prefetch Quality'
          description='Download quality for prefetched tracks'
        >
          <Stepper
            value={settings.audioPrefetchBitrate}
            options={AUDIO_BITRATE_OPTIONS}
            onChange={(value) =>
              updateSettings({ audioPrefetchBitrate: value })
            }
            formatValue={formatBitrate}
          />
        </SettingRow>
      </SettingSection>

      {/* Notifications */}
      <SettingSection title='Notifications'>
        <SettingRow
          label='Music Download Notifications'
          description='Show notifications when music downloads complete'
        >
          <Switch
            value={settings.showMusicDownloadNotifications}
            onValueChange={(value) =>
              updateSettings({ showMusicDownloadNotifications: value })
            }
            trackColor={{ false: "#3a3a3c", true: "#9333ea" }}
            thumbColor='white'
          />
        </SettingRow>
      </SettingSection>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionContent: {
    backgroundColor: "#1c1c1e",
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2e",
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: "white",
    fontWeight: "500",
  },
  settingDescription: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  settingControl: {
    alignItems: "flex-end",
  },
  modeToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modeToggleText: {
    fontSize: 14,
    color: "white",
    fontWeight: "500",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c2c2e",
    borderRadius: 8,
    overflow: "hidden",
  },
  stepperButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3a3a3c",
  },
  stepperButtonDisabled: {
    backgroundColor: "#2c2c2e",
  },
  stepperValue: {
    minWidth: 60,
    textAlign: "center",
    fontSize: 14,
    color: "#9333ea",
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#2c2c2e",
  },
  chipActive: {
    backgroundColor: "#9333ea",
  },
  chipText: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "500",
  },
  chipTextActive: {
    color: "white",
  },
});
