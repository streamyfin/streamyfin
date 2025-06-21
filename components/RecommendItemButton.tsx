import { Loader } from "@/components/Loader";
import { RoundButton } from "@/components/RoundButton";
import { Text } from "@/components/common/Text";
import { useUsers } from "@/hooks/useUsers";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toast } from "sonner-native";

interface Props extends React.ComponentProps<typeof View> {
  item: BaseItemDto;
  size?: "default" | "large";
}

export const RecommendItemButton: React.FC<Props> = ({ item, size, ...props }) => {
  const api = useAtomValue(apiAtom);
  const currentUser = useAtomValue(userAtom);
  const { data: users = [], isLoading } = useUsers();
  const [modalVisible, setModalVisible] = useState(false);

  const sendRecommendation = async (userId: string) => {
    if (!api || !item.Id) return;
    try {
      await api.post("/Streamyfin/recommend", {
        itemId: item.Id,
        toUserId: userId,
        fromUserId: currentUser?.Id,
      });
      toast.success("Recommendation sent");
    } catch (error) {
      toast.error("Failed to send recommendation");
    } finally {
      setModalVisible(false);
    }
  };

  return (
    <View {...props}>
      <RoundButton icon='send' onPress={() => setModalVisible(true)} size={size} />

      <Modal
        animationType='slide'
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select User</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name='close' size={24} color='white' />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Loader />
                </View>
              ) : (
                <FlatList
                  data={users.filter((u) => u.Id !== currentUser?.Id)}
                  keyExtractor={(u) => u.Id || ""}
                  renderItem={({ item: u }) => (
                    <TouchableOpacity
                      style={styles.userItem}
                      onPress={() => u.Id && sendRecommendation(u.Id)}
                    >
                      <Text style={styles.userName}>{u.Name}</Text>
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
  listContent: {
    paddingVertical: 8,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  userName: {
    fontSize: 16,
    fontWeight: "500",
    color: "white",
  },
});
