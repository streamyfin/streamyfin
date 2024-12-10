export function rankStreamType(
  prevIndex,
  prevSource,
  mediaStreams,
  trackOptions,
  streamType,
  isSecondarySubtitle
) {
  if (prevIndex == -1) {
    console.debug(`AutoSet ${streamType} - No Stream Set`);
    if (streamType == "Subtitle") {
      if (isSecondarySubtitle) {
        trackOptions.DefaultSecondarySubtitleStreamIndex = -1;
      } else {
        trackOptions.DefaultSubtitleStreamIndex = -1;
      }
    }
    return;
  }

  if (!prevSource.MediaStreams || !mediaStreams) {
    console.debug(`AutoSet ${streamType} - No MediaStreams`);
    return;
  }

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
    if (streamType == "Subtitle") {
      if (isSecondarySubtitle) {
        trackOptions.DefaultSecondarySubtitleStreamIndex = bestStreamIndex;
      } else {
        trackOptions.DefaultSubtitleStreamIndex = bestStreamIndex;
      }
    }
    if (streamType == "Audio") {
      trackOptions.DefaultAudioStreamIndex = bestStreamIndex;
    }
  } else {
    console.debug(`AutoSet ${streamType} - Threshold not met. Using default.`);
  }
}
