import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";

export type PlayMethod = "DirectPlay" | "DirectStream" | "Transcode";

/**
 * How the session is actually being played. Shared by the reports sent to the
 * server and the technical info overlay, so the dashboard and the app never
 * disagree about the same playback.
 */
export function getPlayMethod(
  source: { url?: string | null; mediaSource?: MediaSourceInfo | null },
  offline: boolean,
): PlayMethod {
  // A downloaded item plays from a local file, with no server in the path.
  if (offline) return "DirectPlay";
  const url = source.url ?? "";
  if (url.includes("m3u8") || source.mediaSource?.TranscodingUrl) {
    return "Transcode";
  }
  // Served through the stream endpoint rather than as the original file.
  if (url.includes("/Videos/") && url.includes("/stream")) {
    return "DirectStream";
  }
  return "DirectPlay";
}

/**
 * Extract the `TranscodeReasons` query parameter from a Jellyfin
 * TranscodingUrl into its individual reason strings. Returns an empty
 * array when the URL is missing or carries no reasons.
 */
export function parseTranscodeReasons(
  transcodingUrl: string | null | undefined,
): string[] {
  if (!transcodingUrl) return [];

  try {
    // Parse the TranscodeReasons parameter from the URL
    const url = new URL(transcodingUrl, "http://localhost");
    const reasons = url.searchParams.get("TranscodeReasons");
    if (reasons) {
      return reasons.split(",").filter(Boolean);
    }
  } catch {
    // If URL parsing fails, try regex fallback
    const match = transcodingUrl.match(/TranscodeReasons=([^&]+)/);
    if (match) {
      return match[1].split(",").filter(Boolean);
    }
  }
  return [];
}
