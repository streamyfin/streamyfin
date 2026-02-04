/**
 * Chromecast Device Info Sheet
 * Shows device details, volume control, and disconnect option
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import type { Device } from "react-native-google-cast";
import { useCastSession, useRemoteMediaClient } from "react-native-google-cast";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

interface ChromecastDeviceSheetProps {
  visible: boolean;
  onClose: () => void;
  device: Device | null;
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
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const volumeValue = useSharedValue(volume * 100);
  const minimumValue = useSharedValue(0);
  const maximumValue = useSharedValue(100);
  const castSession = useCastSession();
  const remoteMediaClient = useRemoteMediaClient();

  // Sync volume slider with prop changes (updates from physical buttons)
  useEffect(() => {
    volumeValue.value = volume * 100;
  }, [volume, volumeValue]);

  // Poll for volume updates when sheet is visible to catch physical button changes
  useEffect(() => {
    if (!visible || !remoteMediaClient) return;

    // Request status update to get latest volume from device
    const interval = setInterval(() => {
      remoteMediaClient.requestStatus().catch(() => {
        // Ignore errors - device might be disconnected
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, remoteMediaClient]);

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
    try {
      // Use CastSession.setVolume for DEVICE volume control
      // This works even when no media is playing, unlike setStreamVolume
      if (castSession) {
        castSession.setVolume(newVolume);
        console.log("[Volume] Set device volume via CastSession:", newVolume);
      } else if (onVolumeChange) {
        // Fallback to prop method if session not available
        await onVolumeChange(newVolume);
      }
    } catch (error) {
      console.error("[Volume] Error setting volume:", error);
    }
  };

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
              <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
                Chromecast
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
                Device Name
              </Text>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "500" }}>
                {device?.friendlyName || device?.deviceId || "Unknown Device"}
              </Text>
            </View>
            {device?.deviceId && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: "#999", fontSize: 12, marginBottom: 4 }}>
                  Device ID
                </Text>
                <Text
                  style={{ color: "white", fontSize: 14 }}
                  numberOfLines={1}
                >
                  {device?.deviceId}
                </Text>
              </View>
            )}
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
                <Text style={{ color: "#999", fontSize: 12 }}>Volume</Text>
                <Text style={{ color: "white", fontSize: 14 }}>
                  {Math.round((volume || 0) * 100)}%
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Ionicons name='volume-low' size={20} color='#999' />
                <View style={{ flex: 1 }}>
                  <Slider
                    style={{ width: "100%", height: 40 }}
                    progress={volumeValue}
                    minimumValue={minimumValue}
                    maximumValue={maximumValue}
                    theme={{
                      disableMinTrackTintColor: "#333",
                      maximumTrackTintColor: "#333",
                      minimumTrackTintColor: "#a855f7",
                      bubbleBackgroundColor: "#a855f7",
                    }}
                    onSlidingStart={() => {
                      console.log(
                        "[Volume] Sliding started",
                        volumeValue.value,
                      );
                    }}
                    onValueChange={(value) => {
                      volumeValue.value = value;
                      console.log("[Volume] Value changed", value);
                    }}
                    onSlidingComplete={handleVolumeComplete}
                    panHitSlop={{ top: 20, bottom: 20, left: 0, right: 0 }}
                  />
                </View>
                <Ionicons name='volume-high' size={20} color='#999' />
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
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                {isDisconnecting ? "Disconnecting..." : "Stop Casting"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
