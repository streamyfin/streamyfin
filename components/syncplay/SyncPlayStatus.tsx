import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { SyncPlayAction } from "./SyncPlayAction";
import { SyncPlayGroupControls } from "./SyncPlayGroupControls";

export function SyncPlayStatus({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [leaveFocused, setLeaveFocused] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const {
    group,
    groupState,
    connected,
    busy,
    error,
    leaveGroup,
    hasPrevious,
    hasNext,
    requestPrevious,
    requestNext,
  } = useSyncPlay();
  useEffect(() => {
    setQueueOpen(false);
  }, [group?.GroupId]);
  if (!group) return null;

  return (
    <View
      testID='syncplay-player-status'
      style={[
        {
          backgroundColor: "rgba(23, 23, 23, 0.92)",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#525252",
          paddingLeft: 12,
          flexDirection: "row",
          alignItems: "center",
          maxWidth: 420,
        },
        style,
      ]}
    >
      <Ionicons name='people' size={20} color='#c084fc' />
      <View style={{ flex: 1, paddingVertical: 8, marginLeft: 10 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14 }}>
          {group.GroupName}
        </Text>
        <Text
          accessibilityLiveRegion={error ? "assertive" : "polite"}
          numberOfLines={2}
          style={{
            color: error ? "#fca5a5" : "#d4d4d4",
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {error ||
            (connected
              ? t(`syncplay.states.${groupState || "Idle"}`)
              : t("syncplay.reconnecting"))}
        </Text>
      </View>
      <QueueButton
        testID='syncplay-player-queue'
        label={t("syncplay.queue")}
        icon='list'
        disabled={false}
        onPress={() => setQueueOpen(true)}
      />
      <QueueButton
        testID='syncplay-player-previous'
        label={t("live_tv.previous")}
        icon='play-skip-back'
        disabled={!connected || busy || !hasPrevious}
        onPress={() => void requestPrevious().catch(() => {})}
      />
      <QueueButton
        testID='syncplay-player-next'
        label={t("live_tv.next")}
        icon='play-skip-forward'
        disabled={!connected || busy || !hasNext}
        onPress={() => void requestNext().catch(() => {})}
      />
      <Pressable
        testID='syncplay-player-leave'
        accessibilityRole='button'
        accessibilityLabel={t("syncplay.leave")}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        focusable={!busy}
        onFocus={() => setLeaveFocused(true)}
        onBlur={() => setLeaveFocused(false)}
        onPress={() => void leaveGroup().catch(() => {})}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingHorizontal: 14,
          borderWidth: 2,
          borderColor: leaveFocused ? "white" : "transparent",
          borderRadius: 10,
          justifyContent: "center",
          opacity: busy || pressed ? 0.5 : 1,
        })}
      >
        <Text style={{ color: "#fca5a5", fontSize: 14 }}>
          {t("syncplay.leave")}
        </Text>
      </Pressable>
      {queueOpen && (
        <Modal
          visible
          transparent
          animationType='slide'
          presentationStyle='overFullScreen'
          onRequestClose={() => setQueueOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0, 0, 0, 0.75)",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 760,
                height: "90%",
                alignSelf: "center",
                backgroundColor: "#0a0a0a",
                borderRadius: 18,
                padding: 16,
                gap: 12,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Text style={{ flex: 1, fontSize: 22, fontWeight: "700" }}>
                  {t("syncplay.queue")}
                </Text>
                <SyncPlayAction
                  testID='syncplay-player-queue-close'
                  secondary
                  onPress={() => setQueueOpen(false)}
                >
                  {t("syncplay.close")}
                </SyncPlayAction>
              </View>
              <ScrollView
                testID='syncplay-player-queue-modal'
                style={{ flex: 1 }}
                keyboardShouldPersistTaps='handled'
                contentContainerStyle={{ gap: 14, paddingBottom: 20 }}
              >
                {error && (
                  <Text
                    accessibilityLiveRegion='assertive'
                    style={{ color: "#fca5a5" }}
                  >
                    {error}
                  </Text>
                )}
                <SyncPlayGroupControls />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function QueueButton({
  testID,
  label,
  icon,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: "play-skip-back" | "play-skip-forward" | "list";
  disabled: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      focusable={!disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 44,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: focused ? "white" : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.5 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color='white' />
    </Pressable>
  );
}
