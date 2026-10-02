import type {
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import {
  STREAM_MATCH_MIN_SCORE,
  STREAM_MATCH_SCORES,
} from "@/constants/Playback";
import { langEq } from "@/utils/jellyfin/subtitleUtils";

abstract class StreamRankerStrategy {
  abstract streamType: string;

  abstract rankStream(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ): void;

  /**
   * Score how well a candidate stream matches the previously selected stream.
   * Soundtrack titles outrank format changes so commentary cannot replace the
   * main track merely because its codec matches. Subtitle mode scoring overrides
   * this strategy below.
   */
  protected computeScore(
    prevStream: MediaStream,
    stream: MediaStream,
    prevRelIndex: number | undefined,
    newRelIndex: number,
  ): number {
    let score = 0;

    const hasLanguage = !!prevStream.Language && prevStream.Language !== "und";
    if (hasLanguage && !langEq(prevStream.Language, stream.Language)) {
      return 0;
    }
    if (hasLanguage) score += STREAM_MATCH_SCORES.audioLanguage;
    if (
      prevStream.IsHearingImpaired !== undefined &&
      !!prevStream.IsHearingImpaired !== !!stream.IsHearingImpaired
    ) {
      return score;
    }
    if (prevStream.Title && prevStream.Title === stream.Title) {
      score += STREAM_MATCH_SCORES.audioTitle;
    }
    if (
      prevStream.Channels != null &&
      prevStream.Channels === stream.Channels
    ) {
      score += STREAM_MATCH_SCORES.audioChannels;
    }
    if (
      prevStream.ChannelLayout &&
      prevStream.ChannelLayout === stream.ChannelLayout
    ) {
      score += STREAM_MATCH_SCORES.audioChannelLayout;
    }
    if (prevStream.Profile && prevStream.Profile === stream.Profile) {
      score += STREAM_MATCH_SCORES.audioProfile;
    }
    if (prevStream.Codec && prevStream.Codec === stream.Codec) {
      score += STREAM_MATCH_SCORES.codec;
    }
    if (prevRelIndex === newRelIndex) {
      score += STREAM_MATCH_SCORES.position;
    }
    if (
      prevStream.DisplayTitle &&
      prevStream.DisplayTitle === stream.DisplayTitle
    ) {
      score += STREAM_MATCH_SCORES.displayTitle;
    }
    return score;
  }

  protected rank(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ): void {
    if (prevIndex === -1) {
      console.debug("AutoSet Subtitle - No Stream Set");
      trackOptions[`Default${this.streamType}StreamIndex`] = -1;
      // A deliberate "off" selection is a valid match to retain — flag it so
      // callers don't fall back to language preferences / subtitle mode.
      trackOptions.matched = true;
      return;
    }

    if (!prevSource.MediaStreams || !mediaStreams) {
      console.debug(`AutoSet ${this.streamType} - No MediaStreams`);
      return;
    }

    const prevStream = prevSource.MediaStreams.find(
      (stream) => stream.Index === prevIndex,
    );

    if (!prevStream) {
      console.debug(`AutoSet ${this.streamType} - No prevStream`);
      return;
    }

    console.debug(
      `AutoSet ${this.streamType} - Previous was ${prevStream.Index} - ${prevStream.DisplayTitle}`,
    );

    let prevRelIndex = 0;
    for (const stream of prevSource.MediaStreams) {
      if (stream.Type !== this.streamType) {
        continue;
      }

      if (stream.Index === prevIndex) {
        break;
      }

      prevRelIndex += 1;
    }

    const bestStream = this.findMatchingStream(
      prevStream,
      mediaStreams,
      prevRelIndex,
    );
    if (bestStream?.Index != null) {
      console.debug(`AutoSet ${this.streamType} - Using ${bestStream.Index}.`);
      trackOptions[`Default${this.streamType}StreamIndex`] = bestStream.Index;
      trackOptions.matched = true;
    } else {
      console.debug(
        `AutoSet ${this.streamType} - Threshold not met. Using default.`,
      );
    }
  }

  /** Match stored identity without assuming it carries a full previous stream list. */
  findMatchingStream(
    prevStream: MediaStream,
    mediaStreams: MediaStream[],
    prevRelIndex?: number,
    preferSameIndex = false,
  ): MediaStream | undefined {
    let bestStream: MediaStream | undefined;
    let bestStreamScore = 0;
    let newRelIndex = 0;
    for (const stream of mediaStreams) {
      if (stream.Type !== this.streamType || typeof stream.Index !== "number") {
        continue;
      }

      const score = this.computeScore(
        prevStream,
        stream,
        prevRelIndex,
        newRelIndex,
      );

      console.debug(
        `AutoSet ${this.streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`,
      );
      const retainsExactIndex =
        preferSameIndex &&
        score === bestStreamScore &&
        stream.Index === prevStream.Index;
      if (
        score >= STREAM_MATCH_MIN_SCORE &&
        (score > bestStreamScore || retainsExactIndex)
      ) {
        bestStreamScore = score;
        bestStream = stream;
      }

      newRelIndex += 1;
    }

    return bestStream;
  }
}

class SubtitleStreamRanker extends StreamRankerStrategy {
  streamType = "Subtitle";

  /**
   * Retain subtitle language, forced/SDH mode and identity across files.
   * Equivalent modes beat coincidentally matching titles; titles then outrank
   * codec/position. A different language is never matched on metadata alone.
   */
  protected computeScore(
    prevStream: MediaStream,
    stream: MediaStream,
    prevRelIndex: number | undefined,
    newRelIndex: number,
  ): number {
    let score = 0;

    const prevHasLanguage =
      !!prevStream.Language && prevStream.Language !== "und";
    const languageMatches =
      prevHasLanguage && langEq(prevStream.Language, stream.Language);

    if (languageMatches) {
      score += STREAM_MATCH_SCORES.subtitleLanguage;
    } else if (prevHasLanguage) {
      return 0;
    }

    if (
      !!prevStream.IsForced !== !!stream.IsForced ||
      !!prevStream.IsHearingImpaired !== !!stream.IsHearingImpaired
    ) {
      return score;
    }

    if (prevStream.Codec && prevStream.Codec === stream.Codec) {
      score += STREAM_MATCH_SCORES.codec;
    }
    if (prevRelIndex === newRelIndex) {
      score += STREAM_MATCH_SCORES.position;
    }
    if (prevStream.Title && prevStream.Title === stream.Title) {
      score += STREAM_MATCH_SCORES.subtitleTitle;
    }
    if (
      prevStream.DisplayTitle &&
      prevStream.DisplayTitle === stream.DisplayTitle
    ) {
      score += STREAM_MATCH_SCORES.displayTitle;
    }
    if (
      prevStream.IsExternal !== undefined &&
      !!prevStream.IsExternal === !!stream.IsExternal
    ) {
      score += STREAM_MATCH_SCORES.external;
    }

    // Either the language matched, or the previous track had no language (so mode
    // is the primary identity). Normalize the flags to booleans since
    // IsForced / IsHearingImpaired may be undefined.
    if (!!prevStream.IsForced === !!stream.IsForced) {
      score += STREAM_MATCH_SCORES.forced;
    }
    if (!!prevStream.IsHearingImpaired === !!stream.IsHearingImpaired) {
      score += STREAM_MATCH_SCORES.hearingImpaired;
    }

    return score;
  }

  rankStream(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ): void {
    super.rank(prevIndex, prevSource, mediaStreams, trackOptions);
  }
}

class AudioStreamRanker extends StreamRankerStrategy {
  streamType = "Audio";

  rankStream(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ): void {
    super.rank(prevIndex, prevSource, mediaStreams, trackOptions);
  }
}

class StreamRanker {
  private strategy: StreamRankerStrategy;

  constructor(strategy: StreamRankerStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: StreamRankerStrategy) {
    this.strategy = strategy;
  }

  rankStream(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ) {
    this.strategy.rankStream(prevIndex, prevSource, mediaStreams, trackOptions);
  }

  /** Match remembered metadata, retaining an identical video's index only on a tie. */
  findMatchingStream(
    previous: MediaStream,
    streams: MediaStream[],
    preferSameIndex = false,
  ): MediaStream | undefined {
    return this.strategy.findMatchingStream(
      previous,
      streams,
      undefined,
      preferSameIndex,
    );
  }
}

export { AudioStreamRanker, StreamRanker, SubtitleStreamRanker };
