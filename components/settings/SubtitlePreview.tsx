import { Asset } from "expo-asset";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { MpvPlayerView } from "@/modules/mpv-player";
import type { MpvPlayerViewRef } from "@/modules/mpv-player/src/MpvPlayer.types";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";

export const SubtitlePreview = React.memo(() => {
  const { settings } = useSettings();
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<MpvPlayerViewRef>(null);

  const loadAsset = useCallback(async () => {
    setAssetError(false);
    setIsLoading(true);
    try {
      const asset = Asset.fromModule(require("@/assets/sample_subtitled.mp4"));
      await asset.downloadAsync();
      setAssetUri(asset.localUri || asset.uri);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load subtitle preview asset:", error);
      setAssetError(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAsset();
  }, [loadAsset]);

  const applyStyle = useCallback(async () => {
    if (!playerRef.current || !playerReady) return;

    const alpha = Math.round((settings.subtitleBackgroundOpacity / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    await playerRef.current.setSubtitleStyle({
      fontSize: settings.subtitleSize,
      color: settings.subtitleColor,
      font: settings.subtitleFont,
      background: settings.subtitleBackground ? `#${alpha}000000` : "",
      backgroundPadding: settings.subtitleBackgroundPadding ?? 12,
    });
  }, [settings, playerReady, playerRef]);

  useEffect(() => {
    applyStyle().catch((err: unknown) =>
      console.error("Failed to apply subtitle style:", err),
    );
  }, [applyStyle, assetUri]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color='white' />
      </View>
    );
  }

  if (assetError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>Failed to load preview</Text>
        <TouchableOpacity
          onPress={() => {
            loadAsset();
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!assetUri) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <MpvPlayerView
        ref={playerRef}
        style={styles.player}
        source={{
          url: assetUri,
          autoplay: true,
          initialSubtitleId: 1,
          loop: true,
        }}
        onLoad={() => {
          setPlayerReady(true);
        }}
      />
    </View>
  );
});
SubtitlePreview.displayName = "SubtitlePreview";

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "black",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 16,
  },
  player: {
    flex: 1,
  },
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  errorText: {
    color: "#FF453A",
    marginBottom: 10,
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "#333",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  retryText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
});
