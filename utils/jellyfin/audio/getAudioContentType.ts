/**
 * Maps Jellyfin audio container types to MIME types for Chromecast
 */
export const getAudioContentType = (container?: string | null): string => {
  if (!container) return "audio/mpeg";

  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    aac: "audio/aac",
    m4a: "audio/mp4",
    flac: "audio/flac",
    wav: "audio/wav",
    opus: "audio/opus",
    ogg: "audio/ogg",
    wma: "audio/x-ms-wma",
    webm: "audio/webm",
  };

  return map[container.toLowerCase()] ?? "audio/mpeg";
};
