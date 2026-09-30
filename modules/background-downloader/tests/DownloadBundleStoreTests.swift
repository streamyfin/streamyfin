import Foundation

/// Run with swiftc alongside DownloadTaskStore.swift and DownloadBundleStore.swift.
/// Keep this outside ios/: the pod compiles every Swift file below that directory.
@main
enum DownloadBundleStoreTests {
  static func main() throws {
    let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appendingPathComponent(".download-bundle-store-tests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let firstDocuments = root.appendingPathComponent("first/Documents")
    let movedDocuments = root.appendingPathComponent("relocated/Documents")
    try FileManager.default.createDirectory(at: firstDocuments, withIntermediateDirectories: true)
    let store = DownloadBundleStore(documents: firstDocuments)
    let plan = DownloadBundlePlan(
      videoUrl: "https://example.invalid/video.mp4",
      audioUrls: ["https://example.invalid/audio.mp4"],
      destinationPath: "offline/movie.mkv",
      audioTitles: ["English", "French"], audioLanguages: ["eng", "fra"]
    )
    try plan.validate()
    var primaryOnly = plan
    primaryOnly.audioUrls = []
    primaryOnly.audioTitles = ["English"]
    primaryOnly.audioLanguages = ["eng"]
    try primaryOnly.validate()
    let job = DownloadBundleJob(
      id: UUID().uuidString, taskId: -2, plan: plan,
      metadata: DownloadActivityMetadata(
        itemId: "movie", title: "Movie", subtitle: "", estimatedTotalBytes: 100, labels: [:]
      ), requiresHeaders: true
    )

    let relative = try store.relativeDestination(firstDocuments.appendingPathComponent(plan.destinationPath).path)
    precondition(relative == plan.destinationPath)
    do {
      _ = try store.relativeDestination(root.appendingPathComponent("outside.mkv").path)
      preconditionFailure("An outside destination was accepted")
    } catch DownloadBundleFailure.invalidDestination {}

    try store.save(job)
    let persisted = store.load()
    precondition(persisted.count == 1 && persisted[0].requiresHeaders)
    precondition(persisted[0].plan.destinationPath == "offline/movie.mkv")
    let manifestURL = firstDocuments.appendingPathComponent(".multi-track-downloads/\(job.id).json")
    let manifest = try String(contentsOf: manifestURL, encoding: .utf8)
    precondition(!manifest.contains(firstDocuments.path))
    precondition(!manifest.contains("\"headers\""))

    try FileManager.default.createDirectory(at: store.source(job, 0).deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("partial".utf8).write(to: store.source(job, 0))
    precondition(store.completedSize(job, 0) == 0, "Unmarked files must not count as complete")
    precondition(store.workingBytes(job) == 7, "Disk accounting includes unmarked source files")
    let source = firstDocuments.appendingPathComponent("incoming")
    try Data("complete source".utf8).write(to: source)
    try store.acceptSource(source, job: job, index: 0)
    precondition(store.completedSize(job, 0) == 15)
    try Data("truncated".utf8).write(to: store.source(job, 0))
    precondition(store.completedSize(job, 0) == 0, "Marker length must match the actual source")
    try Data("complete source".utf8).write(to: store.source(job, 0))

    try FileManager.default.createDirectory(at: movedDocuments.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.moveItem(at: firstDocuments, to: movedDocuments)
    let relocated = DownloadBundleStore(documents: movedDocuments)
    let restored = relocated.load()[0]
    precondition(relocated.completedSize(restored, 0) == 15)
    precondition(relocated.destination(restored).path.hasPrefix(movedDocuments.path))
    precondition(relocated.completedSize(restored, 1) == 0)

    try Data("existing final must survive cancellation".utf8).write(to: relocated.destination(restored))
    try Data("partial mux".utf8).write(to: relocated.output(restored))
    precondition(relocated.workingBytes(restored) == 28, "Disk accounting includes sources, markers, and partial mux")
    relocated.cleanInputs(restored)
    relocated.remove(restored)
    precondition(relocated.load().isEmpty)
    precondition(FileManager.default.fileExists(atPath: relocated.destination(restored).path))
    precondition(!FileManager.default.fileExists(atPath: relocated.source(restored, 0).path))
    precondition(!FileManager.default.fileExists(atPath: relocated.output(restored).path))
    precondition(relocated.workingBytes(restored) == 0, "Disk accounting excludes the final destination")
    print("DownloadBundleStore: completion, relocation, credentials, and cancellation checks passed")
  }
}
