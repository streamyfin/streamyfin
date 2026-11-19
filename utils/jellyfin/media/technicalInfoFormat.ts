/** How the technical info panels write what plays: the local JS player's and the remote player's. */

export type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

export const formatBitrate = (bitsPerSecond: number): string => {
  const mbps = bitsPerSecond / 1_000_000;
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  }
  const kbps = bitsPerSecond / 1_000;
  return `${kbps.toFixed(0)} Kbps`;
};

export const formatCodec = (codec: string): string => {
  // Normalize common codec names
  const codecMap: Record<string, string> = {
    h264: "H.264",
    hevc: "HEVC",
    h265: "HEVC",
    vp9: "VP9",
    vp8: "VP8",
    av1: "AV1",
    aac: "AAC",
    ac3: "AC3",
    eac3: "E-AC3",
    dts: "DTS",
    truehd: "TrueHD",
    flac: "FLAC",
    opus: "Opus",
    mp3: "MP3",
    // Subtitle codecs
    srt: "SRT",
    subrip: "SRT",
    ass: "ASS",
    ssa: "SSA",
    webvtt: "WebVTT",
    vtt: "WebVTT",
    pgs: "PGS",
    hdmv_pgs_subtitle: "PGS",
    dvd_subtitle: "VobSub",
    dvdsub: "VobSub",
    mov_text: "MOV Text",
    cc_dec: "CC",
    eia_608: "CC",
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
};

export const getPlayMethodLabel = (method: PlayMethod): string => {
  switch (method) {
    case "DirectPlay":
      return "Direct Play";
    case "DirectStream":
      return "Direct Stream";
    case "Transcode":
      return "Transcoding";
    default:
      return method;
  }
};

export const formatTranscodeReason = (reason: string): string => {
  // Convert camelCase/PascalCase to readable format
  const reasonMap: Record<string, string> = {
    ContainerNotSupported: "Container not supported",
    VideoCodecNotSupported: "Video codec not supported",
    AudioCodecNotSupported: "Audio codec not supported",
    SubtitleCodecNotSupported: "Subtitle codec not supported",
    AudioIsExternal: "Audio is external",
    SecondaryAudioNotSupported: "Secondary audio not supported",
    VideoProfileNotSupported: "Video profile not supported",
    VideoLevelNotSupported: "Video level not supported",
    VideoResolutionNotSupported: "Resolution not supported",
    VideoBitDepthNotSupported: "Bit depth not supported",
    VideoFramerateNotSupported: "Framerate not supported",
    RefFramesNotSupported: "Ref frames not supported",
    AnamorphicVideoNotSupported: "Anamorphic video not supported",
    InterlacedVideoNotSupported: "Interlaced video not supported",
    AudioChannelsNotSupported: "Audio channels not supported",
    AudioProfileNotSupported: "Audio profile not supported",
    AudioSampleRateNotSupported: "Sample rate not supported",
    AudioBitDepthNotSupported: "Audio bit depth not supported",
    ContainerBitrateExceedsLimit: "Bitrate exceeds limit",
    VideoBitrateNotSupported: "Video bitrate not supported",
    AudioBitrateNotSupported: "Audio bitrate not supported",
    UnknownVideoStreamInfo: "Unknown video stream",
    UnknownAudioStreamInfo: "Unknown audio stream",
    DirectPlayError: "Direct play error",
    VideoRangeTypeNotSupported: "HDR not supported",
    VideoCodecTagNotSupported: "Video codec tag not supported",
  };
  return reasonMap[reason] || reason;
};
