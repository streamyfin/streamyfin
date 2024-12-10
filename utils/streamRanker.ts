interface StreamRankerStrategy {
  rankStream(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any,
    isSecondarySubtitle: boolean
  ): void;
}

class SubtitleStreamRanker implements StreamRankerStrategy {
  rankStream(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any,
    isSecondarySubtitle: boolean
  ): void {
    if (prevIndex == -1) {
      console.debug(`AutoSet Subtitle - No Stream Set`);
      if (isSecondarySubtitle) {
        trackOptions.DefaultSecondarySubtitleStreamIndex = -1;
      } else {
        trackOptions.DefaultSubtitleStreamIndex = -1;
      }
      return;
    }

    if (!prevSource.MediaStreams || !mediaStreams) {
      console.debug(`AutoSet Subtitle - No MediaStreams`);
      return;
    }

    this.rank(
      prevIndex,
      prevSource,
      mediaStreams,
      trackOptions,
      isSecondarySubtitle,
      "Subtitle"
    );
  }

  private rank(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any,
    isSecondarySubtitle: boolean,
    streamType: string
  ): void {
    let bestStreamIndex = null;
    let bestStreamScore = 0;
    const prevStream = prevSource.MediaStreams[prevIndex];

    if (!prevStream) {
      console.debug(`AutoSet ${streamType} - No prevStream`);
      return;
    }

    console.debug(
      `AutoSet ${streamType} - Previous was ${prevStream.Index} - ${prevStream.DisplayTitle}`
    );

    let prevRelIndex = 0;
    for (const stream of prevSource.MediaStreams) {
      if (stream.Type != streamType) continue;

      if (stream.Index == prevIndex) break;

      prevRelIndex += 1;
    }

    let newRelIndex = 0;
    for (const stream of mediaStreams) {
      if (stream.Type != streamType) continue;

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
        `AutoSet ${streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`
      );
      if (score > bestStreamScore && score >= 3) {
        bestStreamScore = score;
        bestStreamIndex = stream.Index;
      }

      newRelIndex += 1;
    }

    if (bestStreamIndex != null) {
      console.debug(
        `AutoSet ${streamType} - Using ${bestStreamIndex} score ${bestStreamScore}.`
      );
      trackOptions.DefaultSubtitleStreamIndex = bestStreamIndex;
    } else {
      console.debug(
        `AutoSet ${streamType} - Threshold not met. Using default.`
      );
    }
  }
}

class AudioStreamRanker implements StreamRankerStrategy {
  rankStream(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any
  ): void {
    if (prevIndex == -1) {
      console.debug(`AutoSet Audio - No Stream Set`);
      return;
    }

    if (!prevSource.MediaStreams || !mediaStreams) {
      console.debug(`AutoSet Audio - No MediaStreams`);
      return;
    }

    this.rank(prevIndex, prevSource, mediaStreams, trackOptions, "Audio");
  }

  private rank(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any,
    streamType: string
  ): void {
    let bestStreamIndex = null;
    let bestStreamScore = 0;
    const prevStream = prevSource.MediaStreams[prevIndex];

    if (!prevStream) {
      console.debug(`AutoSet ${streamType} - No prevStream`);
      return;
    }

    console.debug(
      `AutoSet ${streamType} - Previous was ${prevStream.Index} - ${prevStream.DisplayTitle}`
    );

    let prevRelIndex = 0;
    for (const stream of prevSource.MediaStreams) {
      if (stream.Type != streamType) continue;

      if (stream.Index == prevIndex) break;

      prevRelIndex += 1;
    }

    let newRelIndex = 0;
    for (const stream of mediaStreams) {
      if (stream.Type != streamType) continue;

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
        `AutoSet ${streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`
      );
      if (score > bestStreamScore && score >= 3) {
        bestStreamScore = score;
        bestStreamIndex = stream.Index;
      }

      newRelIndex += 1;
    }

    if (bestStreamIndex != null) {
      console.debug(
        `AutoSet ${streamType} - Using ${bestStreamIndex} score ${bestStreamScore}.`
      );
      trackOptions.DefaultAudioStreamIndex = bestStreamIndex;
    } else {
      console.debug(
        `AutoSet ${streamType} - Threshold not met. Using default.`
      );
    }
  }
}

abstract class StreamRanker {
  private strategy: StreamRankerStrategy;
  abstract streamType: string;

  constructor(strategy: StreamRankerStrategy) {
    this.strategy = strategy;
  }

  setStrategy(strategy: StreamRankerStrategy) {
    this.strategy = strategy;
  }

  rankStream(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any,
    streamType: string,
    isSecondarySubtitle: boolean
  ) {
    this.strategy.rankStream(
      prevIndex,
      prevSource,
      mediaStreams,
      trackOptions,
      isSecondarySubtitle
    );
  }

  private rank(
    prevIndex: number,
    prevSource: any,
    mediaStreams: any[],
    trackOptions: any
  ): void {
    let bestStreamIndex = null;
    let bestStreamScore = 0;
    const prevStream = prevSource.MediaStreams[prevIndex];

    if (!prevStream) {
      console.debug(`AutoSet ${this.streamType} - No prevStream`);
      return;
    }

    console.debug(
      `AutoSet ${this.streamType} - Previous was ${prevStream.Index} - ${prevStream.DisplayTitle}`
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
        `AutoSet ${this.streamType} - Score ${score} for ${stream.Index} - ${stream.DisplayTitle}`
      );
      if (score > bestStreamScore && score >= 3) {
        bestStreamScore = score;
        bestStreamIndex = stream.Index;
      }

      newRelIndex += 1;
    }

    if (bestStreamIndex != null) {
      console.debug(
        `AutoSet ${this.streamType} - Using ${bestStreamIndex} score ${bestStreamScore}.`
      );
      trackOptions[`Default${this.streamType}StreamIndex`] = bestStreamIndex;
    } else {
      console.debug(
        `AutoSet ${this.streamType} - Threshold not met. Using default.`
      );
    }
  }
}
