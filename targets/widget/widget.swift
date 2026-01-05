import SwiftUI
import WidgetKit
import AppIntents
import MediaPlayer

// MARK: - App Intents

struct TogglePlaybackIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Playback"
    static var description = IntentDescription("Play or pause the current track")

    func perform() async throws -> some IntentResult {
        MPRemoteCommandCenter.shared().togglePlayPauseCommand.send()
        return .result()
    }
}

struct NextTrackIntent: AppIntent {
    static var title: LocalizedStringResource = "Next Track"
    static var description = IntentDescription("Skip to next track")

    func perform() async throws -> some IntentResult {
        MPRemoteCommandCenter.shared().nextTrackCommand.send()
        return .result()
    }
}

// MARK: - Data Models

struct NowPlayingData: Codable {
    let title: String
    let artist: String
    let album: String
    let artworkUrl: String?
    let isPlaying: Bool
    let updatedAt: Double
}

struct NowPlayingEntry: TimelineEntry {
    let date: Date
    let title: String
    let artist: String
    let album: String
    let artworkImage: UIImage?  // Store actual image, not URL (AsyncImage doesn't work in widgets)
    let isPlaying: Bool
    let isEmpty: Bool

    static var empty: NowPlayingEntry {
        NowPlayingEntry(
            date: Date(),
            title: "Not Playing",
            artist: "Open Streamyfin to play music",
            album: "",
            artworkImage: nil,
            isPlaying: false,
            isEmpty: true
        )
    }
}

// MARK: - Timeline Provider

struct NowPlayingProvider: TimelineProvider {
    let appGroupId = "group.com.fredrikburmester.streamyfin.widgets"

    func placeholder(in context: Context) -> NowPlayingEntry {
        NowPlayingEntry(
            date: Date(),
            title: "Song Title",
            artist: "Artist Name",
            album: "Album",
            artworkImage: nil,
            isPlaying: true,
            isEmpty: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (NowPlayingEntry) -> Void) {
        let entry = fetchCurrentEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NowPlayingEntry>) -> Void) {
        let entry = fetchCurrentEntry()
        // Use .never policy since we manually refresh via WidgetCenter
        let timeline = Timeline(entries: [entry], policy: .never)
        completion(timeline)
    }

    private func fetchCurrentEntry() -> NowPlayingEntry {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let jsonString = defaults.string(forKey: "nowPlaying"),
              let data = jsonString.data(using: .utf8),
              let nowPlaying = try? JSONDecoder().decode(NowPlayingData.self, from: data) else {
            return .empty
        }

        // Download artwork synchronously (AsyncImage doesn't work in widgets)
        var artworkImage: UIImage? = nil
        if let urlString = nowPlaying.artworkUrl,
           let url = URL(string: urlString),
           let imageData = try? Data(contentsOf: url) {
            artworkImage = UIImage(data: imageData)
        }

        return NowPlayingEntry(
            date: Date(),
            title: nowPlaying.title,
            artist: nowPlaying.artist,
            album: nowPlaying.album,
            artworkImage: artworkImage,
            isPlaying: nowPlaying.isPlaying,
            isEmpty: false
        )
    }
}

// MARK: - Artwork Image View

struct ArtworkView: View {
    let image: UIImage?
    let size: CGFloat

    var body: some View {
        Group {
            if let uiImage = image {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                placeholderView
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var placeholderView: some View {
        ZStack {
            Color(hex: "#2a2a2a")
            Image(systemName: "music.note")
                .font(.system(size: size * 0.4))
                .foregroundColor(.gray)
        }
    }
}

// MARK: - Control Button

struct ControlButton: View {
    let systemName: String
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.15))
            Image(systemName: systemName)
                .font(.system(size: size, weight: .semibold))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Small Widget View

struct SmallWidgetView: View {
    let entry: NowPlayingEntry

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background artwork (blurred)
                if !entry.isEmpty {
                    ArtworkView(image: entry.artworkImage, size: geometry.size.width)
                        .blur(radius: 20)
                        .opacity(0.6)
                }

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    Spacer()

                    // Small artwork
                    if !entry.isEmpty {
                        ArtworkView(image: entry.artworkImage, size: 48)
                            .shadow(radius: 4)
                    } else {
                        Image(systemName: "music.note.house.fill")
                            .font(.system(size: 32))
                            .foregroundColor(Color(hex: "#9333EA"))
                    }

                    Spacer().frame(height: 8)

                    // Track info
                    Text(entry.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(2)

                    Text(entry.artist)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)

                    // Play/Pause button
                    if !entry.isEmpty {
                        Button(intent: TogglePlaybackIntent()) {
                            ControlButton(
                                systemName: entry.isPlaying ? "pause.fill" : "play.fill",
                                size: 14
                            )
                            .frame(width: 32, height: 32)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
        }
        .containerBackground(for: .widget) {
            Color(hex: "#1a1a1a")
        }
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let entry: NowPlayingEntry

    var body: some View {
        HStack(spacing: 16) {
            // Artwork
            ArtworkView(image: entry.artworkImage, size: 100)
                .shadow(radius: 8)

            // Track info
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(2)

                Text(entry.artist)
                    .font(.system(size: 14))
                    .foregroundColor(.white.opacity(0.8))
                    .lineLimit(1)

                if !entry.album.isEmpty {
                    Text(entry.album)
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                        .lineLimit(1)
                }

                Spacer()

                // Playback controls
                if !entry.isEmpty {
                    HStack(spacing: 12) {
                        // Play/Pause button
                        Button(intent: TogglePlaybackIntent()) {
                            ControlButton(
                                systemName: entry.isPlaying ? "pause.fill" : "play.fill",
                                size: 18
                            )
                            .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)

                        // Next button
                        Button(intent: NextTrackIntent()) {
                            ControlButton(systemName: "forward.fill", size: 14)
                                .frame(width: 36, height: 36)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .containerBackground(for: .widget) {
            Color(hex: "#1a1a1a")
        }
    }
}

// MARK: - Widget Configuration

struct StreamyfinNowPlayingWidget: Widget {
    let kind: String = "StreamyfinNowPlayingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NowPlayingProvider()) { entry in
            StreamyfinWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Now Playing")
        .description("See what's currently playing in Streamyfin")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StreamyfinWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: NowPlayingEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Widget Bundle Entry Point

@main
struct StreamyfinWidgets: WidgetBundle {
    var body: some Widget {
        StreamyfinNowPlayingWidget()
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Preview

#Preview(as: .systemSmall) {
    StreamyfinNowPlayingWidget()
} timeline: {
    NowPlayingEntry(
        date: Date(),
        title: "Bohemian Rhapsody",
        artist: "Queen",
        album: "A Night at the Opera",
        artworkImage: nil,
        isPlaying: true,
        isEmpty: false
    )
    NowPlayingEntry.empty
}

#Preview(as: .systemMedium) {
    StreamyfinNowPlayingWidget()
} timeline: {
    NowPlayingEntry(
        date: Date(),
        title: "Bohemian Rhapsody",
        artist: "Queen",
        album: "A Night at the Opera",
        artworkImage: nil,
        isPlaying: true,
        isEmpty: false
    )
    NowPlayingEntry.empty
}
