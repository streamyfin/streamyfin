/**
 * Chromecast Device Info Sheet
 * Shows device details, volume control, and disconnect option
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useCastSession } from "react-native-google-cast";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

interface ChromecastDeviceSheetProps {
  visible: boolean;
  onClose: () => void;
  device: { friendlyName?: string } | null;
  onDisconnect: () => Promise<void>;
  volume?: number;
  onVolumeChange?: (volume: number) => Promise<void>;
}

export const ChromecastDeviceSheet: React.FC<ChromecastDeviceSheetProps> = ({
  visible,
  onClose,
  device,
  onDisconnect,
  volume = 0.5,
  onVolumeChange,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [displayVolume, setDisplayVolume] = useState(Math.round(volume * 100));
  const volumeValue = useSharedValue(volume * 100);
  const minimumValue = useSharedValue(0);
  const maximumValue = useSharedValue(100);
  const castSession = useCastSession();
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const isSliding = useRef(false);
  const lastSetVolume = useRef(Math.round(volume * 100));

  // Sync volume slider with prop changes (updates from physical buttons)
  useEffect(() => {
    volumeValue.value = volume * 100;
    setDisplayVolume(Math.round(volume * 100));
  }, [volume, volumeValue]);

  // Poll for volume and mute updates when sheet is visible to catch physical button changes
  useEffect(() => {
    if (!visible || !castSession) return;

    // Get initial mute state
    castSession
      .isMute()
      .then(setIsMuted)
      .catch(() => {});

    // Poll CastSession for device volume and mute state (only when not sliding)
    const interval = setInterval(async () => {
      if (isSliding.current) return;

      try {
        const deviceVolume = await castSession.getVolume();
        if (deviceVolume !== undefined) {
          const volumePercent = Math.round(deviceVolume * 100);
          // Only update if external change (physical buttons)
          if (Math.abs(volumePercent - lastSetVolume.current) > 2) {
            setDisplayVolume(volumePercent);
            volumeValue.value = volumePercent;
            lastSetVolume.current = volumePercent;
          }
        }

        // Check mute state
        const muteState = await castSession.isMute();
        setIsMuted(muteState);
      } catch {
        // Ignore errors - device might be disconnected
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, castSession, volumeValue]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await onDisconnect();
      onClose();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleVolumeComplete = async (value: number) => {
    const newVolume = value / 100;
    setDisplayVolume(Math.round(value));
    try {
      // Use CastSession.setVolume for DEVICE volume control
      // This works even when no media is playing, unlike setStreamVolume
      if (castSession) {
        await castSession.setVolume(newVolume);
      } else if (onVolumeChange) {
        // Fallback to prop method if session not available
        await onVolumeChange(newVolume);
      }
    } catch (error) {
      console.error("[Volume] Error setting volume:", error);
    }
  };

  // Debounced volume update during sliding for smooth live feedback
  const handleVolumeChange = useCallback(
    (value: number) => {
      setDisplayVolume(Math.round(value));

      // Debounce the API call to avoid too many requests
      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
      }

      volumeDebounceRef.current = setTimeout(async () => {
        const newVolume = value / 100;
        try {
          if (castSession) {
            await castSession.setVolume(newVolume);
          }
        } catch {
          // Ignore errors during sliding
        }
      }, 150); // 150ms debounce
    },
    [castSession],
  );

  // Toggle mute state
  const handleToggleMute = useCallback(async () => {
    if (!castSession) return;
    try {
      const newMuteState = !isMuted;
      await castSession.setMute(newMuteState);
      setIsMuted(newMuteState);
    } catch (error) {
      console.error("[Volume] Error toggling mute:", error);
    }
  }, [castSession, isMuted]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
      }
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType='slide'
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
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
              paddingBottom: insets.bottom + 16,
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Ionicons name='tv' size={24} color='#a855f7' />
                <Text
                  style={{ color: "white", fontSize: 18, fontWeight: "600" }}
                >
                  {t("casting_player.chromecast")}
                </Text>
              </View>
              <Pressable onPress={onClose} style={{ padding: 8 }}>
                <Ionicons name='close' size={24} color='white' />
              </Pressable>
            </View>

            {/* Device info */}
            <View style={{ padding: 16 }}>
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: "#999", fontSize: 12, marginBottom: 4 }}>
                  {t("casting_player.device_name")}
                </Text>
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "500" }}
                >
                  {device?.friendlyName || t("casting_player.unknown_device")}
                </Text>
              </View>
              {/* Volume control */}
              <View style={{ marginBottom: 24 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: "#999", fontSize: 12 }}>
                    {t("casting_player.volume")}
                  </Text>
                  <Text style={{ color: "white", fontSize: 14 }}>
                    {isMuted ? t("casting_player.muted") : `${displayVolume}%`}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {/* Mute button */}
                  <Pressable
                    onPress={handleToggleMute}
                    style={{
                      padding: 8,
                      borderRadius: 20,
                      backgroundColor: isMuted ? "#a855f7" : "transparent",
                    }}
                  >
                    <Ionicons
                      name={isMuted ? "volume-mute" : "volume-low"}
                      size={20}
                      color={isMuted ? "white" : "#999"}
                    />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      progress={volumeValue}
                      minimumValue={minimumValue}
                      maximumValue={maximumValue}
                      theme={{
                        disableMinTrackTintColor: "#333",
                        maximumTrackTintColor: "#333",
                        minimumTrackTintColor: isMuted ? "#666" : "#a855f7",
                        bubbleBackgroundColor: "#a855f7",
                      }}
                      onSlidingStart={() => {
                        isSliding.current = true;
                      }}
                      onValueChange={async (value) => {
                        volumeValue.value = value;
                        handleVolumeChange(value);
                        // Unmute when adjusting volume
                        if (isMuted) {
                          setIsMuted(false);
                          try {
                            await castSession?.setMute(false);
                          } catch (error) {
                            console.error("[Volume] Failed to unmute:", error);
                            setIsMuted(true); // Rollback on failure
                          }
                        }
                      }}
                      onSlidingComplete={(value) => {
                        isSliding.current = false;
                        lastSetVolume.current = Math.round(value);
                        handleVolumeComplete(value);
                      }}
                      panHitSlop={{ top: 20, bottom: 20, left: 0, right: 0 }}
                    />
                  </View>
                  <Ionicons
                    name='volume-high'
                    size={20}
                    color={isMuted ? "#666" : "#999"}
                  />
                </View>
              </View>

              {/* Disconnect button */}
              <Pressable
                onPress={handleDisconnect}
                disabled={isDisconnecting}
                style={{
                  backgroundColor: "#a855f7",
                  padding: 16,
                  borderRadius: 8,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  opacity: isDisconnecting ? 0.5 : 1,
                }}
              >
                <Ionicons
                  name='power'
                  size={20}
                  color='white'
                  style={{ marginTop: 2 }}
                />
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                >
                  {isDisconnecting
                    ? t("casting_player.disconnecting")
                    : t("casting_player.stop_casting")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
};
