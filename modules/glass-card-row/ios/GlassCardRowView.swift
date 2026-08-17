import CryptoKit
import SwiftUI
import UIKit

// MARK: - Root

/// Entry point hosted by the ExpoView. iPhone/iPad only: the TV home has its
/// own focus-driven rows, and Android falls back to the JS list.
struct GlassCardRowRootView: View {
  @ObservedObject var state: GlassCardRowState
  let onItemPress: (String, Int) -> Void
  let onItemLongPress: (String, Int) -> Void
  let onEndReached: () -> Void

  var body: some View {
    #if os(iOS)
    GlassCardScroller(
      items: state.items,
      headers: state.imageHeaders,
      layout: state.layout,
      loadingMore: state.loadingMore,
      scrollToId: state.scrollToId,
      onItemPress: onItemPress,
      onItemLongPress: onItemLongPress,
      onEndReached: onEndReached
    )
    // The app is dark themed; force dark so the frost renders dark regardless
    // of the system appearance.
    .environment(\.colorScheme, .dark)
    #else
    EmptyView()
    #endif
  }
}

#if os(iOS)

// MARK: - Row

private struct GlassCardScroller: View {
  let items: [GlassCardItem]
  let headers: [String: String]
  let layout: GlassCardLayout
  let loadingMore: Bool
  let scrollToId: String?
  let onItemPress: (String, Int) -> Void
  let onItemLongPress: (String, Int) -> Void
  let onEndReached: () -> Void

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView(.horizontal, showsIndicators: false) {
        // Spacing lives on the cards rather than on the stack so that the gap
        // is part of the identified view: `scrollTo` aligns the *identified*
        // view's leading edge with the viewport, so a bare card would park
        // flush against the screen edge and swallow the row's inset.
        LazyHStack(spacing: 0) {
          ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            GlassCardView(
              item: item,
              headers: headers,
              layout: layout,
              onPress: { onItemPress(item.id, index) },
              onLongPress: { onItemLongPress(item.id, index) }
            )
            .padding(.leading, index == 0 ? layout.contentInset : layout.spacing)
            .padding(.trailing, index == items.count - 1 ? layout.contentInset : 0)
            .id(item.id)
            // Paging is driven from the tail of the row rather than from a
            // scroll offset: the cells are lazy, so "the last few appeared" is
            // exactly "the user scrolled to the end". Re-entrancy is handled in
            // JS, which ignores the event while a page is in flight or the list
            // is exhausted.
            .onAppear {
              if index >= items.count - 3 {
                onEndReached()
              }
            }
          }

          if loadingMore {
            ProgressView()
              .frame(width: 44, height: layout.cardHeight)
              .padding(.horizontal, layout.spacing)
          }
        }
        .padding(.vertical, layout.verticalPadding)
        .modifier(SnapTargetLayout())
      }
      .modifier(SnapToCards())
      .onAppear { scroll(proxy, to: scrollToId, animated: false) }
      .onChange(of: scrollToId) { newValue in
        scroll(proxy, to: newValue, animated: true)
      }
    }
  }

  /// Deferred a runloop tick: the target cell may not exist yet in the lazy
  /// stack on the pass that sets the id.
  private func scroll(_ proxy: ScrollViewProxy, to id: String?, animated: Bool) {
    guard let id, items.contains(where: { $0.id == id }) else { return }
    DispatchQueue.main.async {
      if animated {
        withAnimation(.easeInOut(duration: 0.3)) {
          proxy.scrollTo(id, anchor: .leading)
        }
      } else {
        proxy.scrollTo(id, anchor: .leading)
      }
    }
  }
}

// MARK: - Snapping

/// The row settles on a card rather than drifting to an arbitrary offset, the
/// way the JS list did with `snapToOffsets`. Each card's leading gap is part of
/// its identified view, so the alignment keeps the row's inset.
///
/// iOS 17 introduced the scroll-target API; below that the row scrolls freely,
/// which is the graceful degradation — the alternative is reimplementing the
/// deceleration maths by hand.
private struct SnapTargetLayout: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.scrollTargetLayout()
    } else {
      content
    }
  }
}

private struct SnapToCards: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.scrollTargetBehavior(.viewAligned)
    } else {
      content
    }
  }
}

// MARK: - Card

/// One card. Shared by the row and the grid.
struct GlassCardView: View {
  let item: GlassCardItem
  let headers: [String: String]
  let layout: GlassCardLayout
  let onPress: () -> Void
  let onLongPress: () -> Void

