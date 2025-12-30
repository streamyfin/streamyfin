import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useCastDevice, useDevices } from "react-native-google-cast";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useAllSessions, type useSessionsProps } from "@/hooks/useSessions";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";
import { userAtom } from "@/providers/JellyfinProvider";

interface AudioCastButtonProps {
  size?: "default" | "large";
  onCastToSession?: (sessionId: string) => void;
  onCastToChromecast?: () => void;
  onDisconnect?: () => void;
  style?: any;
  compact?: boolean; // For mini player
}

type CastDevice = {
  id: string;
  name: string;
  type: "chromecast" | "session";
  isActive?: boolean;
  details?: string;
  nowPlaying?: string;
};

export const AudioCastButton: React.FC<AudioCastButtonProps> = ({
  size = "default",
  onCastToSession,
  onCastToChromecast,
  onDisconnect,
  style,
  compact = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const user = useAtomValue(userAtom);
  const { state } = useAudioPlayer();

  // Check if currently casting to a remote session
  const isCasting = !!state.remoteSessionId;

  // Jellyfin sessions
  const { sessions, isLoading: isLoadingSessions } = useAllSessions({
    refetchInterval: 5000,
    activeWithinSeconds: 360,
  } as useSessionsProps);

  // Chromecast devices
  const castDevice = useCastDevice();
  const devices = useDevices();

  // Combine all cast targets - memoize to prevent recreation on every render
  const castDevices = useMemo(() => {
    const allDevices: CastDevice[] = [];

    // Add Chromecast devices
    if (Platform.OS !== "web" && devices && devices.length > 0) {
      devices.forEach((device) => {
        allDevices.push({
          id: device.deviceId,
          name: device.friendlyName || device.deviceId,
          type: "chromecast",
          isActive: castDevice?.deviceId === device.deviceId,
          details: "Google Cast",
        });
      });
    }

    // Add Jellyfin sessions
    if (sessions && sessions.length > 0) {
      sessions.forEach((session) => {
        allDevices.push({
          id: session.Id || "",
          name: session.DeviceName || "Unknown Device",
          type: "session",
          details: `${session.UserName} • ${session.Client}`,
          nowPlaying: session.NowPlayingItem
            ? `${session.NowPlayingItem.SeriesName ? `${session.NowPlayingItem.SeriesName}: ` : ""}${session.NowPlayingItem.Name}`
            : undefined,
        });
      });
    }

    return allDevices;
  }, [devices, sessions, castDevice]);

  const handleCastPress = useCallback(
    (device: CastDevice) => {
      if (device.type === "chromecast") {
        onCastToChromecast?.();
      } else if (device.type === "session") {
        onCastToSession?.(device.id);
      }
      setModalVisible(false);
    },
    [onCastToChromecast, onCastToSession],
  );

  const renderCastDevice = useCallback(
    ({ item }: { item: CastDevice }) => {
      return (
        <TouchableOpacity
          style={styles.deviceItem}
          onPress={() => handleCastPress(item)}
        >
          <View style={styles.deviceIcon}>
            <Ionicons
              name={item.type === "chromecast" ? "radio" : "tv"}
              size={24}
              color={item.isActive ? "#9333ea" : "#888"}
            />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceDetails}>{item.details}</Text>
            {item.nowPlaying && (
              <Text style={styles.nowPlaying} numberOfLines={1}>
                Now playing: {item.nowPlaying}
              </Text>
            )}
          </View>
          <Ionicons name='chevron-forward' size={20} color='#888' />
        </TouchableOpacity>
      );
    },
    [handleCastPress],
  );

  // Only show button if user is admin (for Jellyfin sessions) or if Chromecast is available
  const shouldShow =
    (user?.Policy?.IsAdministrator && sessions && sessions.length > 0) ||
    (Platform.OS !== "web" && devices && devices.length > 0);

  if (!shouldShow) {
    return null;
  }

  return (
    <View style={style}>
      {compact ? (
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={styles.compactButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name='radio'
            size={18}
            color={isCasting ? "#3b82f6" : "#9ca3af"}
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={styles.largeButton}
        >
          <Ionicons
            name='radio'
            size={size === "large" ? 22 : 18}
            color={isCasting ? "#3b82f6" : "white"}
          />
        </TouchableOpacity>
      )}

      <Modal
        animationType='slide'
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cast To</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name='close' size={24} color='white' />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {castDevices.length === 0 ? (
                isLoadingSessions && !sessions ? (
                  <View style={styles.loadingContainer}>
                    <Loader />
                    <Text style={styles.emptySubtext}>Loading devices...</Text>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name='radio' size={48} color='#6b7280' />
                    <Text style={styles.emptyText}>
                      No cast devices available
                    </Text>
                    <Text style={styles.emptySubtext}>
                      Make sure devices are on the same network or active
                      Jellyfin sessions exist
                    </Text>
                  </View>
                )
              ) : (
                <View style={{ flex: 1 }}>
                  {isCasting ? (
                    <>
                      <View style={styles.castingIndicator}>
                        <Ionicons name='radio' size={16} color='#3b82f6' />
                        <Text style={styles.castingText}>
                          Currently casting to a remote session
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.disconnectButton}
                        onPress={() => {
                          onDisconnect?.();
                          setModalVisible(false);
                        }}
                      >
                        <Ionicons
                          name='close-circle'
                          size={20}
                          color='#ef4444'
                        />
                        <Text style={styles.disconnectText}>
                          Stop Casting & Return to Local
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.modalSubtitle}>
                      {castDevices.length} device
                      {castDevices.length !== 1 ? "s" : ""} available
                    </Text>
                  )}
                  <FlatList
                    data={castDevices}
                    keyExtractor={(device) => `${device.type}-${device.id}`}
                    renderItem={renderCastDevice}
                    contentContainerStyle={styles.listContent}
                    extraData={castDevices.length}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  compactButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  largeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalView: {
    width: "90%",
    height: "80%",
    backgroundColor: "#1c1c1c",
    borderRadius: 20,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalContent: {
    flex: 1,
    minHeight: 200,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: "center",
    color: "#6b7280",
    lineHeight: 18,
  },
  listContent: {
    paddingVertical: 8,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2c2c2e",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
    color: "#ffffff",
  },
  deviceDetails: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
    color: "#ffffff",
  },
  nowPlaying: {
    fontSize: 12,
    opacity: 0.5,
    fontStyle: "italic",
    color: "#ffffff",
  },
  castingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e3a8a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  castingText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "500",
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7f1d1d",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
  },
  disconnectText: {
    color: "#fca5a5",
    fontSize: 15,
    fontWeight: "600",
  },
});
