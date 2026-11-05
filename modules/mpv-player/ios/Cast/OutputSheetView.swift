#if os(iOS) && !targetEnvironment(macCatalyst)
import AVKit
import SwiftUI

// The output sheet's drawing: it follows the controller's state and hands every tap back to it. The same
// sheet as OutputSheet.kt.

private let accent = Color(red: 147 / 255, green: 51 / 255, blue: 233 / 255)
private let sheetColor = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
private let rowColor = Color.white.opacity(0.05)
private let selectedRowColor = Color.white.opacity(0.12)
private let captionColor = Color.white.opacity(0.6)
private let failureColor = Color(red: 1, green: 105 / 255, blue: 97 / 255)

/// Side by side at the usual text sizes; one above the other at the accessibility ones, where a row has no
/// width left for its texts.
private func rowLayout(_ size: DynamicTypeSize, spacing: CGFloat) -> AnyLayout {
  size.isAccessibilitySize
    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: spacing))
}

private func nameLines(_ size: DynamicTypeSize) -> Int {
  size.isAccessibilitySize ? 4 : 2
}

/// The controller's state for SwiftUI.
final class OutputSheetStore: ObservableObject {
  @Published private(set) var state: OutputSheetState

  init(controller: OutputSheetController) {
    state = controller.state
    controller.onState = { [weak self] in self?.state = $0 }
  }
}

struct OutputSheetView: View {
  @ObservedObject var store: OutputSheetStore
  let strings: OutputPickerStrings
  let controller: OutputSheetController

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        switch store.state {
        case let .list(rows):
          OutputListView(rows: rows, strings: strings, controller: controller)
        case let .connected(panel):
          ConnectedPanelView(panel: panel, strings: strings, controller: controller)
        }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 16)
    }
    // A popover takes the ideal width; a sheet, the window's.
    .frame(idealWidth: RemoteTargetConstants.popoverWidth, maxWidth: .infinity)
    .background(sheetColor.ignoresSafeArea())
    .foregroundStyle(.white)
    .preferredColorScheme(.dark)
  }
}

private struct OutputListView: View {
  let rows: [OutputRow]
  let strings: OutputPickerStrings
  let controller: OutputSheetController

  var body: some View {
    Text(strings.get("title"))
      .font(.title3.weight(.bold))
      .padding(.bottom, 6)
      .accessibilityAddTraits(.isHeader)
    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
      switch row {
      case let .thisDevice(kind, playing):
        SheetRow(
          icon: kind == .tablet ? "ipad" : "iphone",
          title: strings.get(kind == .tablet ? "thisTablet" : "thisPhone"),
          caption: playing.map { _ in strings.get("playing") },
          action: { controller.tap(row) }
        )
      case let .device(_, name, videoOut, status):
        DeviceRowView(row: row, name: name, videoOut: videoOut, status: status, strings: strings, controller: controller)
      case let .airPlay(activeRoute):
        // The system picker's own button takes the tap: AirPlay routes are not listed by any API.
        SheetRow(icon: "airplayvideo", title: strings.get("airPlay"), caption: activeRoute ?? strings.get("airPlayCaption"))
          .overlay(AirPlayPickerButton())
      case let .status(status):
        StatusRowView(row: row, status: status, strings: strings, controller: controller)
      }
    }
  }
}

private struct DeviceRowView: View {
  let row: OutputRow
  let name: String
  let videoOut: Bool
  let status: DeviceStatus
  let strings: OutputPickerStrings
  let controller: OutputSheetController

  var body: some View {
    SheetRow(
      icon: videoOut ? "tv" : "hifispeaker",
      title: name,
      caption: caption,
      captionStyle: isFailed ? failureColor : captionColor,
      selected: status == .connected,
      action: { controller.tap(row) }
    ) {
      switch status {
      case .connecting:
        ProgressView().tint(.white)
        Button(strings.get("cancel")) { controller.cancel() }
          .foregroundStyle(accent)
      case .connected:
        Image(systemName: "checkmark").foregroundStyle(accent)
      default:
        EmptyView()
      }
    }
    // Cancel is a button inside the row's own, which VoiceOver reads as one element: the row offers it as an action.
    .modifier(CancelAction(label: status == .connecting ? strings.get("cancel") : nil, cancel: controller.cancel))
  }

  private var isFailed: Bool {
    if case .failed = status { return true }
    return false
  }

  private var caption: String {
    switch status {
    case .idle: return strings.get("castCaption")
    case .connecting: return strings.get("connecting")
    case .connected: return strings.get("connected")
    case let .failed(cause): return strings.cause(cause)
    }
  }
}

private struct StatusRowView: View {
  let row: OutputRow
  let status: SheetStatus
  let strings: OutputPickerStrings
  let controller: OutputSheetController

  var body: some View {
    HStack(spacing: 12) {
      if status == .searching {
        ProgressView().tint(captionColor)
      }
      Text(strings.get(key))
        .font(.subheadline)
        .foregroundStyle(captionColor)
        .frame(maxWidth: .infinity, alignment: .leading)
      if status == .playServicesMissing || status == .playServicesUpdate {
        Button(strings.get("playServicesAction")) { controller.tap(row) }
          .foregroundStyle(accent)
      }
    }
    .padding(.horizontal, 4)
    .padding(.vertical, 10)
  }

