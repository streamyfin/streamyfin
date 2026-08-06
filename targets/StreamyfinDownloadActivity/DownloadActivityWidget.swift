import ActivityKit
import SwiftUI
import WidgetKit

private let brandTint = Color(red: 0.576, green: 0.200, blue: 0.918)  // #9333EA

/// Live Activity for the active download.
///
/// Text is deliberately kept to values that need no translation — byte counts are formatted by
/// Foundation against the user's locale, and the only prose (the state label) is passed in from JS,
/// which already has the app's i18n catalog.
///
/// There is intentionally no time remaining. An ETA has to be derived from a speed average, and
/// download throughput is spiky enough that dividing into it produced a figure that jumped around
/// constantly. A percentage is measured rather than predicted, so it only ever moves forward.
struct DownloadActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DownloadActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.55))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          PosterView(fileName: context.state.posterFileName, size: 46)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.title)
              .font(.headline)
              .lineLimit(1)
            Text(subtitleText(for: context))
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TrailingStatus(context: context)
        }
        DynamicIslandExpandedRegion(.bottom) {
          ProgressBar(context: context)
        }
      } compactLeading: {
        Image(systemName: leadingSymbol(for: context))
          .foregroundStyle(isProgressStale(context) ? Color.secondary : brandTint)
      } compactTrailing: {
        CompactTrailing(context: context)
      } minimal: {
        Image(systemName: leadingSymbol(for: context))
          .foregroundStyle(isProgressStale(context) ? Color.secondary : brandTint)
      }
      .keylineTint(brandTint)
    }
  }
}

// MARK: - Lock Screen

private struct LockScreenView: View {
  let context: ActivityViewContext<DownloadActivityAttributes>

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      PosterView(fileName: context.state.posterFileName, size: 60)

      VStack(alignment: .leading, spacing: 5) {
        HStack(alignment: .firstTextBaseline) {
          Text(context.state.title)
            .font(.headline)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(context.attributes.label(for: context.state.state))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(context.state.state == .failed ? .red : .secondary)
            .lineLimit(1)
        }

        Text(subtitleText(for: context))
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)

        ProgressBar(context: context)

        HStack {
          if context.state.state == .downloading {
            Text(transferredText(for: context))
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          Spacer(minLength: 8)
          PercentLabel(context: context)
        }
      }
    }
    .padding(16)
  }
}

// MARK: - Pieces

private struct ProgressBar: View {
  let context: ActivityViewContext<DownloadActivityAttributes>

  var body: some View {
    // Honest, value-driven progress. It stops advancing while the app is suspended rather than
    // guessing forward — the stale treatment is what conveys that the numbers are frozen.
    ProgressView(value: displayProgress(for: context))
      .progressViewStyle(.linear)
      .tint(progressTint(for: context))
  }
}

private struct PercentLabel: View {
  let context: ActivityViewContext<DownloadActivityAttributes>

  var body: some View {
    if context.state.state == .downloading {
      HStack(spacing: 3) {
        if isProgressStale(context) {
          Image(systemName: "clock.arrow.circlepath")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        Text(percentText(for: context))
          .font(.caption.weight(.semibold))
          .monospacedDigit()
          .foregroundStyle(isProgressStale(context) ? Color.secondary : brandTint)
      }
    }
  }
}

private struct TrailingStatus: View {
  let context: ActivityViewContext<DownloadActivityAttributes>

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      Text(percentText(for: context))
        .font(.body.weight(.semibold))
        .monospacedDigit()
        .foregroundStyle(isProgressStale(context) ? .secondary : .primary)
      if context.state.queuedCount > 0 {
        Text("+\(context.state.queuedCount)")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct CompactTrailing: View {
  let context: ActivityViewContext<DownloadActivityAttributes>

  var body: some View {
    Text(percentText(for: context))
      .monospacedDigit()
      .foregroundStyle(isProgressStale(context) ? Color.secondary : brandTint)
  }
}

private struct PosterView: View {
  let fileName: String?
  let size: CGFloat

  var body: some View {
    Group {
      if let image = loadPoster() {
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: .fill)
      } else {
        ZStack {
          Color.white.opacity(0.12)
          Image(systemName: "arrow.down.circle.fill")
            .font(.system(size: size * 0.4))
            .foregroundStyle(brandTint)
        }
      }
    }
    .frame(width: size, height: size * 1.5)
    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
  }

  /// The extension has no access to the app's Documents directory, so posters are staged into the
  /// shared App Group container before the activity starts.
  private func loadPoster() -> UIImage? {
    guard let url = DownloadActivitySharedContainer.posterURL(fileName: fileName) else {
      return nil
    }
    return UIImage(contentsOfFile: url.path)
  }
}

// MARK: - Formatting

/// True when the last pushed update has passed its stale date while still claiming to download —
/// i.e. the app has been suspended and the numbers are frozen, not current. The transfer itself
/// usually continues out-of-process; this treatment just stops a frozen 16% from looking live.
private func isProgressStale(_ context: ActivityViewContext<DownloadActivityAttributes>) -> Bool {
  context.isStale && context.state.state == .downloading
}

private func progressTint(for context: ActivityViewContext<DownloadActivityAttributes>) -> Color {
  if context.state.state == .failed { return .red }
  return isProgressStale(context) ? brandTint.opacity(0.4) : brandTint
}

private func leadingSymbol(for context: ActivityViewContext<DownloadActivityAttributes>) -> String {
  isProgressStale(context)
    ? "clock.arrow.circlepath"
    : compactSymbol(for: context.state.state)
}

private func displayProgress(for context: ActivityViewContext<DownloadActivityAttributes>) -> Double
{
  switch context.state.state {
  case .completed: return 1
  case .queued: return 0
  default: return min(max(context.state.progress, 0), 1)
  }
}

private func percentText(for context: ActivityViewContext<DownloadActivityAttributes>) -> String {
  "\(Int((displayProgress(for: context) * 100).rounded()))%"
}

private func subtitleText(for context: ActivityViewContext<DownloadActivityAttributes>) -> String {
  let subtitle = context.state.subtitle
  guard context.state.queuedCount > 0, context.state.state == .downloading else { return subtitle }
  let queued = "+\(context.state.queuedCount)"
  return subtitle.isEmpty ? queued : "\(subtitle) · \(queued)"
}

private func transferredText(for context: ActivityViewContext<DownloadActivityAttributes>) -> String
{
  let formatter = ByteCountFormatter()
  formatter.countStyle = .file
  let downloaded = formatter.string(fromByteCount: context.state.bytesDownloaded)

  var parts: [String] = []
  if context.state.totalBytes > 0 {
    parts.append("\(downloaded) / \(formatter.string(fromByteCount: context.state.totalBytes))")
  } else {
    parts.append(downloaded)
  }
  // A speed frozen at its pre-suspension value is a lie; drop it once the update has gone stale.
  if !isProgressStale(context), context.state.speedBytesPerSec > 0 {
    let speed = formatter.string(fromByteCount: Int64(context.state.speedBytesPerSec))
    parts.append("\(speed)/s")
  }
  return parts.joined(separator: " · ")
}

private func compactSymbol(for state: DownloadActivityState) -> String {
  switch state {
  case .completed: return "checkmark.circle.fill"
  case .failed: return "exclamationmark.triangle.fill"
  case .queued: return "clock"
  case .downloading: return "arrow.down.circle.fill"
  }
}
