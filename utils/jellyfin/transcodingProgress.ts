import type {
  SessionInfoDto,
  TranscodingInfo,
} from "@jellyfin/sdk/lib/generated-client";

/** What the stats overlay prints about a running transcode, already formatted. */
export type TranscodingProgress = {
  /** How much of the item the server has transcoded, as "42.3". */
  percent?: string;
  /** The server's encoding speed in frames per second, as "61". */
  fps?: string;
  /** The hardware acceleration in use, when the server names one. */
  hardware?: string;
};

/**
 * The transcode the server is running for this device, out of a
 * `GET /Sessions?deviceId=` answer. A device can hold more than one session
 * (a stale one that has not expired yet), so the one that transcodes wins.
 */
export const pickTranscodingInfo = (
  sessions: unknown,
): TranscodingInfo | null => {
  // A reverse proxy can answer this route with a non-array body (an HTML
  // error page, an error object) that axios passes through as-is.
  if (!Array.isArray(sessions)) return null;
  const session = (sessions as SessionInfoDto[]).find(
    (s) => s?.TranscodingInfo,
  );
  return session?.TranscodingInfo ?? null;
};

export const describeTranscodingProgress = (
  info: TranscodingInfo | null | undefined,
): TranscodingProgress | null => {
  if (!info) return null;

  const progress: TranscodingProgress = {};
  // 0 is a real answer here: the transcode has started and nothing is done.
  if (typeof info.CompletionPercentage === "number") {
    progress.percent = info.CompletionPercentage.toFixed(1);
  }
  // The server reports no speed, or 0, when the video is copied and only the
  // audio is transcoded. The encoder says nothing about that case either.
  if (!info.IsVideoDirect) {
    if (info.Framerate) progress.fps = Math.round(info.Framerate).toString();
    // "none" is not printed: the server answers it to every user who is not
    // an administrator, whatever it is really using, so it only ever means
    // "not told".
    if (
      info.HardwareAccelerationType &&
      info.HardwareAccelerationType !== "none"
    ) {
      progress.hardware = info.HardwareAccelerationType;
    }
  }

  return Object.keys(progress).length > 0 ? progress : null;
};
