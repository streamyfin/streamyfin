import Foundation

@main
enum RemuxMediaTest {
  static func main() {
    let arguments = Array(CommandLine.arguments.dropFirst())
    guard arguments.count >= 3 else { fatalError("MODE OUTPUT INPUT [INPUT...]") }
    let mode = arguments[0]
    let output = arguments[1]
    let paths = Array(arguments.dropFirst(2))
    var progress = 0.0
    do {
      try DownloadRemuxer.remux(
        videoPath: paths[0],
        audioPaths: Array(paths.dropFirst()),
        audioTitles: mode == "metadata" ? [] : Array(["Primary 🎧", "French", "Japanese"].prefix(paths.count)),
        audioLanguages: Array(["eng", "fra", "jpn"].prefix(paths.count)),
        outputPath: output,
        onProgress: {
          precondition($0 >= progress && $0 >= 0 && $0 <= 1, "Invalid progress")
          progress = $0
        },
        isCancelled: { mode == "cancel" && progress >= 0.1 }
      )
      precondition(progress == 1)
      print("complete")
    } catch {
      fputs("\(error)\n", stderr)
      exit(1)
    }
  }
}
