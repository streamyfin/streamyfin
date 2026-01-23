/**
 * Chromecast Settings Menu
 * Allows users to configure audio, subtitles, quality, and playback speed
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useState } from "react";
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
  showTechnicalInfo: boolean;
  onToggleTechnicalInfo: () => void;
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
  showTechnicalInfo,
  onToggleTechnicalInfo,
}) => {
  const insets = useSafeAreaInsets();
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
              Playback Settings
            </Text>
            <Pressable onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name='close' size={24} color='white' />
            </Pressable>
          </View>

          <ScrollView>
            {/* Quality/Media Source */}
            {renderSectionHeader("Quality", "film-outline", "quality")}
            {expandedSection === "quality" && (
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
              renderSectionHeader("Audio", "musical-notes", "audio")}
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
                        {track.displayTitle || track.language || "Unknown"}
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
              renderSectionHeader("Subtitles", "text", "subtitles")}
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
                  <Text style={{ color: "white", fontSize: 15 }}>None</Text>
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
                        {track.displayTitle || track.language || "Unknown"}
                      </Text>
                      {track.codec && (
                        <Text
                          style={{ color: "#999", fontSize: 13, marginTop: 2 }}
                        >
                          {track.codec.toUpperCase()}
                          {track.isForced && " • Forced"}
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
            {renderSectionHeader("Playback Speed", "speedometer", "speed")}
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
                        playbackSpeed === speed ? "#2a2a2a" : "transparent",
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 15 }}>
                      {speed === 1 ? "Normal" : `${speed}x`}
                    </Text>
                    {playbackSpeed === speed && (
                      <Ionicons name='checkmark' size={20} color='#a855f7' />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Technical Info Toggle */}
            <Pressable
              onPress={onToggleTechnicalInfo}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#333",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Ionicons name='information-circle' size={20} color='white' />
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "500" }}
                >
                  Show Technical Info
                </Text>
              </View>
              <View
                style={{
                  width: 50,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: showTechnicalInfo ? "#a855f7" : "#333",
                  justifyContent: "center",
                  alignItems: showTechnicalInfo ? "flex-end" : "flex-start",
                  padding: 2,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: "white",
                  }}
                />
              </View>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