  private var key: String {
    switch status {
    case .searching: return "searching"
    case .noDevices: return "noDevices"
    case .playServicesMissing: return "playServicesMissing"
    case .playServicesUpdate: return "playServicesUpdate"
    }
  }
}

private struct ConnectedPanelView: View {
  let panel: ConnectedPanel
  let strings: OutputPickerStrings
  let controller: OutputSheetController
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let header = rowLayout(typeSize, spacing: 14)
    header {
      Image(systemName: panel.videoOut ? "tv" : "hifispeaker")
        .font(.title2)
        .foregroundStyle(accent)
        .frame(width: 32)
      VStack(alignment: .leading, spacing: 2) {
        Text(panel.target.name)
          .font(.title3.weight(.bold))
          .lineLimit(nameLines(typeSize))
        Text(strings.get(panel.reconnecting ? "reconnecting" : "connected"))
          .font(.footnote)
          .foregroundStyle(captionColor)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button(strings.get("change")) { controller.change() }
        .foregroundStyle(accent)
        .fixedSize()
    }
    if panel.showsVolume {
      VolumeRowView(panel: panel, strings: strings, controller: controller)
    }
    if panel.canStop {
      SheetRow(
        icon: "appletvremote.gen4.fill", title: strings.get("remote"), caption: panel.receiverTitle,
        action: { controller.remote() }
      )
    }
    SheetRow(
      icon: panel.canStop ? "stop.fill" : "xmark",
      title: strings.get(panel.canStop ? "stopPlayback" : "disconnect"),
      caption: nil,
      action: { controller.stop() }
    )
  }
}

private struct VolumeRowView: View {
  let panel: ConnectedPanel
  let strings: OutputPickerStrings
  let controller: OutputSheetController
  @State private var dragged: Double?

  var body: some View {
    let level = panel.volume ?? 0
    HStack(spacing: 12) {
      Button {
        controller.toggleMute()
      } label: {
        Image(systemName: panel.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
          .frame(width: 28, height: 28)
      }
      .disabled(!panel.canMute)
      .accessibilityLabel(strings.get(panel.muted ? "unmute" : "mute"))
      Slider(
        value: Binding(
          get: { level },
          set: { value in
            dragged = value
            controller.dragVolume(value)
          }
        ),
        in: 0...1
      ) { editing in
        if !editing, let value = dragged {
          controller.releaseVolume(value)
          dragged = nil
        }
      }
      .tint(accent)
      .disabled(!panel.canSetVolume)
      .accessibilityLabel(strings.get("volume"))
      // Wide enough for "100" at the default size, so the slider holds still while it moves.
      Text("\(Int((level * 100).rounded()))")
        .font(.subheadline.monospacedDigit())
        .frame(minWidth: 36, alignment: .trailing)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(RoundedRectangle(cornerRadius: 10).fill(rowColor))
  }
}

private struct SheetRow<Trailing: View>: View {
  let icon: String
  let title: String
  let caption: String?
  var captionStyle = captionColor
  var selected = false
  var action: (() -> Void)?
  @ViewBuilder var trailing: () -> Trailing
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    if let action {
      Button(action: action) { content }
        .buttonStyle(.plain)
    } else {
      content
    }
  }

  private var content: some View {
    let layout = rowLayout(typeSize, spacing: 14)
    return layout {
      Image(systemName: icon)
        .font(.title3)
        .frame(width: 28)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.body.weight(.medium))
          .lineLimit(nameLines(typeSize))
        if let caption {
          Text(caption)
            .font(.footnote)
            .foregroundStyle(captionStyle)
            .lineLimit(nameLines(typeSize))
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 8) { trailing() }
        .fixedSize()
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(RoundedRectangle(cornerRadius: 10).fill(selected ? selectedRowColor : rowColor))
    .contentShape(RoundedRectangle(cornerRadius: 10))
  }
}

private struct CancelAction: ViewModifier {
  let label: String?
  let cancel: () -> Void

  @ViewBuilder
  func body(content: Content) -> some View {
    if let label {
      content.accessibilityAction(named: Text(label), cancel)
    } else {
      content
    }
  }
}

extension SheetRow where Trailing == EmptyView {
  init(
    icon: String, title: String, caption: String?, captionStyle: Color = captionColor, selected: Bool = false,
    action: (() -> Void)? = nil
  ) {
    self.init(
      icon: icon, title: title, caption: caption, captionStyle: captionStyle, selected: selected, action: action,
      trailing: { EmptyView() }
    )
  }
}

/// The system AirPlay picker, over the AirPlay row: its own button answers the tap and lists the routes.
private struct AirPlayPickerButton: UIViewRepresentable {
  func makeUIView(context: Context) -> AVRoutePickerView {
    let picker = AVRoutePickerView()
    // Invisible: the row draws the icon and the texts.
    picker.tintColor = .clear
    picker.activeTintColor = .clear
    picker.prioritizesVideoDevices = true
    return picker
  }

  func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
#endif
