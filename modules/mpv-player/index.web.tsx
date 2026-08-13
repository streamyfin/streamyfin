// Desktop (Electron/web) implementation of the MPV player surface.
//
// libmpv is a native library with no browser build, so on desktop playback runs
// through an HTML5 <video> element, with hls.js attached when Jellyfin hands
// back an HLS manifest (Chromium cannot play m3u8 natively; Safari can).
//
// Honest limitations versus the native player, all surfaced as no-ops or empty
// results rather than fake success:
//   * Embedded audio/subtitle tracks are not enumerable from a <video> element,
//     so track switching must be done server-side by restarting the stream with
//     different Jellyfin parameters. getAudioTracks()/getSubtitleTracks() return
//     only what was side-loaded as WebVTT.
//   * ASS/SSA styling, subtitle positioning and border styles are mpv-specific
//     and have no <track> equivalent.
//   * Picture-in-picture maps to the browser PiP API where available.
import Hls from "hls.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type {
  AudioTrack,
  MpvPlayerViewProps,
  MpvPlayerViewRef,
  SubtitleTrack,
  TechnicalInfo,
} from "./src/MpvPlayer.types";

const noop = async (): Promise<void> => undefined;

const isHlsSource = (url: string) =>
  url.includes(".m3u8") || url.includes("master.m3u8");

