import { Asset } from "expo-asset";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { MpvPlayerView } from "@/modules/mpv-player";
import { useSettings } from "@/utils/atoms/settings";

export const SubtitlePreview = React.memo(() => {
  const { settings } = useSettings();
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    const loadAsset = async () => {
      try {
        const asset = Asset.fromModule(
          require("@/assets/sample_subtitled.mp4"),
        );
        await asset.downloadAsync();
        if (isMounted) {
          setAssetUri(asset.localUri || asset.uri);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load subtitle preview asset:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadAsset();
    return () => {
      isMounted = false;
    };
  }, []);

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
});
