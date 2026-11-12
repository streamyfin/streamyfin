import { requireNativeView } from "expo";
import * as React from "react";
import { useImperativeHandle, useRef } from "react";

import {
  MpvPlayerViewProps,
  MpvPlayerViewRef,
  SubtitleStyleConfig,
} from "./MpvPlayer.types";

const NativeView: React.ComponentType<MpvPlayerViewProps & { ref?: any }> =
  requireNativeView("MpvPlayer");

export default React.forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>(
  function MpvPlayerView(props, ref) {
    const nativeRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
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
      setSubtitleStyle: async (style: SubtitleStyleConfig) => {
        await nativeRef.current?.setSubtitleStyle(style);
      },
      setSubtitleAssOverride: async (mode: "no" | "force") => {
        await nativeRef.current?.setSubtitleAssOverride(mode);
      },
    }));

    return <NativeView ref={nativeRef} {...props} />;
  },
);