export const MpvPlayerView = forwardRef<MpvPlayerViewRef, MpvPlayerViewProps>(
  (
    {
      source,
      style,
      onLoad,
      onPlaybackStateChange,
      onProgress,
      onError,
      onTracksReady,
      onPictureInPictureChange,
    },
    ref,
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    // Subtitles side-loaded via addSubtitleFile(), the only ones we can enumerate.
    const externalSubsRef = useRef<SubtitleTrack[]>([]);

    // The screen passes fresh inline callbacks on every render, so nothing that
    // touches playback may depend on their identity. Reloading the stream and
    // seeking back to the start position on an unrelated re-render is what made
    // pausing look like it rewound and resumed by itself.
    const latest = useRef({
      source,
      onLoad,
      onPlaybackStateChange,
      onProgress,
      onError,
      onTracksReady,
      onPictureInPictureChange,
    });
    // Written after commit rather than during render: a render can be thrown
    // away or replayed, and this must only reflect renders that actually
    // happened. Declared before the effects below so they see it updated.
    useEffect(() => {
      latest.current = {
        source,
        onLoad,
        onPlaybackStateChange,
        onProgress,
        onError,
        onTracksReady,
        onPictureInPictureChange,
      };
    });

    // Only a genuinely different stream should tear playback down and rebuild
    // it, so the effect keys off the source's contents rather than its identity.
    const sourceUrl = source?.url;
    const headersKey = JSON.stringify(source?.headers ?? {});
    const subtitlesKey = (source?.externalSubtitles ?? []).join("|");
    const cacheSeconds = source?.cacheConfig?.cacheSeconds;

    // --- source wiring -------------------------------------------------------
    useEffect(() => {
      const video = videoRef.current;
      const url = sourceUrl;
      if (!video || !url) return;

      const { source, onLoad, onError, onTracksReady } = latest.current;

      hlsRef.current?.destroy();
      hlsRef.current = null;
      externalSubsRef.current = [];

      const canPlayNatively =
        video.canPlayType("application/vnd.apple.mpegurl") !== "";

      if (isHlsSource(url) && !canPlayNatively && Hls.isSupported()) {
        const hls = new Hls({
          // Mirrors the native player's cacheConfig intent: buffer ahead a
          // bounded number of seconds rather than the whole file.
          maxBufferLength: source?.cacheConfig?.cacheSeconds ?? 30,
          xhrSetup: (xhr) => {
            for (const [key, value] of Object.entries(source?.headers ?? {}))
              xhr.setRequestHeader(key, value);
          },
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal)
            onError?.({
              nativeEvent: { error: `${data.type}: ${data.details}` },
            });
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else {
        video.src = url;
      }

      // Tracks are appended by hand, so clear the previous stream's before
      // adding this one's rather than stacking them up.
      for (const track of Array.from(video.querySelectorAll("track"))) {
        track.remove();
      }

      for (const subtitle of source?.externalSubtitles ?? []) {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.src = subtitle;
        track.default = externalSubsRef.current.length === 0;
        video.appendChild(track);
        externalSubsRef.current.push({
          id: externalSubsRef.current.length + 1,
          title: `Subtitle ${externalSubsRef.current.length + 1}`,
          external: true,
          externalFilename: subtitle,
        });
      }

      if (source?.startPosition) video.currentTime = source.startPosition;
      if (source?.autoplay !== false) void video.play().catch(() => undefined);

      onLoad?.({ nativeEvent: { url } });
      onTracksReady?.({ nativeEvent: {} });

      return () => {
        hlsRef.current?.destroy();
        hlsRef.current = null;
      };
    }, [sourceUrl, headersKey, subtitlesKey, cacheSeconds]);

    // --- element events ------------------------------------------------------
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const emitState = () =>
        latest.current.onPlaybackStateChange?.({
          nativeEvent: {
            isPaused: video.paused,
            isPlaying: !video.paused && !video.ended,
            isLoading: video.readyState < 3,
            isReadyToSeek: video.readyState >= 1,
          },
        });

      const emitProgress = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const buffered =
          video.buffered.length > 0
            ? video.buffered.end(video.buffered.length - 1)
            : video.currentTime;
        latest.current.onProgress?.({
          nativeEvent: {
            position: video.currentTime,
            duration,
            progress: duration > 0 ? video.currentTime / duration : 0,
            cacheSeconds: Math.max(0, buffered - video.currentTime),
          },
        });
      };

      const emitError = () =>
        latest.current.onError?.({
          nativeEvent: { error: video.error?.message ?? "Playback failed" },
        });

      const emitPip = (isActive: boolean) => () => {
        // Chromium paints its own "Playing in picture-in-picture" placeholder
        // in the top-left corner of the video box and it cannot be restyled.
        // Hiding the element hides that text; picture-in-picture keeps running
        // because the element is still in the document, and the screen draws
        // its own centred message in its place.
        video.style.opacity = isActive ? "0" : "1";
        latest.current.onPictureInPictureChange?.({
          nativeEvent: { isActive },
        });
      };

      const onEnterPip = emitPip(true);
      const onLeavePip = emitPip(false);

      video.addEventListener("play", emitState);
      video.addEventListener("pause", emitState);
      video.addEventListener("waiting", emitState);
      video.addEventListener("canplay", emitState);
      video.addEventListener("timeupdate", emitProgress);
      video.addEventListener("progress", emitProgress);
      video.addEventListener("error", emitError);
      video.addEventListener("enterpictureinpicture", onEnterPip);
      video.addEventListener("leavepictureinpicture", onLeavePip);

      return () => {
        video.removeEventListener("play", emitState);
        video.removeEventListener("pause", emitState);
        video.removeEventListener("waiting", emitState);
        video.removeEventListener("canplay", emitState);
        video.removeEventListener("timeupdate", emitProgress);
        video.removeEventListener("progress", emitProgress);
        video.removeEventListener("error", emitError);
        video.removeEventListener("enterpictureinpicture", onEnterPip);
        video.removeEventListener("leavepictureinpicture", onLeavePip);
      };
      // Bound once for the element's lifetime; the handlers read the latest
      // callbacks through the ref, so re-binding on every render is pointless.
    }, []);

    useImperativeHandle(ref, (): MpvPlayerViewRef => {
      const video = () => videoRef.current;
      return {
        play: async () => {
          await video()?.play();
        },
        pause: async () => video()?.pause(),
        destroy: async () => {
          hlsRef.current?.destroy();
          hlsRef.current = null;
          const element = video();
          if (element) {
            element.pause();
            element.removeAttribute("src");
            element.load();
          }
        },
        seekTo: async (position) => {
          const element = video();
          if (element) element.currentTime = position;
        },
        seekBy: async (offset) => {
          const element = video();
          if (element) element.currentTime += offset;
        },
        setSpeed: async (speed) => {
          const element = video();
          if (element) element.playbackRate = speed;
        },
        getSpeed: async () => video()?.playbackRate ?? 1,
        isPaused: async () => video()?.paused ?? true,
        getCurrentPosition: async () => video()?.currentTime ?? 0,
        getDuration: async () => {
          const duration = video()?.duration;
          return Number.isFinite(duration) ? (duration as number) : 0;
        },

        startPictureInPicture: async () => {
          await video()?.requestPictureInPicture?.();
        },
        stopPictureInPicture: async () => {
          await document.exitPictureInPicture?.();
        },
        isPictureInPictureSupported: async () =>
          typeof document !== "undefined" &&
          document.pictureInPictureEnabled === true,
        isPictureInPictureActive: async () =>
          typeof document !== "undefined" &&
          document.pictureInPictureElement === video(),

        // Only side-loaded WebVTT is visible to us; embedded tracks require a
        // server-side restart of the stream.
        getSubtitleTracks: async () => externalSubsRef.current,
        setSubtitleTrack: async (trackId) => {
          const tracks = video()?.textTracks;
          if (!tracks) return;
          for (let i = 0; i < tracks.length; i++)
            tracks[i].mode = i === trackId - 1 ? "showing" : "disabled";
        },
        disableSubtitles: async () => {
          const tracks = video()?.textTracks;
          if (!tracks) return;
          for (let i = 0; i < tracks.length; i++) tracks[i].mode = "disabled";
        },
        getCurrentSubtitleTrack: async () => {
          const tracks = video()?.textTracks;
          if (!tracks) return -1;
          for (let i = 0; i < tracks.length; i++)
            if (tracks[i].mode === "showing") return i + 1;
          return -1;
        },
        addSubtitleFile: async (url, select) => {
          const element = video();
          if (!element) return;
          const track = document.createElement("track");
          track.kind = "subtitles";
          track.src = url;
          track.default = select === true;
          element.appendChild(track);
          externalSubsRef.current.push({
            id: externalSubsRef.current.length + 1,
            external: true,
            externalFilename: url,
          });
        },

        // mpv-specific subtitle styling has no <track> equivalent.
        setSubtitlePosition: noop,
        setSubtitleScale: noop,
        setSubtitleMarginY: noop,
        setSubtitleAlignX: noop,
        setSubtitleAlignY: noop,
        setSubtitleFontSize: noop,
        setSubtitleBackgroundColor: noop,
        setSubtitleBorderStyle: noop,
        setSubtitleAssOverride: noop,

        // The HTML audioTracks API is not implemented in Chromium.
        getAudioTracks: async (): Promise<AudioTrack[]> => [],
        setAudioTrack: noop,
        getCurrentAudioTrack: async () => -1,

        setZoomedToFill: async (zoomed) => {
          const element = video();
          if (element) element.style.objectFit = zoomed ? "cover" : "contain";
        },
        isZoomedToFill: async () =>
          videoRef.current?.style.objectFit === "cover",

        getTechnicalInfo: async () =>
          ({
            videoCodec: hlsRef.current ? "hls" : "native",
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight,
          }) as TechnicalInfo,
      };
    }, []);

    return (
      // Subtitle <track> elements are appended at runtime from the Jellyfin
      // stream's own subtitle list (see the source effect and addSubtitleFile
      // above), so there is no static track for the rule to find.
      // biome-ignore lint/a11y/useMediaCaption: tracks are added at runtime
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "black",
          objectFit: "contain",
          ...(style as object),
        }}
        playsInline
        controls={false}
      />
    );
  },
);

MpvPlayerView.displayName = "MpvPlayerView";

export * from "./src/MpvPlayer.types";
export default {};
