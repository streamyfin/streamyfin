import { requireNativeView } from "expo";
import * as React from "react";
import { useImperativeHandle, useRef } from "react";

import { MpvPlayerViewProps, MpvPlayerViewRef } from "./MpvPlayer.types";

const NativeView: React.ComponentType<MpvPlayerViewProps & { ref?: any }> =
  requireNativeView("MpvPlayer");

export default React.forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>(
  function MpvPlayerView(props, ref) {
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
        return await nativeRef.current?.getSpeed();
      },
      isPaused: async () => {
        return await nativeRef.current?.isPaused();
      },
      getCurrentPosition: async () => {
        return await nativeRef.current?.getCurrentPosition();
      },
      getDuration: async () => {
        return await nativeRef.current?.getDuration();
      },
      startPictureInPicture: async () => {
        await nativeRef.current?.startPictureInPicture();
      },
      stopPictureInPicture: async () => {
        await nativeRef.current?.stopPictureInPicture();
      },
      isPictureInPictureSupported: async () => {
        return await nativeRef.current?.isPictureInPictureSupported();
      },
      isPictureInPictureActive: async () => {
        return await nativeRef.current?.isPictureInPictureActive();
      },
      getSubtitleTracks: async () => {
        return await nativeRef.current?.getSubtitleTracks();
      },
      setSubtitleTrack: async (trackId: number) => {
        await nativeRef.current?.setSubtitleTrack(trackId);
      },
      disableSubtitles: async () => {
        await nativeRef.current?.disableSubtitles();
      },
      getCurrentSubtitleTrack: async () => {
        return await nativeRef.current?.getCurrentSubtitleTrack();
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
      // Audio controls
      getAudioTracks: async () => {
        return await nativeRef.current?.getAudioTracks();
      },
      setAudioTrack: async (trackId: number) => {
        await nativeRef.current?.setAudioTrack(trackId);
      },
      getCurrentAudioTrack: async () => {
        return await nativeRef.current?.getCurrentAudioTrack();
      },
      // Video scaling
      setZoomedToFill: async (zoomed: boolean) => {
        await nativeRef.current?.setZoomedToFill(zoomed);
      },
      isZoomedToFill: async () => {
        return await nativeRef.current?.isZoomedToFill();
      },
      // Technical info
      getTechnicalInfo: async () => {
        return await nativeRef.current?.getTechnicalInfo();
      },
    }));

    return <NativeView ref={nativeRef} {...props} />;
  },
);
