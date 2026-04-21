import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { MpvPlayerView } from "@/modules/mpv-player";
import { useSettings } from "@/utils/atoms/settings";

export const SubtitlePreview = () => {
  const { settings } = useSettings();
  const [assetUri, setAssetUri] = useState<string | null>(null);
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
        }
      } catch (error) {
        console.error("Failed to load subtitle preview asset:", error);
      }
    };
    loadAsset();
    return () => {
      isMounted = false;
    };
  }, []);

  const applyStyle = async () => {
    if (!playerRef.current) return;

    const alpha = Math.round((settings.subtitleBackgroundOpacity / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    await playerRef.current.setSubtitleStyle({
      fontSize: settings.subtitleSize,
      color: settings.subtitleColor,
      font: settings.subtitleFont,
      background: settings.subtitleBackground ? `#${alpha}000000` : "",
      backgroundPadding: settings.subtitleBackgroundPadding || 18,
    });
  };

  useEffect(() => {
    applyStyle();
  }, [settings, assetUri]);

  if (!assetUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color='white' />
      </View>
    );
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
          applyStyle();
        }}
      />
    </View>
  );
};

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
