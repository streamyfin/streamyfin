import { useAllSessions, type useSessionsProps } from "@/hooks/useSessions";
import { apiAtom } from "@/providers/JellyfinProvider";
import { Ionicons } from "@expo/vector-icons";
import {
  type BaseItemDto,
  PlayCommand,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useAtomValue } from "jotai";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Loader } from "./Loader";
import { RoundButton } from "./RoundButton";
import { Text } from "./common/Text";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  size?: "default" | "large";
}

export const PlayInRemoteSessionButton: React.FC<Props> = ({
  item,
  ...props
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const api = useAtomValue(apiAtom);
  const { sessions, isLoading } = useAllSessions({} as useSessionsProps);
  const handlePlayInSession = async (sessionId: string) => {
    if (!api || !item.Id) return;

    try {
      console.log(`Playing ${item.Name} in session ${sessionId}`);
      getSessionApi(api).play({
        sessionId,
        itemIds: [item.Id],
        playCommand: PlayCommand.PlayNow,
      });

      setModalVisible(false);
    } catch (error) {
      console.error("Error playing in remote session:", error);
    }
  };

  return (
    <View {...props}>
      <RoundButton
        icon='play-circle-outline'
        onPress={() => setModalVisible(true)}
        size={props.size}
      />

      <Modal
        animationType='slide'
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Session</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name='close' size={24} color='white' />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Loader />
                </View>
              ) : !sessions || sessions.length === 0 ? (
                <Text style={styles.noSessionsText}>
                  No active sessions found
                </Text>
              ) : (
                <FlatList
                  data={sessions}
                  keyExtractor={(session) => session.Id || "unknown"}
                  renderItem={({ item: session }) => (
                    <TouchableOpacity
                      style={styles.sessionItem}
                      onPress={() => handlePlayInSession(session.Id || "")}
                    >
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionName}>
                          {session.DeviceName}
                        </Text>
                        <Text style={styles.sessionDetails}>
                          {session.UserName} • {session.Client}
                        </Text>
                        {session.NowPlayingItem && (
                          <Text style={styles.nowPlaying} numberOfLines={1}>
                            Now playing:{" "}
                            {session.NowPlayingItem.SeriesName
                              ? `${session.NowPlayingItem.SeriesName} :`
                              : ""}
                            {session.NowPlayingItem.Name}
                          </Text>
                        )}
                      </View>
                      <Ionicons name='play-sharp' size={20} color='#888' />
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.listContent}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalView: {
    width: "90%",
    maxHeight: "80%",
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  noSessionsText: {
    padding: 40,
    textAlign: "center",
    color: "#888",
  },
  listContent: {
    paddingVertical: 8,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  sessionDetails: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 2,
  },
  nowPlaying: {
    fontSize: 12,
    opacity: 0.5,
    fontStyle: "italic",
  },
});
