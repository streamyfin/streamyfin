/**
 * Chromecast Settings Menu
 * Configure version, quality (bitrate cap), audio, subtitles, and playback speed.
 * Every "selected" row is driven by the active CastSelection — no [0] fallbacks.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import type { AudioTrack, SubtitleTrack } from "@/utils/casting/types";

export interface VersionOption {
  id: string;
  name: string;
}

export interface QualityOption {
  key: string;
  value: number | undefined;
}

interface ChromecastSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  versions: VersionOption[];
  selectedVersionId: string;
  onVersionChange: (id: string) => void;
  qualities: QualityOption[];
  selectedMaxBitrate: number | undefined;
  onQualityChange: (value: number | undefined) => void;
  audioTracks: AudioTrack[];
  selectedAudioIndex: number;
  onAudioChange: (index: number) => void;
  subtitleTracks: SubtitleTrack[];
  /** -1 = subtitles off. */
  selectedSubtitleIndex: number;
  onSubtitleChange: (index: number) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ACCENT = "#a855f7";

export const ChromecastSettingsMenu: React.FC<ChromecastSettingsMenuProps> = ({
  visible,
  onClose,
  versions,
  selectedVersionId,
  onVersionChange,
  qualities,
  selectedMaxBitrate,
  onQualityChange,
  audioTracks,
  selectedAudioIndex,
  onAudioChange,
  subtitleTracks,
  selectedSubtitleIndex,
  onSubtitleChange,
  playbackSpeed,
  onPlaybackSpeedChange,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const renderSectionHeader = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    sectionKey: string,
  ) => (
    <Pressable
      onPress={() => toggleSection(sectionKey)}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Ionicons name={icon} size={20} color='white' />
        <Text style={{ color: "white", fontSize: 16, fontWeight: "500" }}>
          {title}
        </Text>
      </View>
      <Ionicons
        name={expandedSection === sectionKey ? "chevron-up" : "chevron-down"}
        size={20}
        color='#999'
      />
    </Pressable>
  );

  const renderRow = (
    key: string | number,
    label: string,
    sublabel: string | null,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      onPress={() => {
        onPress();
        setExpandedSection(null);
      }}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        backgroundColor: selected ? "#2a2a2a" : "transparent",
      }}
    >
      <View>
        <Text style={{ color: "white", fontSize: 15 }}>{label}</Text>
        {sublabel ? (
          <Text style={{ color: "#999", fontSize: 13, marginTop: 2 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name='checkmark' size={20} color={ACCENT} /> : null}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType='slide'
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: "#1a1a1a",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "80%",
            paddingBottom: insets.bottom,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#333",
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              {t("casting_player.playback_settings")}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name='close' size={24} color='white' />
            </Pressable>
          </View>

          <ScrollView>
            {/* Version — only when the item has more than one MediaSource */}
            {versions.length > 1 &&
              renderSectionHeader(
                t("casting_player.version"),
                "albums-outline",
                "version",
              )}
            {versions.length > 1 && expandedSection === "version" && (
              <View style={{ paddingVertical: 8 }}>
                {versions.map((v) =>
                  renderRow(
                    v.id,
                    v.name,
                    null,
                    v.id === selectedVersionId,
                    () => onVersionChange(v.id),
                  ),
                )}
              </View>
            )}

            {/* Quality (bitrate cap) */}
            {renderSectionHeader(
              t("casting_player.quality"),
              "film-outline",
              "quality",
            )}
            {expandedSection === "quality" && (
              <View style={{ paddingVertical: 8 }}>
                {qualities.map((q) =>
                  renderRow(
                    q.key,
                    q.key,
                    null,
                    q.value === selectedMaxBitrate,
                    () => onQualityChange(q.value),
                  ),
                )}
              </View>
            )}

            {/* Audio — only when more than one track */}
            {audioTracks.length > 1 &&
              renderSectionHeader(
                t("casting_player.audio"),
                "musical-notes",
                "audio",
              )}
            {audioTracks.length > 1 && expandedSection === "audio" && (
              <View style={{ paddingVertical: 8 }}>
                {audioTracks.map((track) =>
                  renderRow(
                    track.index,
                    track.displayTitle ||
                      track.language ||
                      t("casting_player.unknown"),
                    track.codec ? track.codec.toUpperCase() : null,
                    track.index === selectedAudioIndex,
                    () => onAudioChange(track.index),
                  ),
                )}
              </View>
            )}

            {/* Subtitles */}
            {subtitleTracks.length > 0 &&
              renderSectionHeader(
                t("casting_player.subtitles"),
                "text",
                "subtitles",
              )}
            {subtitleTracks.length > 0 && expandedSection === "subtitles" && (
              <View style={{ paddingVertical: 8 }}>
                {renderRow(
                  "off",
                  t("casting_player.none"),
                  null,
                  selectedSubtitleIndex < 0,
                  () => onSubtitleChange(-1),
                )}
                {subtitleTracks.map((track) =>
                  renderRow(
                    track.index,
                    track.displayTitle ||
                      track.language ||
                      t("casting_player.unknown"),
                    [
                      track.codec ? track.codec.toUpperCase() : "",
                      track.isForced ? t("casting_player.forced") : "",
                    ]
                      .filter(Boolean)
                      .join(" • ") || null,
                    track.index === selectedSubtitleIndex,
                    () => onSubtitleChange(track.index),
                  ),
                )}
              </View>
            )}

            {/* Playback speed */}
            {renderSectionHeader(
              t("casting_player.playback_speed"),
              "speedometer",
              "speed",
            )}
            {expandedSection === "speed" && (
              <View style={{ paddingVertical: 8 }}>
                {PLAYBACK_SPEEDS.map((speed) =>
                  renderRow(
                    speed,
                    speed === 1 ? t("casting_player.normal") : `${speed}x`,
                    null,
                    Math.abs(playbackSpeed - speed) < 0.01,
                    () => onPlaybackSpeedChange(speed),
                  ),
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
