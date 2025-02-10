import { requireNativeViewManager } from "expo-modules-core";
import * as React from "react";

import {
  VlcPlayerViewProps,
  VlcPlayerViewRef,
  VlcPlayerSource,
} from "./VlcPlayer.types";

interface NativeViewRef extends VlcPlayerViewRef {
  setNativeProps?: (props: Partial<VlcPlayerViewProps>) => void;
}

const NativeViewManager = requireNativeViewManager("VlcPlayer");

// Create a forwarded ref version of the native view
const NativeView = React.forwardRef<NativeViewRef, VlcPlayerViewProps>(
  (props, ref) => <NativeViewManager {...props} ref={ref} />
);

const VlcPlayerView = React.forwardRef<VlcPlayerViewRef, VlcPlayerViewProps>(
  (props, ref) => {
    const nativeRef = React.useRef<NativeViewRef>(null);

    React.useImperativeHandle(ref, () => ({
      startPictureInPicture: async () => {
        await nativeRef.current?.startPictureInPicture()
      },
      play: async () => {
        await nativeRef.current?.play();
      },
      pause: async () => {
        await nativeRef.current?.pause();
      },
      stop: async () => {
        await nativeRef.current?.stop();
      },
      seekTo: async (time: number) => {
        await nativeRef.current?.seekTo(time);
      },
      setAudioTrack: async (trackIndex: number) => {
        await nativeRef.current?.setAudioTrack(trackIndex);
      },
      getAudioTracks: async () => {
        const tracks = await nativeRef.current?.getAudioTracks();
        return tracks ?? null;
      },
      setSubtitleTrack: async (trackIndex: number) => {
        await nativeRef.current?.setSubtitleTrack(trackIndex);
      },
      getSubtitleTracks: async () => {
        const tracks = await nativeRef.current?.getSubtitleTracks();
        return tracks ?? null;
      },
      setSubtitleDelay: async (delay: number) => {
        await nativeRef.current?.setSubtitleDelay(delay);
      },
      setAudioDelay: async (delay: number) => {
        await nativeRef.current?.setAudioDelay(delay);
      },
      takeSnapshot: async (path: string, width: number, height: number) => {
        await nativeRef.current?.takeSnapshot(path, width, height);
      },
      setRate: async (rate: number) => {
        await nativeRef.current?.setRate(rate);
      },
      nextChapter: async () => {
        await nativeRef.current?.nextChapter();
      },
      previousChapter: async () => {
        await nativeRef.current?.previousChapter();
      },
      getChapters: async () => {
        const chapters = await nativeRef.current?.getChapters();
        return chapters ?? null;
      },
      setVideoCropGeometry: async (geometry: string | null) => {
        await nativeRef.current?.setVideoCropGeometry(geometry);
      },
      getVideoCropGeometry: async () => {
        const geometry = await nativeRef.current?.getVideoCropGeometry();
        return geometry ?? null;
      },
      setSubtitleURL: async (url: string, name: string) => {
        await nativeRef.current?.setSubtitleURL(url, name);
      },
    }));

    const {
      source,
      style,
      progressUpdateInterval = 500,
      paused,
      muted,
      volume,
      videoAspectRatio,
      onVideoLoadStart,
      onVideoStateChange,
      onVideoProgress,
      onVideoLoadEnd,
      onVideoError,
      onPipStarted,
      ...otherProps
    } = props;

    const processedSource: VlcPlayerSource =
      typeof source === "string" ? { uri: source } : source;

    if (processedSource.startPosition !== undefined) {
      processedSource.startPosition = Math.floor(processedSource.startPosition);
    }

    return (
      <NativeView
        {...otherProps}
        ref={nativeRef}
        source={processedSource}
        style={[{ width: "100%", height: "100%" }, style]}
        progressUpdateInterval={progressUpdateInterval}
        paused={paused}
        muted={muted}
        volume={volume}
        videoAspectRatio={videoAspectRatio}
        onVideoLoadStart={onVideoLoadStart}
        onVideoLoadEnd={onVideoLoadEnd}
        onVideoStateChange={onVideoStateChange}
        onVideoProgress={onVideoProgress}
        onVideoError={onVideoError}
        onPipStarted={onPipStarted}
      />
    );
  }
);

export default VlcPlayerView;