  /// Set when the long press fires so the touch-up doesn't also open the item.
  @State private var longPressFired = false

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: layout.cornerRadius, style: .continuous)
  }

  var body: some View {
    // A Button rather than a tap gesture: `onTapGesture` next to a long press
    // loses the gesture arena to it and never fires, and the button style is
    // what gives the press-down feedback.
    Button {
      if longPressFired {
        longPressFired = false
        return
      }
      onPress()
    } label: {
      card
    }
    .buttonStyle(GlassCardPressStyle())
    .simultaneousGesture(
      LongPressGesture(minimumDuration: 0.4).onEnded { _ in
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        longPressFired = true
        onLongPress()
        // Self-clearing: if the touch-up never reaches the button (the action
        // sheet takes over), the flag must not swallow the next tap.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
          longPressFired = false
        }
      }
    )
  }

  private var card: some View {
    ZStack(alignment: .bottomLeading) {
      RemoteCardImage(urlString: item.imageUrl, headers: headers)
        .frame(width: layout.cardWidth, height: layout.cardHeight)

      frost

      VStack(alignment: .leading, spacing: 1) {
        Text(item.title)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(1)

        if let subtitle = item.subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(.system(size: 11))
            .foregroundColor(.white.opacity(0.7))
            .lineLimit(1)
        }

        if item.progress > 0 {
          progressBar
            .padding(.top, 5)
        }
      }
      .padding(.horizontal, 10)
      .padding(.bottom, 9)
      .frame(width: layout.cardWidth, alignment: .leading)

      badge
    }
    .frame(width: layout.cardWidth, height: layout.cardHeight)
    .clipShape(shape)
    .overlay(shape.strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5))
    .shadow(color: .black.opacity(0.35), radius: 5, x: 0, y: 3)
    .contentShape(Rectangle())
    .opacity(item.dimmed ? 0.5 : 1)
  }

  /// Frosted band fading in over the bottom of the card so the text stays
  /// readable on any artwork: a blur that ramps up from nothing, plus a dark
  /// wash underneath it for contrast against bright frames.
  private var frost: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      Rectangle()
        .fill(.ultraThinMaterial)
        .frame(height: layout.cardHeight * layout.frostFraction)
        .mask(
          LinearGradient(
            colors: [.clear, .black.opacity(0.6), .black],
            startPoint: .top,
            endPoint: .bottom
          )
        )
        .overlay(
          LinearGradient(
            colors: [.clear, .black.opacity(0.45)],
            startPoint: .top,
            endPoint: .bottom
          )
        )
    }
    .allowsHitTesting(false)
  }

  private var progressBar: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        Capsule()
          .fill(Color.white.opacity(0.25))
        Capsule()
          .fill(Color.glassCardAccent)
          .frame(width: max(2, geometry.size.width * item.progress))
      }
    }
    .frame(height: 3)
  }

  /// Mirrors the JS poster's indicators: a count for a series with episodes
  /// left, otherwise a dot for an unwatched movie or episode.
  @ViewBuilder
  private var badge: some View {
    if item.unplayedCount > 0 {
      Text(item.unplayedCount >= 1000 ? "1k+" : String(item.unplayedCount))
        .font(.system(size: 11, weight: .bold))
        .foregroundColor(.white)
        .padding(.horizontal, 5)
        .frame(minWidth: 20, minHeight: 20)
        .background(Color.glassCardAccent, in: Capsule())
        .padding(6)
        .frame(width: layout.cardWidth, height: layout.cardHeight, alignment: .topTrailing)
        .allowsHitTesting(false)
    } else if item.unwatched {
      Circle()
        .fill(Color.glassCardAccent)
        .frame(width: 10, height: 10)
        .overlay(Circle().strokeBorder(Color.white.opacity(0.5), lineWidth: 0.5))
        .padding(8)
        .frame(width: layout.cardWidth, height: layout.cardHeight, alignment: .topTrailing)
        .allowsHitTesting(false)
    }
  }
}

struct GlassCardPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.96 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

extension Color {
  /// Matches the app's purple accent (`bg-purple-600`).
  fileprivate static let glassCardAccent = Color(
    red: 147 / 255, green: 51 / 255, blue: 234 / 255)
}

// MARK: - Image loading

/// Header-aware image loader. The Jellyfin server can sit behind an auth proxy
/// (Cloudflare Access, Pangolin, ...), so every request carries the custom
/// headers passed down from JS.
///
/// Three layers, in order: decoded images in memory, encoded bytes on disk, then
/// the network. The disk layer is what stops a cold launch re-downloading every
/// poster — the JS path gets that from expo-image's own disk cache, so without
/// it the native cards would be the slower of the two on first paint.
final class GlassCardImageLoader {
  static let shared = GlassCardImageLoader()

