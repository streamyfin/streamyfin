import Foundation

enum DownloadRemuxer {
  /// Synchronous packet copy. Call from a worker, never the main thread.
  static func remux(
    videoPath: String,
    audioPaths: [String],
    audioTitles: [String],
    audioLanguages: [String],
    outputPath: String,
    onProgress: @escaping (Double) -> Void,
    isCancelled: @escaping () -> Bool
  ) throws {
    try SFDownloadRemuxerBridge.remux(
      videoPath: videoPath,
      audioPaths: audioPaths,
      audioTitles: audioTitles,
      audioLanguages: audioLanguages,
      outputPath: outputPath,
      onProgress: onProgress,
      isCancelled: isCancelled
    )
  }
}
