import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  MEDIA_QUALITY_BADGE,
  MEDIA_QUALITY_BADGE_LIMIT,
  MEDIA_QUALITY_BADGE_ORDER,
  UHD_MIN_WIDTH,
} from "@/constants/MediaQuality";

/**
 * Derives the quality tokens ("4K", "Dolby Vision", "Atmos", "CC"…) shown on TV
 * Top Shelf items, mirroring what Apple's own TV app puts on its shelf tiles.
 *
 * Reads the item's primary media source only — that is the source
 * getDefaultPlaySettings would pick, and a badge line is a summary, not a
 * promise about the exact stream that will play. Items with no media source
 * (series, collections, box sets) return an empty array.
 *
 * Not wired into the in-app technical-details components yet; the inline
 * VideoRangeType/Dolby-Vision logic in components/ItemTechnicalDetails.tsx and
 * components/video-player/controls/TechnicalInfoOverlay.tsx could later be
 * folded into this helper.
 */
export function getMediaQualityBadges(item: BaseItemDto): string[] {
  const streams: MediaStream[] =
    item.MediaSources?.[0]?.MediaStreams ?? item.MediaStreams ?? [];

  if (streams.length === 0) return [];

  const badges = new Set<string>();

  const videoStream = streams.find((stream) => stream.Type === "Video");
  if (videoStream) {
    if ((videoStream.Width ?? 0) >= UHD_MIN_WIDTH) {
      badges.add(MEDIA_QUALITY_BADGE.uhd);
    }

    const hdrBadge = getHdrBadge(videoStream);
    if (hdrBadge) badges.add(hdrBadge);
  }

  const audioStreams = streams.filter((stream) => stream.Type === "Audio");
  if (audioStreams.some(isAtmosStream)) {
    badges.add(MEDIA_QUALITY_BADGE.atmos);
  }
  if (audioStreams.some(isAudioDescriptionStream)) {
    badges.add(MEDIA_QUALITY_BADGE.ad);
  }

  const subtitleStreams = streams.filter(
    (stream) => stream.Type === "Subtitle",
  );
  if (subtitleStreams.length > 0) {
    badges.add(MEDIA_QUALITY_BADGE.cc);
  }
  if (subtitleStreams.some(isHearingImpairedStream)) {
    badges.add(MEDIA_QUALITY_BADGE.sdh);
  }

  return MEDIA_QUALITY_BADGE_ORDER.filter((badge) => badges.has(badge)).slice(
    0,
    MEDIA_QUALITY_BADGE_LIMIT,
  );
}

/**
 * At most one HDR token, most specific first. Mirrors the map in
 * TechnicalInfoOverlay.formatVideoRange plus the Dolby Vision detection in
 * ItemTechnicalDetails.tsx (VideoRangeType "DOVI" or a Dv* version field).
 */
function getHdrBadge(videoStream: MediaStream): string | undefined {
  const rangeType = videoStream.VideoRangeType ?? "";

  if (
    rangeType.startsWith("DOVI") ||
    videoStream.DvProfile != null ||
    videoStream.DvVersionMajor != null
  ) {
    return MEDIA_QUALITY_BADGE.dolbyVision;
  }

  if (rangeType === "HDR10Plus") return MEDIA_QUALITY_BADGE.hdr10Plus;
  if (rangeType === "HDR10") return MEDIA_QUALITY_BADGE.hdr10;
  if (rangeType === "HLG") return MEDIA_QUALITY_BADGE.hlg;
  if (videoStream.VideoRange === "HDR") return MEDIA_QUALITY_BADGE.hdr;

  return undefined;
}

function isAtmosStream(stream: MediaStream): boolean {
  return [stream.Profile, stream.DisplayTitle, stream.Title].some((value) =>
    value?.toLowerCase().includes("atmos"),
  );
}

function isHearingImpairedStream(stream: MediaStream): boolean {
  if (stream.IsHearingImpaired) return true;
  return [stream.DisplayTitle, stream.Title].some((value) =>
    value?.toLowerCase().includes("sdh"),
  );
}

/**
 * Jellyfin has no dedicated audio-description flag, so this is best-effort:
 * match an audio track explicitly labelled as a description.
 */
function isAudioDescriptionStream(stream: MediaStream): boolean {
  return [stream.DisplayTitle, stream.Title].some((value) => {
    if (!value) return false;
    return /audio description|\bdescriptive\b|\bAD\b/i.test(value);
  });
}
