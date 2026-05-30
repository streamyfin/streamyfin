import ExpoModulesCore
import SwiftUI

// React Native tvOS notification names for controlling gesture handler behavior.
// These match the constants in RCTTVRemoteHandler.h and are what make keyboard
// input actually reach the native search field on tvOS.
private let RCTTVDisableGestureHandlersCancelTouchesNotification = Notification.Name(
  "RCTTVDisableGestureHandlersCancelTouchesNotification")
private let RCTTVEnableGestureHandlersCancelTouchesNotification = Notification.Name(
  "RCTTVEnableGestureHandlersCancelTouchesNotification")

#if os(tvOS)

  /// Holds the search state. ObservableObject so we can update placeholder/text
  /// without recreating the SwiftUI hierarchy.
  class TvSearchViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var placeholder: String = "Search..."
    @Published var accentColor: Color = .white
    var onSearch: ((String) -> Void)?
  }

  /// SwiftUI content hosting `.searchable`. This mirrors expo-tvos-search's
  /// structure — `.searchable` attached inside a `NavigationView` (REQUIRED:
  /// `.searchable` only renders a search bar in a navigation context) — but with
  /// the results grid REMOVED. The body is just transparent filler so the search
  /// field + native grid keyboard render; results are drawn by React Native
  /// below this native view instead.
  struct TvSearchContentView: View {
    @ObservedObject var viewModel: TvSearchViewModel

    var body: some View {
      NavigationView {
        // Transparent filler gives `.searchable` something to attach to and
        // lets the native search bar/keyboard own the space.
        Color.clear
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .searchable(text: $viewModel.searchText, prompt: viewModel.placeholder)
          .onChange(of: viewModel.searchText) { newValue in
            viewModel.onSearch?(newValue)
          }
      }
      .tint(viewModel.accentColor)
    }
  }

  class TvSearchView: ExpoView {
    private var hostingController: UIHostingController<TvSearchContentView>?
    private let viewModel = TvSearchViewModel()
    private var gestureHandlersDisabled = false
    private var disabledGestureRecognizers: [UIGestureRecognizer] = []

    let onChangeText = EventDispatcher()

    required init(appContext: AppContext? = nil) {
      super.init(appContext: appContext)
      setupView()
    }

    deinit {
      NotificationCenter.default.removeObserver(self)
      hostingController?.willMove(toParent: nil)
      hostingController?.removeFromParent()
      #if !targetEnvironment(simulator)
        enableParentGestureRecognizers()
      #endif
      if gestureHandlersDisabled {
        NotificationCenter.default.post(
          name: RCTTVEnableGestureHandlersCancelTouchesNotification, object: nil)
      }
    }

    func setPlaceholder(_ value: String) {
      viewModel.placeholder = value
    }

    private func setupView() {
      viewModel.onSearch = { [weak self] query in
        self?.onChangeText(["text": query])
      }

      let controller = UIHostingController(rootView: TvSearchContentView(viewModel: viewModel))
      controller.view.backgroundColor = .clear
      hostingController = controller

      addSubview(controller.view)
      controller.view.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        controller.view.topAnchor.constraint(equalTo: topAnchor),
        controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
        controller.view.trailingAnchor.constraint(equalTo: trailingAnchor),
      ])

      if let parentVC = parentViewController() {
        parentVC.addChild(controller)
        controller.didMove(toParent: parentVC)
      }

      // Detect when the search keyboard becomes active so we can release RN's
      // remote gesture handling (otherwise keystrokes never reach the field).
      NotificationCenter.default.addObserver(
        self, selector: #selector(handleTextFieldDidBeginEditing),
        name: UITextField.textDidBeginEditingNotification, object: nil)
      NotificationCenter.default.addObserver(
        self, selector: #selector(handleTextFieldDidEndEditing),
        name: UITextField.textDidEndEditingNotification, object: nil)
    }

    // MARK: - View controller containment

    /// SwiftUI needs proper appearance lifecycle events for `.searchable` to
    /// register with tvOS's focus system, so we manage child VC containment as
    /// the view enters/leaves the window.
    override func didMoveToWindow() {
      super.didMoveToWindow()
      guard let controller = hostingController else { return }
      if window != nil {
        if controller.parent == nil, let parentVC = parentViewController() {
          parentVC.addChild(controller)
          controller.didMove(toParent: parentVC)
        }
      } else {
        controller.willMove(toParent: nil)
        controller.removeFromParent()
      }
    }

    private func parentViewController() -> UIViewController? {
      var responder: UIResponder? = self
      while let next = responder?.next {
        if let vc = next as? UIViewController { return vc }
        responder = next
      }
      return nil
    }

    // MARK: - Keyboard / gesture handling

    @objc private func handleTextFieldDidBeginEditing(_ notification: Notification) {
      guard let textField = notification.object as? UITextField,
        let hostingView = hostingController?.view,
        textField.isDescendant(of: hostingView)
      else { return }

      guard !gestureHandlersDisabled else { return }
      gestureHandlersDisabled = true

      NotificationCenter.default.post(
        name: RCTTVDisableGestureHandlersCancelTouchesNotification, object: nil)

      #if !targetEnvironment(simulator)
        disableParentGestureRecognizers()
      #endif
    }

    @objc private func handleTextFieldDidEndEditing(_ notification: Notification) {
      guard let textField = notification.object as? UITextField,
        let hostingView = hostingController?.view,
        textField.isDescendant(of: hostingView)
      else { return }

      guard gestureHandlersDisabled else { return }
      gestureHandlersDisabled = false

      #if !targetEnvironment(simulator)
        enableParentGestureRecognizers()
      #endif

      NotificationCenter.default.post(
        name: RCTTVEnableGestureHandlersCancelTouchesNotification, object: nil)
    }

    private func disableParentGestureRecognizers() {
      disabledGestureRecognizers.removeAll()
      var currentView: UIView? = superview
      while let view = currentView {
        for recognizer in view.gestureRecognizers ?? [] {
          let isTapOrPress =
            recognizer is UITapGestureRecognizer || recognizer is UILongPressGestureRecognizer
          if isTapOrPress && recognizer.isEnabled {
            recognizer.isEnabled = false
            disabledGestureRecognizers.append(recognizer)
          }
        }
        currentView = view.superview
      }
    }

    private func enableParentGestureRecognizers() {
      for recognizer in disabledGestureRecognizers {
        recognizer.isEnabled = true
      }
      disabledGestureRecognizers.removeAll()
    }
  }

#else

  // Fallback for non-tvOS platforms (iOS).
  class TvSearchView: ExpoView {
    let onChangeText = EventDispatcher()
    func setPlaceholder(_ value: String) {}
  }

#endif
