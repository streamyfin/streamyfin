import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Video, {
  type OnLoadData,
  type OnProgressData,
} from "react-native-video";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";

export const MusicPlaybackEngine: React.FC = () => {
  const videoRef = useRef<any>(null);
  const {
    streamUrl,
    isPlaying,
    progress,
    currentTrack,
    setProgress,
    setDuration,
    reportProgress,
    onTrackEnd,
  } = useMusicPlayer();

  const isLoadedRef = useRef(false);
  const lastPlaybackProgressRef = useRef(0);
  const lastReportedProgressRef = useRef(0);
  const isSeekingRef = useRef(false);
  const seekResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleLoad = useCallback(
    (data: OnLoadData) => {
      isLoadedRef.current = true;
      if (data.duration > 0) {
        setDuration(data.duration);
      }
    },
    [setDuration],
  );

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      if (isSeekingRef.current) return;

      const newProgress = data.currentTime;
      lastPlaybackProgressRef.current = newProgress;
      setProgress(newProgress);

      // Report progress every ~10 seconds (provider also throttles, but keeping
      // this here avoids calling into it every second).
      if (
        Math.floor(newProgress) - Math.floor(lastReportedProgressRef.current) >=
        10
      ) {
        lastReportedProgressRef.current = newProgress;
        reportProgress();
      }
    },
    [setProgress, reportProgress],
  );

  const handleEnd = useCallback(() => {
    onTrackEnd();
  }, [onTrackEnd]);

  const handleError = useCallback((_error: any) => {
    // Silently handle errors
  }, []);

  useEffect(() => {
    // Reset per-track state so we don't treat normal playback as an "external seek"
    // and so we don't attempt to seek before the new source is loaded.
    isLoadedRef.current = false;
    isSeekingRef.current = false;
    lastPlaybackProgressRef.current = progress;
    lastReportedProgressRef.current = progress;

    if (seekResetTimeoutRef.current) {
      clearTimeout(seekResetTimeoutRef.current);
      seekResetTimeoutRef.current = null;
    }
  }, [streamUrl, currentTrack?.Id]);

  // Handle seek from external sources
  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (!videoRef.current) return;

    const delta = Math.abs(progress - lastPlaybackProgressRef.current);
    if (delta <= 2) return;

    isSeekingRef.current = true;
    videoRef.current.seek(progress);
    lastPlaybackProgressRef.current = progress;

    if (seekResetTimeoutRef.current) {
      clearTimeout(seekResetTimeoutRef.current);
    }

    // Reset seeking flag after a short delay (avoid stutter + allow onProgress again)
    seekResetTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
    }, 250);
  }, [progress]);

  useEffect(() => {
    return () => {
      if (seekResetTimeoutRef.current) {
        clearTimeout(seekResetTimeoutRef.current);
      }
    };
  }, []);

  if (!streamUrl || !currentTrack) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: streamUrl }}
        paused={!isPlaying}
        playInBackground
        playWhenInactive
        ignoreSilentSwitch='ignore'
        progressUpdateInterval={1000}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onEnd={handleEnd}
        onError={handleError}
        style={styles.video}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: 0,
    height: 0,
    opacity: 0,
  },
  video: {
    width: 0,
    height: 0,
  },
});
