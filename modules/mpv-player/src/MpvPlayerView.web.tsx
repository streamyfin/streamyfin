import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { MpvPlayerViewProps, MpvPlayerViewRef } from "./MpvPlayer.types";

const finite = (value: number | undefined) =>
  Number.isFinite(value) ? value! : 0;

/** HTML video implements the same local adapter used by synchronized native playback. */
export default forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>(
  function MpvPlayerView(props, ref) {
    const { t } = useTranslation();
    const video = useRef<HTMLVideoElement>(null);
    const [zoomed, setZoomed] = useState(false);
    const noChange = async () => {};
    const onPictureInPictureChange = props.onPictureInPictureChange;
    useEffect(() => {
      const node = video.current;
      if (!node || !onPictureInPictureChange) return;
      const enter = () =>
        onPictureInPictureChange({ nativeEvent: { isActive: true } });
      const leave = () =>
        onPictureInPictureChange({ nativeEvent: { isActive: false } });
      node.addEventListener("enterpictureinpicture", enter);
      node.addEventListener("leavepictureinpicture", leave);
      return () => {
        node.removeEventListener("enterpictureinpicture", enter);
        node.removeEventListener("leavepictureinpicture", leave);
      };
    }, [onPictureInPictureChange]);

    useImperativeHandle(
      ref,
      () => ({
        play: async () => {
          await video.current?.play();
        },
        pause: async () => {
          video.current?.pause();
        },
        destroy: async () => {
          const node = video.current;
          if (node) {
            node.pause();
            node.removeAttribute("src");
            node.load();
          }
        },
        seekTo: async (position) => {
          if (video.current) video.current.currentTime = Math.max(0, position);
        },
        seekBy: async (offset) => {
          if (video.current)
            video.current.currentTime = Math.max(
              0,
              video.current.currentTime + offset,
            );
        },
        setSpeed: async (speed) => {
          if (video.current) video.current.playbackRate = speed;
        },
        getSpeed: async () => video.current?.playbackRate ?? 1,
        setMute: async (muted) => {
          if (video.current) video.current.muted = muted;
        },
        isPaused: async () => video.current?.paused ?? true,
        getCurrentPosition: async () => finite(video.current?.currentTime),
        getDuration: async () => finite(video.current?.duration),
        startPictureInPicture: async () => {
          await video.current?.requestPictureInPicture?.();
        },
        stopPictureInPicture: async () => {
          if (document.pictureInPictureElement)
            await document.exitPictureInPicture();
        },
        isPictureInPictureSupported: async () =>
          !!document.pictureInPictureEnabled,
        isPictureInPictureActive: async () =>
          document.pictureInPictureElement === video.current,
        getSubtitleTracks: async () =>
          Array.from(video.current?.textTracks ?? []).map((track, index) => ({
            id: index + 1,
            title: track.label,
            lang: track.language,
            selected: track.mode === "showing",
          })),
        setSubtitleTrack: async (id) => {
          Array.from(video.current?.textTracks ?? []).forEach(
            (track, index) => {
              track.mode = index + 1 === id ? "showing" : "disabled";
            },
          );
        },
        disableSubtitles: async () => {
          Array.from(video.current?.textTracks ?? []).forEach((track) => {
            track.mode = "disabled";
          });
        },
        getCurrentSubtitleTrack: async () => {
          const index = Array.from(video.current?.textTracks ?? []).findIndex(
            (track) => track.mode === "showing",
          );
          return index < 0 ? -1 : index + 1;
        },
        addSubtitleFile: async (url, select = true) => {
          if (!video.current) return;
          const track = document.createElement("track");
          track.kind = "subtitles";
          track.src = url;
          track.default = select;
          video.current.appendChild(track);
        },
        setSubtitlePosition: noChange,
        setSubtitleScale: noChange,
        setSubtitleMarginY: noChange,
        setSubtitleAlignX: noChange,
        setSubtitleAlignY: noChange,
        setSubtitleStyle: noChange,
        setSubtitleFontSize: noChange,
        setSubtitleBackgroundColor: noChange,
        setSubtitleBorderStyle: noChange,
        setSubtitleAssOverride: noChange,
        getAudioTracks: async () => [],
        setAudioTrack: noChange,
        getCurrentAudioTrack: async () => -1,
        setZoomedToFill: async (value) => setZoomed(value),
        isZoomedToFill: async () => zoomed,
        getTechnicalInfo: async () => ({
          videoWidth: video.current?.videoWidth,
          videoHeight: video.current?.videoHeight,
        }),
      }),
      [zoomed],
    );

    const state = (loading = false) =>
      props.onPlaybackStateChange?.({
        nativeEvent: {
          isPaused: video.current?.paused ?? true,
          isPlaying: !(video.current?.paused ?? true),
          isLoading: loading,
          isReadyToSeek: (video.current?.readyState ?? 0) >= 2,
        },
      });

    return (
      <View style={[{ backgroundColor: "black" }, props.style]}>
        <video
          ref={video}
          aria-label={t("player.mpv_player_title")}
          data-testid='syncplay-web-video'
          src={props.source?.url || undefined}
          autoPlay={props.source?.autoplay ?? false}
          loop={props.source?.loop}
          muted
          playsInline
          preload='auto'
          style={{
            width: "100%",
            height: "100%",
            objectFit: zoomed ? "cover" : "contain",
          }}
          onLoadedMetadata={() => {
            if (video.current && props.source?.startPosition)
              video.current.currentTime = props.source.startPosition;
            props.onLoad?.({ nativeEvent: { url: props.source?.url ?? "" } });
            props.onTracksReady?.({ nativeEvent: {} });
            state();
          }}
          onCanPlay={() => state()}
          onPlay={() => state()}
          onPause={() => state()}
          onWaiting={() => state(true)}
          onSeeking={() => state(true)}
          onSeeked={() => state()}
          onTimeUpdate={() => {
            const node = video.current;
            if (!node) return;
            const duration = finite(node.duration);
            let cacheSeconds = 0;
            for (let i = 0; i < node.buffered.length; i++) {
              if (
                node.buffered.start(i) <= node.currentTime &&
                node.buffered.end(i) >= node.currentTime
              )
                cacheSeconds = node.buffered.end(i) - node.currentTime;
            }
            props.onProgress?.({
              nativeEvent: {
                position: node.currentTime,
                duration,
                progress: duration ? node.currentTime / duration : 0,
                cacheSeconds,
              },
            });
          }}
          onEnded={() => {
            state();
            props.onPlaybackEnded?.({ nativeEvent: {} });
          }}
          onError={() =>
            props.onError?.({
              nativeEvent: {
                error:
                  video.current?.error?.message ||
                  t("player.an_error_occurred_while_playing_the_video"),
              },
            })
          }
        />
      </View>
    );
  },
);
