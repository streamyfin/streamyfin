import { Asset } from "expo-asset";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  PixelRatio,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { MpvPlayerView } from "@/modules/mpv-player";
import type { MpvPlayerViewRef } from "@/modules/mpv-player/src/MpvPlayer.types";
import { useSettings } from "@/utils/atoms/settings";
import {
  getEffectiveSubtitleMarginY,
  getEffectiveSubtitleScale,
  hasCustomSubtitleStyle,
  SUBTITLE_PREVIEW_VIDEO_HEIGHT,
  SUBTITLE_PREVIEW_VIDEO_WIDTH,
} from "@/utils/subtitles";

export const SubtitlePreview = React.memo(() => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [assetUri, setAssetUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<MpvPlayerViewRef>(null);

  const loadAsset = useCallback(async () => {
    setAssetError(false);
    setIsLoading(true);
    setPlayerReady(false);
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
    const player = playerRef.current;
    if (!player || !playerReady) return;

    const rawOpacity = Number(settings.subtitleBackgroundOpacity ?? 60);
    const opacity = Math.min(
      Math.max(Number.isFinite(rawOpacity) ? rawOpacity : 60, 0),
      100,
    );
    const alpha = Math.round((opacity / 100) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

    const effectiveScale = getEffectiveSubtitleScale(
      settings.subtitleSize ?? 1,
      SUBTITLE_PREVIEW_VIDEO_WIDTH,
      SUBTITLE_PREVIEW_VIDEO_HEIGHT,
      screenWidth * PixelRatio.get(),
      screenHeight * PixelRatio.get(),
    );

    const commands: Array<() => Promise<void>> = [
      () => player.setSubtitleScale(effectiveScale * 2),
      () =>
        player.setSubtitleStyle({
          color: settings.subtitleColor,
          font: settings.subtitleFont,
          background: settings.subtitleBackground ? `#${alpha}000000` : "",
          backgroundPadding: settings.subtitleBackgroundPadding ?? 8,
        }),
    ];

    const { subtitleMarginY, subtitleAlignX, subtitleAlignY } = settings;
    if (subtitleMarginY !== undefined) {
      commands.push(() =>
        player.setSubtitleMarginY(getEffectiveSubtitleMarginY(subtitleMarginY)),
      );
    }
    if (subtitleAlignX !== undefined) {
      commands.push(() => player.setSubtitleAlignX(subtitleAlignX));
    }
    if (subtitleAlignY !== undefined) {
      commands.push(() => player.setSubtitleAlignY(subtitleAlignY));
    }

    commands.push(() =>
      player.setSubtitleAssOverride(
        hasCustomSubtitleStyle(settings) ? "force" : "no",
      ),
    );

    for (const command of commands) {
      try {
        await command();
      } catch (error) {
        console.error("Failed to apply subtitle preview style:", error);
      }
    }
  }, [settings, screenWidth, screenHeight, playerReady, playerRef]);

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
        <Text style={styles.errorText}>
          {t("home.settings.subtitles.preview_load_error")}
        </Text>
        <TouchableOpacity
          onPress={() => {
            loadAsset();
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>{t("retry")}</Text>
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
        onTracksReady={() => {
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
