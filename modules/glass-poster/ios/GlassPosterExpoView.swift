import ExpoModulesCore
import SwiftUI
import UIKit
import Combine

/// Observable state that SwiftUI can watch for changes without rebuilding the entire view
class GlassPosterState: ObservableObject {
  @Published var imageUrl: String? = nil
  @Published var aspectRatio: Double = 10.0 / 15.0
  @Published var cornerRadius: Double = 24
  @Published var progress: Double = 0
  @Published var showWatchedIndicator: Bool = false
  @Published var isFocused: Bool = false
  @Published var width: Double = 260
}

/// ExpoView wrapper that hosts the SwiftUI GlassPosterView
class GlassPosterExpoView: ExpoView {
  private var hostingController: UIHostingController<GlassPosterViewWrapper>?
  private let state = GlassPosterState()

  // Stored dimensions for intrinsic content size
  private var posterWidth: CGFloat = 260
  private var posterAspectRatio: CGFloat = 10.0 / 15.0

  // Event dispatchers
  let onLoad = EventDispatcher()
  let onError = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupHostingController()
  }

  private func setupHostingController() {
    let wrapper = GlassPosterViewWrapper(state: state)
    let hostingController = UIHostingController(rootView: wrapper)
    hostingController.view.backgroundColor = .clear
    hostingController.view.translatesAutoresizingMaskIntoConstraints = false

    addSubview(hostingController.view)

    NSLayoutConstraint.activate([
      hostingController.view.topAnchor.constraint(equalTo: topAnchor),
      hostingController.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingController.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingController.view.bottomAnchor.constraint(equalTo: bottomAnchor)
    ])

    self.hostingController = hostingController
  }

  // Override intrinsic content size for proper React Native layout
  override var intrinsicContentSize: CGSize {
    let height = posterWidth / posterAspectRatio
    return CGSize(width: posterWidth, height: height)
  }

  // MARK: - Property Setters
  // These now update the observable state object directly.
  // SwiftUI observes state changes and only re-renders affected views.

  func setImageUrl(_ url: String?) {
    state.imageUrl = url
  }

  func setAspectRatio(_ ratio: Double) {
    state.aspectRatio = ratio
    posterAspectRatio = CGFloat(ratio)
    invalidateIntrinsicContentSize()
  }

  func setWidth(_ width: Double) {
    state.width = width
    posterWidth = CGFloat(width)
    invalidateIntrinsicContentSize()
  }

  func setCornerRadius(_ radius: Double) {
    state.cornerRadius = radius
  }

  func setProgress(_ progress: Double) {
    state.progress = progress
  }

  func setShowWatchedIndicator(_ show: Bool) {
    state.showWatchedIndicator = show
  }

  func setIsFocused(_ focused: Bool) {
    state.isFocused = focused
  }
}
