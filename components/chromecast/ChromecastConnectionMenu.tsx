/**
 * Chromecast Connection Menu
 * Shows device info, volume control, and disconnect option
 * Simple menu for when connected but not actively controlling playback
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useCastDevice, useCastSession } from "react-native-google-cast";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

interface ChromecastConnectionMenuProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect?: () => Promise<void>;
}

export const ChromecastConnectionMenu: React.FC<
  ChromecastConnectionMenuProps
> = ({ visible, onClose, onDisconnect }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const castDevice = useCastDevice();
  const castSession = useCastSession();

  // Volume state - use refs to avoid triggering re-renders during sliding
  const [displayVolume, setDisplayVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const volumeValue = useSharedValue(50);
  const minimumValue = useSharedValue(0);
  const maximumValue = useSharedValue(100);
  const isSliding = useRef(false);
  const lastSetVolume = useRef(50);

  const protocolColor = "#a855f7";

  // Get initial volume and mute state when menu opens
  useEffect(() => {
    if (!visible || !castSession) return;

    // Get initial states
    const fetchInitialState = async () => {
      try {
        const vol = await castSession.getVolume();
        if (vol !== undefined) {
          const percent = Math.round(vol * 100);
          setDisplayVolume(percent);
          volumeValue.value = percent;
          lastSetVolume.current = percent;
        }
        const muted = await castSession.isMute();
        isMutedRef.current = muted;
        setIsMuted(muted);
      } catch {
        // Ignore errors
      }
    };
    fetchInitialState();

    // Poll for external volume changes (physical buttons) - only when not sliding
    const interval = setInterval(async () => {
      if (isSliding.current) return;

      try {
        const vol = await castSession.getVolume();
        if (vol !== undefined) {
          const percent = Math.round(vol * 100);
          // Only update if external change detected (not our own change)
          if (Math.abs(percent - lastSetVolume.current) > 2) {
            setDisplayVolume(percent);
            volumeValue.value = percent;
            lastSetVolume.current = percent;
          }
        }
        const muted = await castSession.isMute();
        if (muted !== isMutedRef.current) {
          isMutedRef.current = muted;
          setIsMuted(muted);
        }
      } catch {
        // Ignore errors
      }
    }, 1000); // Poll less frequently

    return () => clearInterval(interval);
  }, [visible, castSession, volumeValue]);

  // Volume change during sliding - update display only, don't call API
  const handleVolumeChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    setDisplayVolume(rounded);
  }, []);

  // Volume change complete - call API
  const handleVolumeComplete = useCallback(
    async (value: number) => {
      isSliding.current = false;
      const rounded = Math.round(value);
      setDisplayVolume(rounded);
      lastSetVolume.current = rounded;

      try {
        if (castSession) {
          await castSession.setVolume(rounded / 100);
        }
      } catch (error) {
        console.error("[Connection Menu] Volume error:", error);
      }
    },
    [castSession],
  );

  // Toggle mute
  const handleToggleMute = useCallback(async () => {
    if (!castSession) return;
    try {
      const newMute = !isMuted;
      await castSession.setMute(newMute);
      isMutedRef.current = newMute;
      setIsMuted(newMute);
    } catch (error) {
      console.error("[Connection Menu] Mute error:", error);
    }
  }, [castSession, isMuted]);

  // Disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      if (onDisconnect) {
        await onDisconnect();
      }
    } catch (error) {
      console.error("[Connection Menu] Disconnect error:", error);
    } finally {
      onClose();
    }
  }, [onDisconnect, onClose]);

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
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            justifyContent: "flex-end",
          }}
          onPress={onClose}
        >
          <Pressable
            style={{
              backgroundColor: "#1a1a1a",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: insets.bottom + 16,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header with device name */}
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
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: protocolColor,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name='tv' size={20} color='white' />
                </View>
                <View>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                  >
                    {castDevice?.friendlyName || t("casting_player.chromecast")}
                  </Text>
                  <Text style={{ color: protocolColor, fontSize: 12 }}>
                    {t("casting_player.connected")}
                  </Text>
                </View>
              </View>
              <Pressable onPress={onClose} style={{ padding: 8 }}>
                <Ionicons name='close' size={24} color='white' />
              </Pressable>
            </View>

            {/* Volume Control */}
            <View style={{ padding: 16 }}>
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
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Pressable
                  onPress={handleToggleMute}
                  style={{
                    padding: 8,
                    borderRadius: 20,
                    backgroundColor: isMuted ? protocolColor : "transparent",
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
                      minimumTrackTintColor: isMuted ? "#666" : protocolColor,
                      bubbleBackgroundColor: protocolColor,
                    }}
                    onSlidingStart={() => {
                      isSliding.current = true;
                    }}
                    onValueChange={async (value) => {
                      volumeValue.value = value;
                      handleVolumeChange(value);
                      // Unmute when adjusting volume - use ref to avoid
                      // stale closure and prevent repeated async calls
                      if (isMutedRef.current) {
                        isMutedRef.current = false;
                        setIsMuted(false);
                        try {
                          await castSession?.setMute(false);
                        } catch (error: unknown) {
                          console.error(
                            "[ChromecastConnectionMenu] Failed to unmute:",
                            error,
                          );
                          isMutedRef.current = true;
                          setIsMuted(true); // Rollback on failure
                        }
                      }
                    }}
                    onSlidingComplete={handleVolumeComplete}
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
            <View style={{ paddingHorizontal: 16 }}>
              <Pressable
                onPress={handleDisconnect}
                style={{
                  backgroundColor: protocolColor,
                  padding: 14,
                  borderRadius: 8,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name='power' size={20} color='white' />
                <Text
                  style={{ color: "white", fontSize: 14, fontWeight: "500" }}
                >
                  {t("casting_player.disconnect")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
};
