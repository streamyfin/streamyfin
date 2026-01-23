/**
 * Chromecast Device Info Sheet
 * Shows device details, volume control, and disconnect option
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import type { Device } from "react-native-google-cast";
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
  showTechnicalInfo?: boolean;
  connectionQuality?: "excellent" | "good" | "fair" | "poor";
  bitrate?: number;
}

export const ChromecastDeviceSheet: React.FC<ChromecastDeviceSheetProps> = ({
  visible,
  onClose,
  device,
  onDisconnect,
  volume = 0.5,
  onVolumeChange,
  showTechnicalInfo = false,
  connectionQuality = "good",
  bitrate,
}) => {
  const insets = useSafeAreaInsets();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const volumeValue = useSharedValue(volume * 100);

  // Sync volume slider with prop changes
  useEffect(() => {
    volumeValue.value = volume * 100;
  }, [volume, volumeValue]);

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
    if (onVolumeChange) {
      await onVolumeChange(value / 100);
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

            {/* Connection Quality */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>
                Connection Quality
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor:
                      connectionQuality === "excellent"
                        ? "#10b981"
                        : connectionQuality === "good"
                          ? "#fbbf24"
                          : connectionQuality === "fair"
                            ? "#f97316"
                            : "#ef4444",
                  }}
                />
                <Text
                  style={{
                    color:
                      connectionQuality === "excellent"
                        ? "#10b981"
                        : connectionQuality === "good"
                          ? "#fbbf24"
                          : connectionQuality === "fair"
                            ? "#f97316"
                            : "#ef4444",
                    fontSize: 14,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {connectionQuality}
                </Text>
              </View>
              {bitrate && (
                <Text style={{ color: "#999", fontSize: 12, marginTop: 4 }}>
                  Bitrate: {(bitrate / 1000000).toFixed(1)} Mbps
                  {connectionQuality === "poor" &&
                    " (Low bitrate may cause buffering)"}
                  {connectionQuality === "fair" && " (Moderate quality)"}
                  {connectionQuality === "good" && " (Good quality)"}
                  {connectionQuality === "excellent" && " (Maximum quality)"}
                </Text>
              )}
            </View>

            {device?.deviceId && showTechnicalInfo && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: "#999", fontSize: 12, marginBottom: 4 }}>
                  Device ID
                </Text>
                <Text
                  style={{ color: "white", fontSize: 14 }}
                  numberOfLines={1}
                >
                  {device.deviceId}
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
                    minimumValue={useSharedValue(0)}
                    maximumValue={useSharedValue(100)}
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
                    disable={false}
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
              <Ionicons name='power' size={20} color='white' />
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
