import Combine
import ExpoModulesCore
import SwiftUI
import UIKit

/// One card in the row. A plain value so the SwiftUI layer has no
/// ExpoModulesCore dependency, and an Android view can parse the same JSON.
struct GlassCardItem: Identifiable, Equatable, Decodable {
  let id: String
  let title: String
  let subtitle: String?
  let imageUrl: String?
  /// Watch progress in 0...1; draws the progress bar when > 0.
  let progress: Double
  /// Unwatched movie/episode — draws the corner accent.
  let unwatched: Bool
  /// Remaining episodes on a Series/BoxSet; draws the count badge when > 0.
  let unplayedCount: Int
  /// Faded back because another card in the row is the current one.
  let dimmed: Bool

  private enum CodingKeys: String, CodingKey {
    case id, title, subtitle, imageUrl, progress, unwatched, unplayedCount
    case dimmed
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
    subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
    imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
    progress =
      try container.decodeIfPresent(Double.self, forKey: .progress)
      .map { min(max($0, 0), 1) } ?? 0
    unwatched = try container.decodeIfPresent(Bool.self, forKey: .unwatched) ?? false
    unplayedCount = try container.decodeIfPresent(Int.self, forKey: .unplayedCount) ?? 0
    dimmed = try container.decodeIfPresent(Bool.self, forKey: .dimmed) ?? false
  }
}

/// Card geometry. JS owns it because it also has to reserve the row's height
/// in the React Native layout before the native view measures anything.
struct GlassCardLayout: Equatable, Decodable {
  var cardWidth: Double = 220
  var aspectRatio: Double = 16.0 / 9.0
  var cornerRadius: Double = 14
  var spacing: Double = 10
  /// Leading/trailing inset of the row's content.
  var contentInset: Double = 16
  /// Share of the card the frosted band covers, bottom up. A tall portrait
  /// poster needs a smaller share than a landscape still for the same text.
  var frostFraction: Double = 0.45
  /// Breathing room above/below the cards so the drop shadow isn't clipped.
  /// Sent by JS, which has to reserve the same height in its own layout.
  var verticalPadding: Double = 6

  var cardHeight: Double { cardWidth / aspectRatio }

  init() {}

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    cardWidth = try container.decodeIfPresent(Double.self, forKey: .cardWidth) ?? 220
    aspectRatio =
      try container.decodeIfPresent(Double.self, forKey: .aspectRatio) ?? 16.0 / 9.0
    cornerRadius = try container.decodeIfPresent(Double.self, forKey: .cornerRadius) ?? 14
    spacing = try container.decodeIfPresent(Double.self, forKey: .spacing) ?? 10
    contentInset = try container.decodeIfPresent(Double.self, forKey: .contentInset) ?? 16
    frostFraction =
      try container.decodeIfPresent(Double.self, forKey: .frostFraction) ?? 0.45
    verticalPadding =
      try container.decodeIfPresent(Double.self, forKey: .verticalPadding) ?? 6
    if aspectRatio <= 0 { aspectRatio = 16.0 / 9.0 }
    if cardWidth <= 0 { cardWidth = 220 }
    frostFraction = min(max(frostFraction, 0), 1)
  }

  private enum CodingKeys: String, CodingKey {
    case cardWidth, aspectRatio, cornerRadius, spacing, contentInset
    case frostFraction, verticalPadding
  }
}

/// Wire format of the `payload` prop.
private struct GlassCardRowPayload: Decodable {
  let items: [GlassCardItem]
  let imageHeaders: [String: String]?
  let layout: GlassCardLayout?
  let loadingMore: Bool?
  /// Card to bring into view. Applied when the value changes, so it can't
  /// fight the user's own scrolling on unrelated payload updates.
  let scrollToId: String?
}

/// Observable state so SwiftUI updates in place instead of rebuilding the
/// hosting controller on every prop change.
final class GlassCardRowState: ObservableObject {
  @Published var items: [GlassCardItem] = []
  @Published var imageHeaders: [String: String] = [:]
  @Published var layout = GlassCardLayout()
  @Published var loadingMore = false
  @Published var scrollToId: String?
}

class GlassCardRowExpoView: ExpoView {
  private var hostingController: UIHostingController<GlassCardRowRootView>?
  private let state = GlassCardRowState()

  let onItemPress = EventDispatcher()
  let onItemLongPress = EventDispatcher()
  let onEndReached = EventDispatcher()

  /// Only touched on the main thread; identifies the newest payload.
  private var payloadSequence = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupHostingController()
  }

  private func setupHostingController() {
    let root = GlassCardRowRootView(
      state: state,
      onItemPress: { [weak self] id, index in
        self?.onItemPress(["id": id, "index": index])
      },
      onItemLongPress: { [weak self] id, index in
        self?.onItemLongPress(["id": id, "index": index])
      },
      onEndReached: { [weak self] in
        self?.onEndReached([:])
      }
    )
    let hostingController = UIHostingController(rootView: root)
    hostingController.view.backgroundColor = .clear
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false

    addSubview(hostingController.view)

    NSLayoutConstraint.activate([
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    self.hostingController = hostingController
  }

  /// Reported so the row still occupies the right height if a caller ever
  /// leaves it out of the style; JS normally sets an explicit height.
  override var intrinsicContentSize: CGSize {
    CGSize(
      width: UIView.noIntrinsicMetric,
      height: state.layout.cardHeight + state.layout.verticalPadding * 2
    )
  }

  // MARK: - Props

  /// Decoding is O(list length), and a new page arrives mid-scroll — exactly
  /// when a main-thread stall shows. Decode off-main and publish the result,
  /// dropping it if a newer payload has landed meanwhile.
  func setPayload(_ payload: String) {
    payloadSequence &+= 1
    let sequence = payloadSequence
    guard let data = payload.data(using: .utf8) else { return }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard
        let decoded = try? JSONDecoder().decode(GlassCardRowPayload.self, from: data)
      else { return }
      DispatchQueue.main.async {
        guard let self, sequence == self.payloadSequence else { return }
        self.apply(decoded)
      }
    }
  }

  private func apply(_ decoded: GlassCardRowPayload) {
    if decoded.items != state.items {
      state.items = decoded.items
    }
    let headers = decoded.imageHeaders ?? [:]
    if headers != state.imageHeaders {
      state.imageHeaders = headers
    }
    let layout = decoded.layout ?? GlassCardLayout()
    if layout != state.layout {
      state.layout = layout
      invalidateIntrinsicContentSize()
    }
    let loadingMore = decoded.loadingMore ?? false
    if loadingMore != state.loadingMore {
      state.loadingMore = loadingMore
    }
    if decoded.scrollToId != state.scrollToId {
      state.scrollToId = decoded.scrollToId
    }
  }
}
