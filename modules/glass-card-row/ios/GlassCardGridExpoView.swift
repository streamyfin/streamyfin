import Combine
import ExpoModulesCore
import SwiftUI
import UIKit

/// Wire format of the grid's `payload` prop. The cards and the card geometry
/// are the same types the row uses — a grid is the same cards in a different
/// container, so it shares the model rather than defining a second one.
private struct GlassCardGridPayload: Decodable {
  let items: [GlassCardItem]
  let imageHeaders: [String: String]?
  let layout: GlassCardLayout?
  let columns: Int?
  let loadingMore: Bool?
  /// Extra room at the top and bottom of the scroll content, for safe areas
  /// and anything JS pins over the grid.
  let contentInsetTop: Double?
  let contentInsetBottom: Double?
  /// Changing this scrolls back to the top — filters changed underneath.
  let scrollToTopToken: String?
}

final class GlassCardGridState: ObservableObject {
  @Published var items: [GlassCardItem] = []
  @Published var imageHeaders: [String: String] = [:]
  @Published var layout = GlassCardLayout()
  @Published var columns = 3
  @Published var loadingMore = false
  @Published var contentInsetTop: Double = 0
  @Published var contentInsetBottom: Double = 0
  @Published var scrollToTopToken: String?
}

class GlassCardGridExpoView: ExpoView {
  private var hostingController: UIHostingController<GlassCardGridRootView>?
  private let state = GlassCardGridState()

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
    let root = GlassCardGridRootView(
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

  // MARK: - Props

  /// Off-main for the same reason as the row, and it matters more here: paging
  /// a library appends to a list that keeps growing, so every page would
  /// otherwise re-decode everything before it, mid-scroll.
  func setPayload(_ payload: String) {
    payloadSequence &+= 1
    let sequence = payloadSequence
    guard let data = payload.data(using: .utf8) else { return }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard
        let decoded = try? JSONDecoder().decode(GlassCardGridPayload.self, from: data)
      else { return }
      DispatchQueue.main.async {
        guard let self, sequence == self.payloadSequence else { return }
        self.apply(decoded)
      }
    }
  }

  private func apply(_ decoded: GlassCardGridPayload) {
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
    }
    let columns = max(decoded.columns ?? 3, 1)
    if columns != state.columns {
      state.columns = columns
    }
    let loadingMore = decoded.loadingMore ?? false
    if loadingMore != state.loadingMore {
      state.loadingMore = loadingMore
    }
    let top = decoded.contentInsetTop ?? 0
    if top != state.contentInsetTop {
      state.contentInsetTop = top
    }
    let bottom = decoded.contentInsetBottom ?? 0
    if bottom != state.contentInsetBottom {
      state.contentInsetBottom = bottom
    }
    if decoded.scrollToTopToken != state.scrollToTopToken {
      state.scrollToTopToken = decoded.scrollToTopToken
    }
  }
}
