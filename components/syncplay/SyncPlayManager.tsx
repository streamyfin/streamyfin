import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { SyncPlayAction } from "./SyncPlayAction";
import { SyncPlayGroupControls } from "./SyncPlayGroupControls";

const cardStyle = {
  backgroundColor: "#171717",
  borderColor: "#333333",
  borderWidth: 1,
  borderRadius: 18,
  padding: 20,
  gap: 14,
};

/** Server groups are shared with Jellyfin clients on the same server. */
export function SyncPlayManager({
  showLibrary = true,
}: {
  showLibrary?: boolean;
}) {
  const { t } = useTranslation();
  const {
    group,
    groups,
    groupState,
    supported,
    canCreate,
    connected,
    busy,
    error,
    clearError,
    refreshGroups,
    createGroup,
    joinGroup,
    leaveGroup,
    getGroup,
  } = useSyncPlay();
  const [name, setName] = useState("");
  const available = supported && connected;
  const otherGroups = groups.filter(
    (entry) => entry.GroupId !== group?.GroupId,
  );

  useEffect(() => {
    if (available) void refreshGroups().catch(() => {});
  }, [available, refreshGroups]);

  const create = async () => {
    if (!name.trim() || !available || !canCreate || busy) return;
    try {
      await createGroup(name.trim());
      setName("");
    } catch {
      // The provider keeps the failure visible and permits retrying the name.
    }
  };

  return (
    <View
      style={{ width: "100%", maxWidth: 760, alignSelf: "center", gap: 20 }}
    >
      <View style={{ alignItems: "center", paddingVertical: 8, gap: 10 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: "#3b0764",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name='people-outline' size={34} color='#e9d5ff' />
        </View>
        <Text style={{ fontSize: 26, fontWeight: "700" }}>
          {t("syncplay.title")}
        </Text>
        <Text style={{ color: "#d4d4d4", textAlign: "center", lineHeight: 22 }}>
          {t("syncplay.description")}
        </Text>
      </View>

      {!available && (
        <View
          testID='syncplay-unavailable'
          style={{ ...cardStyle, borderColor: "#92400e" }}
        >
          <Text style={{ color: "#fde68a", lineHeight: 22 }}>
            {supported ? t("syncplay.disconnected") : t("syncplay.unavailable")}
          </Text>
        </View>
      )}

      {error && (
        <View
          testID='syncplay-error'
          accessibilityLiveRegion='assertive'
          style={{ ...cardStyle, borderColor: "#991b1b" }}
        >
          <Text style={{ fontWeight: "600", color: "#fca5a5" }}>
            {t("syncplay.error")}
          </Text>
          <Text style={{ color: "#e5e5e5", lineHeight: 22 }}>{error}</Text>
          <SyncPlayAction
            testID='syncplay-retry'
            disabled={!available || busy}
            secondary
            onPress={() => {
              clearError();
              void refreshGroups().catch(() => {});
            }}
          >
            {t("syncplay.retry")}
          </SyncPlayAction>
        </View>
      )}

      {group ? (
        <View testID='syncplay-current-group' style={cardStyle}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: "600",
                color: "#c084fc",
              }}
            >
              {t("syncplay.current_group")}
            </Text>
            <SyncPlayAction
              testID='syncplay-refresh-group'
              secondary
              disabled={!available || busy}
              onPress={() => void getGroup(group.GroupId).catch(() => {})}
            >
              {t("syncplay.refresh_group")}
            </SyncPlayAction>
          </View>
          <Text
            testID='syncplay-group-name'
            style={{ fontSize: 22, fontWeight: "700" }}
          >
            {group.GroupName}
          </Text>
          <Text
            testID='syncplay-group-state'
            accessibilityLiveRegion='polite'
            style={{ color: "#d4d4d4" }}
          >
            {connected
              ? t(`syncplay.states.${groupState || "Idle"}`)
              : t("syncplay.reconnecting")}
          </Text>
          <View style={{ gap: 8 }}>
            <Text style={{ fontWeight: "600" }}>
              {t("syncplay.participants")}
            </Text>
            {group.Participants.map((participant, index) => (
              <View
                key={`${participant}-${index}`}
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <Ionicons
                  name='person-circle-outline'
                  size={22}
                  color='#a3a3a3'
                />
                <Text
                  testID={`syncplay-participant-${index}`}
                  style={{ flex: 1 }}
                >
                  {participant}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: "#a3a3a3", lineHeight: 22 }}>
            {t("syncplay.playback_hint")}
          </Text>
          <SyncPlayAction
            testID='syncplay-leave'
            disabled={busy}
            destructive
            onPress={() => void leaveGroup().catch(() => {})}
          >
            {t("syncplay.leave")}
          </SyncPlayAction>
        </View>
      ) : (
        <View style={cardStyle}>
          <Text style={{ fontSize: 20, fontWeight: "600" }}>
            {t("syncplay.create")}
          </Text>
          <Text style={{ color: "#a3a3a3", lineHeight: 22 }}>
            {canCreate
              ? t("syncplay.create_description")
              : t("syncplay.errors.create_denied")}
          </Text>
          <TextInput
            testID='syncplay-name-input'
            accessibilityLabel={t("syncplay.group_name")}
            placeholder={t("syncplay.group_name_placeholder")}
            placeholderTextColor='#a3a3a3'
            value={name}
            onChangeText={setName}
            editable={available && canCreate && !busy}
            maxLength={64}
            returnKeyType='done'
            onSubmitEditing={() => void create()}
            style={{
              minHeight: 50,
              backgroundColor: "#262626",
              borderWidth: 1,
              borderColor: "#525252",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: "white",
              fontSize: 16,
            }}
          />
          <SyncPlayAction
            testID='syncplay-create'
            disabled={!available || !canCreate || !name.trim() || busy}
            loading={busy}
            onPress={() => void create()}
          >
            {t("syncplay.create")}
          </SyncPlayAction>
        </View>
      )}
      {group && <SyncPlayGroupControls showLibrary={showLibrary} />}

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: "600" }}>
            {t("syncplay.available_groups")}
          </Text>
          <SyncPlayAction
            testID='syncplay-refresh'
            disabled={!available || busy}
            secondary
            onPress={() => void refreshGroups().catch(() => {})}
          >
            {t("syncplay.refresh")}
          </SyncPlayAction>
        </View>
        {busy && (
          <View
            testID='syncplay-loading'
            style={{ flexDirection: "row", gap: 10, padding: 12 }}
          >
            <ActivityIndicator color='#c084fc' />
            <Text style={{ color: "#a3a3a3" }}>{t("syncplay.loading")}</Text>
          </View>
        )}
        {otherGroups.map((entry) => (
          <View key={entry.GroupId} style={cardStyle}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>
              {entry.GroupName}
            </Text>
            <Text style={{ color: "#a3a3a3" }}>
              {entry.Participants.join(", ") || t("syncplay.no_participants")}
            </Text>
            {entry.State && (
              <Text style={{ color: "#d4d4d4" }}>
                {t(`syncplay.states.${entry.State}`)}
              </Text>
            )}
            <SyncPlayAction
              testID={`syncplay-join-${entry.GroupId}`}
              disabled={!available || busy || !!group}
              onPress={() => void joinGroup(entry.GroupId).catch(() => {})}
            >
              {t("syncplay.join")}
            </SyncPlayAction>
          </View>
        ))}
        {otherGroups.length === 0 && !busy && (
          <View testID='syncplay-empty' style={cardStyle}>
            <Text
              style={{
                color: "#a3a3a3",
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              {t("syncplay.no_groups")}
            </Text>
          </View>
        )}
        {group && otherGroups.length > 0 && (
          <Text style={{ color: "#a3a3a3", lineHeight: 22 }}>
            {t("syncplay.leave_to_join")}
          </Text>
        )}
      </View>
    </View>
  );
}
