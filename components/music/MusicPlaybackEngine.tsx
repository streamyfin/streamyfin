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

  const lastProgressRef = useRef(0);
  const isSeeking = useRef(false);

  const handleLoad = useCallback(
    (data: OnLoadData) => {
      if (data.duration > 0) {
        setDuration(data.duration);
      }
    },
    [setDuration],
  );

  const handleProgress = useCallback(
    (data: OnProgressData) => {
      if (isSeeking.current) return;

      const newProgress = data.currentTime;
      setProgress(newProgress);

      // Report progress every ~10 seconds
      if (Math.floor(newProgress) - Math.floor(lastProgressRef.current) >= 10) {
        lastProgressRef.current = newProgress;
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

  // Handle seek from external sources
  useEffect(() => {
    if (videoRef.current && Math.abs(progress - lastProgressRef.current) > 2) {
      isSeeking.current = true;
      videoRef.current.seek(progress);
      lastProgressRef.current = progress;
      // Reset seeking flag after a short delay
      setTimeout(() => {
        isSeeking.current = false;
      }, 500);
    }
  }, [progress]);

  if (!streamUrl || !currentTrack) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{ uri: streamUrl }}
        paused={!isPlaying}
        audioOnly
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
