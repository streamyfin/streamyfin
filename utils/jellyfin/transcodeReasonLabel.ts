import type { TFunction } from "i18next";

/**
 * A server transcode reason (the SDK's TranscodeReason) in the user's words.
 * One literal key per reason, so the i18n check can see every one; a reason
 * the server adds later shows under its own name.
 */
export function transcodeReasonLabel(t: TFunction, reason: string): string {
  switch (reason) {
    case "ContainerNotSupported":
      return t("item_card.download.transcode_reasons.container_not_supported");
    case "VideoCodecNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_codec_not_supported",
      );
    case "AudioCodecNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_codec_not_supported",
      );
    case "SubtitleCodecNotSupported":
      return t(
        "item_card.download.transcode_reasons.subtitle_codec_not_supported",
      );
    case "AudioIsExternal":
      return t("item_card.download.transcode_reasons.audio_is_external");
    case "SecondaryAudioNotSupported":
      return t(
        "item_card.download.transcode_reasons.secondary_audio_not_supported",
      );
    case "VideoProfileNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_profile_not_supported",
      );
    case "VideoLevelNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_level_not_supported",
      );
    case "VideoResolutionNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_resolution_not_supported",
      );
    case "VideoBitDepthNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_bit_depth_not_supported",
      );
    case "VideoFramerateNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_framerate_not_supported",
      );
    case "RefFramesNotSupported":
      return t("item_card.download.transcode_reasons.ref_frames_not_supported");
    case "AnamorphicVideoNotSupported":
      return t(
        "item_card.download.transcode_reasons.anamorphic_video_not_supported",
      );
    case "InterlacedVideoNotSupported":
      return t(
        "item_card.download.transcode_reasons.interlaced_video_not_supported",
      );
    case "AudioChannelsNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_channels_not_supported",
      );
    case "AudioProfileNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_profile_not_supported",
      );
    case "AudioSampleRateNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_sample_rate_not_supported",
      );
    case "AudioBitDepthNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_bit_depth_not_supported",
      );
    case "ContainerBitrateExceedsLimit":
      return t(
        "item_card.download.transcode_reasons.container_bitrate_exceeds_limit",
      );
    case "VideoBitrateNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_bitrate_not_supported",
      );
    case "AudioBitrateNotSupported":
      return t(
        "item_card.download.transcode_reasons.audio_bitrate_not_supported",
      );
    case "UnknownVideoStreamInfo":
      return t(
        "item_card.download.transcode_reasons.unknown_video_stream_info",
      );
    case "UnknownAudioStreamInfo":
      return t(
        "item_card.download.transcode_reasons.unknown_audio_stream_info",
      );
    case "DirectPlayError":
      return t("item_card.download.transcode_reasons.direct_play_error");
    case "VideoRangeTypeNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_range_type_not_supported",
      );
    case "VideoCodecTagNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_codec_tag_not_supported",
      );
    case "StreamCountExceedsLimit":
      return t(
        "item_card.download.transcode_reasons.stream_count_exceeds_limit",
      );
    case "VideoRotationNotSupported":
      return t(
        "item_card.download.transcode_reasons.video_rotation_not_supported",
      );
    default:
      return reason;
  }
}
