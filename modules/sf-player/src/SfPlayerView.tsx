import { requireNativeView } from "expo";
import * as React from "react";
import { useImperativeHandle, useRef } from "react";

import { SfPlayerViewProps, SfPlayerViewRef } from "./SfPlayer.types";

const NativeView: React.ComponentType<SfPlayerViewProps & { ref?: any }> =
  requireNativeView("SfPlayer");

export default React.forwardRef<SfPlayerViewRef, SfPlayerViewProps>(
  function SfPlayerView(props, ref) {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      play: async () => {
        await nativeRef.current?.play();
      },
      pause: async () => {
        await nativeRef.current?.pause();
      },
      seekTo: async (position: number) => {
        await nativeRef.current?.seekTo(position);
      },
      seekBy: async (offset: number) => {
        await nativeRef.current?.seekBy(offset);
      },
      setSpeed: async (speed: number) => {
        await nativeRef.current?.setSpeed(speed);
      },
      getSpeed: async () => {
        return (await nativeRef.current?.getSpeed()) ?? 1.0;
      },
      isPaused: async () => {
        return (await nativeRef.current?.isPaused()) ?? true;
      },
      getCurrentPosition: async () => {
        return (await nativeRef.current?.getCurrentPosition()) ?? 0;
      },
      getDuration: async () => {
        return (await nativeRef.current?.getDuration()) ?? 0;
      },
      startPictureInPicture: async () => {
        await nativeRef.current?.startPictureInPicture();
      },
      stopPictureInPicture: async () => {
        await nativeRef.current?.stopPictureInPicture();
      },
      isPictureInPictureSupported: async () => {
        return (
          (await nativeRef.current?.isPictureInPictureSupported()) ?? false
        );
      },
      isPictureInPictureActive: async () => {
        return (await nativeRef.current?.isPictureInPictureActive()) ?? false;
      },
      setAutoPipEnabled: async (enabled: boolean) => {
        await nativeRef.current?.setAutoPipEnabled(enabled);
      },
      getSubtitleTracks: async () => {
        return (await nativeRef.current?.getSubtitleTracks()) ?? [];
      },
      setSubtitleTrack: async (trackId: number) => {
        await nativeRef.current?.setSubtitleTrack(trackId);
      },
      disableSubtitles: async () => {
        await nativeRef.current?.disableSubtitles();
      },
      getCurrentSubtitleTrack: async () => {
        return (await nativeRef.current?.getCurrentSubtitleTrack()) ?? 0;
      },
      addSubtitleFile: async (url: string, select = true) => {
        await nativeRef.current?.addSubtitleFile(url, select);
      },
      setSubtitlePosition: async (position: number) => {
        await nativeRef.current?.setSubtitlePosition(position);
      },
      setSubtitleScale: async (scale: number) => {
        await nativeRef.current?.setSubtitleScale(scale);
      },
      setSubtitleMarginY: async (margin: number) => {
        await nativeRef.current?.setSubtitleMarginY(margin);
      },
      setSubtitleAlignX: async (alignment: "left" | "center" | "right") => {
        await nativeRef.current?.setSubtitleAlignX(alignment);
      },
      setSubtitleAlignY: async (alignment: "top" | "center" | "bottom") => {
        await nativeRef.current?.setSubtitleAlignY(alignment);
      },
      setSubtitleFontSize: async (size: number) => {
        await nativeRef.current?.setSubtitleFontSize(size);
      },
      setSubtitleColor: async (hexColor: string) => {
        await nativeRef.current?.setSubtitleColor(hexColor);
      },
      setSubtitleBackgroundColor: async (hexColor: string) => {
        await nativeRef.current?.setSubtitleBackgroundColor(hexColor);
      },
      setSubtitleFontName: async (fontName: string) => {
        await nativeRef.current?.setSubtitleFontName?.(fontName);
      },
      getAudioTracks: async () => {
        return (await nativeRef.current?.getAudioTracks()) ?? [];
      },
      setAudioTrack: async (trackId: number) => {
        await nativeRef.current?.setAudioTrack(trackId);
      },
      getCurrentAudioTrack: async () => {
        return (await nativeRef.current?.getCurrentAudioTrack()) ?? 0;
      },
      setVideoZoomToFill: async (enabled: boolean) => {
        await nativeRef.current?.setVideoZoomToFill(enabled);
      },
      getVideoZoomToFill: async () => {
        return (await nativeRef.current?.getVideoZoomToFill()) ?? false;
      },
    }));

    return <NativeView ref={nativeRef} {...props} />;
  },
);