  /// Decoded images, so scrolling back to a card doesn't decode it again.
  private let cache = NSCache<NSString, UIImage>()
  /// One request per URL: the same poster shows up in several rows at once, and
  /// a card that re-renders mid-flight must not start a second download.
  private var inFlight: [String: Task<UIImage?, Never>] = [:]
  private let lock = NSLock()

  private let directory: URL?
  private let diskQueue = DispatchQueue(label: "glass-card-image-disk", qos: .utility)
  /// Bytes on disk are cheap; this only bounds unbounded growth.
  private let diskBudget = 256 * 1024 * 1024

  private init() {
    cache.totalCostLimit = 64 * 1024 * 1024

    directory = FileManager.default
      .urls(for: .cachesDirectory, in: .userDomainMask)
      .first?
      .appendingPathComponent("GlassCardImages", isDirectory: true)

    if let directory {
      try? FileManager.default.createDirectory(
        at: directory, withIntermediateDirectories: true)
      diskQueue.async { [weak self] in self?.pruneDisk() }
    }
  }

  func cached(_ urlString: String) -> UIImage? {
    cache.object(forKey: urlString as NSString)
  }

  func load(_ urlString: String, headers: [String: String]) async -> UIImage? {
    if let hit = cached(urlString) {
      return hit
    }

    lock.lock()
    if let existing = inFlight[urlString] {
      lock.unlock()
      return await existing.value
    }
    let task = Task<UIImage?, Never> { [weak self] in
      await self?.fetch(urlString, headers: headers) ?? nil
    }
    inFlight[urlString] = task
    lock.unlock()

    let image = await task.value

    lock.lock()
    inFlight[urlString] = nil
    lock.unlock()

    return image
  }

  private func fetch(_ urlString: String, headers: [String: String]) async -> UIImage? {
    if let data = readFromDisk(urlString), let image = UIImage(data: data) {
      store(image, data: data, for: urlString, writeToDisk: false)
      return image
    }

    guard let url = URL(string: urlString) else {
      return nil
    }
    var request = URLRequest(url: url)
    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }
    guard
      let (data, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse,
      (200..<300).contains(http.statusCode),
      let image = UIImage(data: data)
    else {
      return nil
    }

    store(image, data: data, for: urlString, writeToDisk: true)
    return image
  }

  private func store(
    _ image: UIImage, data: Data, for urlString: String, writeToDisk: Bool
  ) {
    cache.setObject(image, forKey: urlString as NSString, cost: data.count)
    guard writeToDisk, let url = fileURL(for: urlString) else { return }
    diskQueue.async {
      try? data.write(to: url, options: .atomic)
    }
  }

  // MARK: - Disk

  /// The URL carries the image tag, so the same URL always means the same
  /// bytes and a plain hash of it is a safe key.
  private func fileURL(for urlString: String) -> URL? {
    guard let directory else { return nil }
    let digest = SHA256.hash(data: Data(urlString.utf8))
    let name = digest.map { String(format: "%02x", $0) }.joined()
    return directory.appendingPathComponent(name)
  }

  private func readFromDisk(_ urlString: String) -> Data? {
    guard let url = fileURL(for: urlString) else { return nil }
    return try? Data(contentsOf: url)
  }

  /// Oldest files go first once the folder passes its budget. Runs once at
  /// startup, off the main thread.
  private func pruneDisk() {
    guard let directory else { return }
    let keys: [URLResourceKey] = [.contentAccessDateKey, .fileSizeKey]
    guard
      let files = try? FileManager.default.contentsOfDirectory(
        at: directory, includingPropertiesForKeys: keys)
    else { return }

    let entries = files.compactMap { url -> (URL, Date, Int)? in
      guard let values = try? url.resourceValues(forKeys: Set(keys)),
        let size = values.fileSize
      else { return nil }
      return (url, values.contentAccessDate ?? .distantPast, size)
    }

    var total = entries.reduce(0) { $0 + $1.2 }
    guard total > diskBudget else { return }

    for entry in entries.sorted(by: { $0.1 < $1.1 }) {
      try? FileManager.default.removeItem(at: entry.0)
      total -= entry.2
      if total <= diskBudget { break }
    }
  }
}

struct RemoteCardImage: View {
  let urlString: String?
  let headers: [String: String]

  @State private var image: UIImage?

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [Color(white: 0.16), Color(white: 0.10)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      if let image {
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .transition(.opacity)
      }
    }
    .task(id: urlString) {
      guard let urlString else {
        image = nil
        return
      }
      if let hit = GlassCardImageLoader.shared.cached(urlString) {
        image = hit
        return
      }
      let loaded = await GlassCardImageLoader.shared.load(urlString, headers: headers)
      if !Task.isCancelled {
        withAnimation(.easeIn(duration: 0.2)) {
          image = loaded
        }
      }
    }
  }
}

#endif
