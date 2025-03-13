import {
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

  protected rank(
    prevIndex: number,
    prevSource: MediaSourceInfo,
    mediaStreams: MediaStream[],
    trackOptions: any,
  ): void {
    if (prevIndex == -1) {
      console.debug(`AutoSet Subtitle - No Stream Set`);
      trackOptions[`Default${this.streamType}StreamIndex`] = -1;
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
      if (stream.Type != this.streamType) continue;

      if (stream.Index == prevIndex) break;

      prevRelIndex += 1;
    }

    let newRelIndex = 0;
    for (const stream of mediaStreams) {
      if (stream.Type != this.streamType) continue;

      let score = 0;

      if (prevStream.Codec == stream.Codec) score += 1;
      if (prevRelIndex == newRelIndex) score += 1;
      if (
        prevStream.DisplayTitle &&
        prevStream.DisplayTitle == stream.DisplayTitle
      )
        score += 2;
      if (
        prevStream.Language &&
        prevStream.Language != "und" &&
        prevStream.Language == stream.Language
      )
        score += 2;

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
    } else {
      console.debug(
        `AutoSet ${this.streamType} - Threshold not met. Using default.`,
      );
    }
  }
}

class SubtitleStreamRanker extends StreamRankerStrategy {
  streamType = "Subtitle";

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

export { StreamRanker, SubtitleStreamRanker, AudioStreamRanker };
