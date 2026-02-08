/**
 * Chromecast Settings Menu
 * Allows users to configure audio, subtitles, quality, and playback speed
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import type {
  AudioTrack,
  MediaSource,
  SubtitleTrack,
} from "@/utils/casting/types";

interface ChromecastSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  item: BaseItemDto;
  mediaSources: MediaSource[];
  selectedMediaSource: MediaSource | null;
  onMediaSourceChange: (source: MediaSource) => void;
  audioTracks: AudioTrack[];
  selectedAudioTrack: AudioTrack | null;
  onAudioTrackChange: (track: AudioTrack) => void;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleTrack: SubtitleTrack | null;
  onSubtitleTrackChange: (track: SubtitleTrack | null) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const ChromecastSettingsMenu: React.FC<ChromecastSettingsMenuProps> = ({
  visible,
  onClose,
  item: _item, // Reserved for future use (technical info display)
  mediaSources,
  selectedMediaSource,
  onMediaSourceChange,
  audioTracks,
  selectedAudioTrack,
  onAudioTrackChange,
  subtitleTracks,
  selectedSubtitleTrack,
  onSubtitleTrackChange,
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
          {/* Header */}
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
            {/* Quality/Media Source - only show when sources available */}
            {mediaSources.length > 0 &&
              renderSectionHeader(
                t("casting_player.quality"),
                "film-outline",
                "quality",
              )}
            {mediaSources.length > 0 && expandedSection === "quality" && (
              <View style={{ paddingVertical: 8 }}>
                {mediaSources.map((source) => (
                  <Pressable
                    key={source.id}
                    onPress={() => {
                      onMediaSourceChange(source);
                      setExpandedSection(null);
                    }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor:
                        selectedMediaSource?.id === source.id
                          ? "#2a2a2a"
                          : "transparent",
                    }}
                  >
                    <View>
                      <Text style={{ color: "white", fontSize: 15 }}>
                        {source.name}
                      </Text>
                      {source.bitrate && (
                        <Text
                          style={{ color: "#999", fontSize: 13, marginTop: 2 }}
                        >
                          {Math.round(source.bitrate / 1000000)} Mbps
                        </Text>
                      )}
                    </View>
                    {selectedMediaSource?.id === source.id && (
                      <Ionicons name='checkmark' size={20} color='#a855f7' />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Audio Tracks - only show if more than one track */}
            {audioTracks.length > 1 &&
              renderSectionHeader(
                t("casting_player.audio"),
                "musical-notes",
                "audio",
              )}
            {audioTracks.length > 1 && expandedSection === "audio" && (
              <View style={{ paddingVertical: 8 }}>
                {audioTracks.map((track) => (
                  <Pressable
                    key={track.index}
                    onPress={() => {
                      onAudioTrackChange(track);
                      setExpandedSection(null);
                    }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor:
                        selectedAudioTrack?.index === track.index
                          ? "#2a2a2a"
                          : "transparent",
                    }}
                  >
                    <View>
                      <Text style={{ color: "white", fontSize: 15 }}>
                        {track.displayTitle ||
                          track.language ||
                          t("casting_player.unknown")}
                      </Text>
                      {track.codec && (
                        <Text
                          style={{ color: "#999", fontSize: 13, marginTop: 2 }}
                        >
                          {track.codec.toUpperCase()}
                        </Text>
                      )}
                    </View>
                    {selectedAudioTrack?.index === track.index && (
                      <Ionicons name='checkmark' size={20} color='#a855f7' />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Subtitle Tracks - only show if subtitles available */}
            {subtitleTracks.length > 0 &&
              renderSectionHeader(
                t("casting_player.subtitles"),
                "text",
                "subtitles",
              )}
            {subtitleTracks.length > 0 && expandedSection === "subtitles" && (
              <View style={{ paddingVertical: 8 }}>
                <Pressable
                  onPress={() => {
                    onSubtitleTrackChange(null);
                    setExpandedSection(null);
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 16,
                    backgroundColor:
                      selectedSubtitleTrack === null
                        ? "#2a2a2a"
                        : "transparent",
                  }}
                >
                  <Text style={{ color: "white", fontSize: 15 }}>
                    {t("casting_player.none")}
                  </Text>
                  {selectedSubtitleTrack === null && (
                    <Ionicons name='checkmark' size={20} color='#a855f7' />
                  )}
                </Pressable>
                {subtitleTracks.map((track) => (
                  <Pressable
                    key={track.index}
                    onPress={() => {
                      onSubtitleTrackChange(track);
                      setExpandedSection(null);
                    }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor:
                        selectedSubtitleTrack?.index === track.index
                          ? "#2a2a2a"
                          : "transparent",
                    }}
                  >
                    <View>
                      <Text style={{ color: "white", fontSize: 15 }}>
                        {track.displayTitle ||
                          track.language ||
                          t("casting_player.unknown")}
                      </Text>
                      {track.codec && (
                        <Text
                          style={{ color: "#999", fontSize: 13, marginTop: 2 }}
                        >
                          {track.codec.toUpperCase()}
                          {track.isForced && ` • ${t("casting_player.forced")}`}
                        </Text>
                      )}
                    </View>
                    {selectedSubtitleTrack?.index === track.index && (
                      <Ionicons name='checkmark' size={20} color='#a855f7' />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Playback Speed */}
            {renderSectionHeader(
              t("casting_player.playback_speed"),
              "speedometer",
              "speed",
            )}
            {expandedSection === "speed" && (
              <View style={{ paddingVertical: 8 }}>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <Pressable
                    key={speed}
                    onPress={() => {
                      onPlaybackSpeedChange(speed);
                      setExpandedSection(null);
                    }}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor:
                        Math.abs(playbackSpeed - speed) < 0.01
                          ? "#2a2a2a"
                          : "transparent",
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 15 }}>
                      {speed === 1 ? t("casting_player.normal") : `${speed}x`}
                    </Text>
                    {Math.abs(playbackSpeed - speed) < 0.01 && (
                      <Ionicons name='checkmark' size={20} color='#a855f7' />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
