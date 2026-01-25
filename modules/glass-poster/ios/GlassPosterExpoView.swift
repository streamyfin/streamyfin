import ExpoModulesCore
import SwiftUI
import UIKit

/// ExpoView wrapper that hosts the SwiftUI GlassPosterView
class GlassPosterExpoView: ExpoView {
  private var hostingController: UIHostingController<GlassPosterView>?
  private var posterView: GlassPosterView

  // Stored dimensions for intrinsic content size
  private var posterWidth: CGFloat = 260
  private var posterAspectRatio: CGFloat = 10.0 / 15.0

  // Event dispatchers
  let onLoad = EventDispatcher()
  let onError = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    self.posterView = GlassPosterView()
    super.init(appContext: appContext)
    setupHostingController()
  }

  private func setupHostingController() {
    let hostingController = UIHostingController(rootView: posterView)
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

  private func updateHostingController() {
    hostingController?.rootView = posterView
  }

  // Override intrinsic content size for proper React Native layout
  override var intrinsicContentSize: CGSize {
    let height = posterWidth / posterAspectRatio
    return CGSize(width: posterWidth, height: height)
  }

  // MARK: - Property Setters

  func setImageUrl(_ url: String?) {
    posterView.imageUrl = url
    updateHostingController()
  }

  func setAspectRatio(_ ratio: Double) {
    posterView.aspectRatio = ratio
    posterAspectRatio = CGFloat(ratio)
    invalidateIntrinsicContentSize()
    updateHostingController()
  }

  func setWidth(_ width: Double) {
    posterView.width = width
    posterWidth = CGFloat(width)
    invalidateIntrinsicContentSize()
    updateHostingController()
  }

  func setCornerRadius(_ radius: Double) {
    posterView.cornerRadius = radius
    updateHostingController()
  }

  func setProgress(_ progress: Double) {
    posterView.progress = progress
    updateHostingController()
  }

  func setShowWatchedIndicator(_ show: Bool) {
    posterView.showWatchedIndicator = show
    updateHostingController()
  }

  func setIsFocused(_ focused: Bool) {
    posterView.isFocused = focused
    updateHostingController()
  }
}
