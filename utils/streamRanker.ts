import type {
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";

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
   * Overridable so subtitle ranking can add mode (forced / hearing-impaired)
   * awareness without changing audio behavior.
   */
  protected computeScore(
    prevStream: MediaStream,
    stream: MediaStream,
    prevRelIndex: number,
    newRelIndex: number,
  ): number {
    let score = 0;

    if (prevStream.Codec === stream.Codec) {
      score += 1;
    }
    if (prevRelIndex === newRelIndex) {
      score += 1;
    }
    if (
      prevStream.DisplayTitle &&
      prevStream.DisplayTitle === stream.DisplayTitle
    ) {
      score += 2;
    }
    if (
      prevStream.Language &&
      prevStream.Language !== "und" &&
      prevStream.Language === stream.Language
    ) {
      score += 2;
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

    let bestStreamIndex = null;
    let bestStreamScore = 0;

    const prevStream = prevSource.MediaStreams[prevIndex];

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

    let newRelIndex = 0;
    for (const stream of mediaStreams) {
      if (stream.Type !== this.streamType) {
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
      if (score > bestStreamScore && score >= 3) {
        bestStreamScore = score;
        bestStreamIndex = stream.Index;
      }

      newRelIndex += 1;
    }

    if (bestStreamIndex != null) {
      console.debug(
        `AutoSet ${this.streamType} - Using ${bestStreamIndex} score ${bestStreamScore}.`,
      );
      trackOptions[`Default${this.streamType}StreamIndex`] = bestStreamIndex;
      trackOptions.matched = true;
    } else {
      console.debug(
        `AutoSet ${this.streamType} - Threshold not met. Using default.`,
      );
    }
  }
}

class SubtitleStreamRanker extends StreamRankerStrategy {
  streamType = "Subtitle";

  /**
   * Subtitle scoring that retains both language and mode across episodes.
   *
   * - When the previous track has a language: a language match is weighted high
   *   (+3) so it clears the threshold even when codec / title / position differ,
   *   and mode (forced / hearing-impaired) acts as a tiebreaker among
   *   same-language tracks. Different-language candidates get no language or mode
   *   points, so they can never be selected on mode alone (no cross-language
   *   hijack).
   * - When the previous track has NO usable language (common for SRT/SUBRIP):
   *   language can't help, so mode (forced / hearing-impaired) + codec + relative
   *   position become the identity signal. Without this, unlabeled subtitles
   *   score only codec+relIndex (≤2) and the selection is silently lost.
   */
  protected computeScore(
    prevStream: MediaStream,
    stream: MediaStream,
    prevRelIndex: number,
    newRelIndex: number,
  ): number {
    let score = 0;

    if (prevStream.Codec === stream.Codec) {
      score += 1;
    }
    if (prevRelIndex === newRelIndex) {
      score += 1;
    }
    if (
      prevStream.DisplayTitle &&
      prevStream.DisplayTitle === stream.DisplayTitle
    ) {
      score += 2;
    }

    const prevHasLanguage =
      !!prevStream.Language && prevStream.Language !== "und";
    const languageMatches =
      prevHasLanguage && prevStream.Language === stream.Language;

    if (languageMatches) {
      score += 3;
    } else if (prevHasLanguage) {
      // Previous track had a language but this candidate's differs — do not award
      // mode points, so a different language is never matched on mode alone.
      return score;
    }

    // Either the language matched, or the previous track had no language (so mode
    // is the primary identity). Normalize the flags to booleans since
    // IsForced / IsHearingImpaired may be undefined.
    if (!!prevStream.IsForced === !!stream.IsForced) {
      score += 2;
    }
    if (!!prevStream.IsHearingImpaired === !!stream.IsHearingImpaired) {
      score += 1;
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
}

export { AudioStreamRanker, StreamRanker, SubtitleStreamRanker };
