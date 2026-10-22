import Foundation

@main
enum AppContainerPathTests {
    static let containers = "/var/mobile/Containers/Data/Application"
    static let old = "\(containers)/0A1B2C3D-0000-4000-8000-000000000001"
    static let now = "\(containers)/9F8E7D6C-0000-4000-8000-000000000002"
    static let documents = URL(fileURLWithPath: "\(now)/Documents", isDirectory: true)

    static func expect(_ stored: String, _ expected: String, documents: URL = documents) {
        let actual = AppContainerPath.current(stored, documents: documents)
        precondition(actual == expected, "\(stored) -> \(actual), expected \(expected)")
    }

    static func main() {
        // A destination stored before an update moved the container follows it.
        expect("\(old)/Documents/show_s01e01.mp4", "\(now)/Documents/show_s01e01.mp4")
        // Music downloads go to Documents, the look-ahead cache two levels down.
        expect("\(old)/Documents/streamyfin-audio/t.flac", "\(now)/Documents/streamyfin-audio/t.flac")
        expect("\(old)/Library/Caches/streamyfin-audio-cache/t.mp3",
               "\(now)/Library/Caches/streamyfin-audio-cache/t.mp3")
        // "/private/var" and "/var" are one directory, on either side.
        expect("/private\(old)/Documents/a.mp4", "\(now)/Documents/a.mp4")
        expect("\(old)/Documents/a.mp4", "\(now)/Documents/a.mp4",
               documents: URL(fileURLWithPath: "/private\(now)/Documents", isDirectory: true))

        // Anything already current, or not in a sibling container, comes back as stored.
        for stored in [
            "\(now)/Documents/a.mp4",
            "/private\(now)/Documents/a.mp4",
            "/var/mobile/Containers/Shared/AppGroup/5E6F7A8B-0000-4000-8000-000000000003/a.mp4",
            "/Users/someone/Documents/a.mp4",
            old,
            "\(old)/",
            "",
            "Documents/a.mp4",
        ] {
            expect(stored, stored)
        }
        // A place that climbs out of the container through ".." stays as stored, and one that
        // only passes through a sibling folder still lands in the container.
        expect("\(old)/Documents/../../../../outside/a.mp4", "\(old)/Documents/../../../../outside/a.mp4")
        expect("\(old)/Documents/x/../a.mp4", "\(now)/Documents/a.mp4")

        // A Documents directory with no directory of containers above it has no sibling to match.
        expect("/x/Documents/a.mp4", "/x/Documents/a.mp4",
               documents: URL(fileURLWithPath: "/Documents", isDirectory: true))

        // The Simulator keeps its containers under the device's data directory.
        let simulator = "/Users/someone/Library/Developer/CoreSimulator/Devices/D1/data/Containers/Data/Application"
        expect("\(simulator)/OLD/Documents/a.mp4", "\(simulator)/NEW/Documents/a.mp4",
               documents: URL(fileURLWithPath: "\(simulator)/NEW/Documents", isDirectory: true))

        print("PASS: a stored destination follows the app's container and nothing else moves")
    }
}
