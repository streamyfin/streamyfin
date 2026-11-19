import SwiftUI

/// The panel where the local touch player draws it: top left, under the bar.
struct TechnicalInfoLayer: View {
	@ObservedObject var viewModel: PlayerViewModel

	var body: some View {
		if viewModel.showTechnicalInfo && viewModel.capabilities.technicalInfo {
			VStack {
				HStack {
					TechnicalInfoOverlay(viewModel: viewModel)
					Spacer()
				}
				Spacer()
			}
			.padding(.top, 56)
			.padding(.leading, 24)
		}
	}
}

/// Stats-for-nerds overlay: play method + transcode reasons from the config,
/// live values polled from the engine once per second. Shared by the iOS
/// touch chrome and the tvOS panel (which scales it up for viewing distance).
/// The remote screen draws a tighter card over its artwork (compactWidth), Android's.
struct TechnicalInfoOverlay: View {
	@ObservedObject var viewModel: PlayerViewModel
	/// The remote screen's card, this wide; nil for the local panel.
	var compactWidth: CGFloat? = nil
	/// False when the caller asks for the lines itself: a card that moves between slots disappears and appears again.
	var reportsShown = true

	/// The compact card at most this wide: Android's (TechnicalInfoOverlay.kt), the same number.
	static let compactMaxWidth: CGFloat = 320
	// The compact card's sizes, Android's dp: padding, title, close button, the rule's air, the lines' text and
	// line height, their air, the gap between label and value, the label's share of a line.
	private static let compactPadding: CGFloat = 10
	private static let compactTitleSize: CGFloat = 13
	private static let compactCloseSize: CGFloat = 24
	private static let compactRuleInset: CGFloat = 4
	private static let compactTextSize: CGFloat = 12
	private static let compactLineHeight: CGFloat = 15
	private static let compactLineInset: CGFloat = 1
	private static let compactGap: CGFloat = 8
	private static let compactLabelShare: CGFloat = 0.4
	private static let compactCornerRadius: CGFloat = 16

	@State private var info: [String: Any] = [:]

	private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

	var body: some View {
		Group {
			// The remote screen is iPhone and iPad only; tvOS keeps the panel.
			#if os(iOS)
			if let compactWidth {
				// The lines scroll only when the room the caller gives is shorter than they are.
				ViewThatFits(in: .vertical) {
					compactCard(width: compactWidth, scrolls: false)
					compactCard(width: compactWidth, scrolls: true)
				}
			} else {
				panel
			}
			#else
			panel
			#endif
		}
		// A remote panel asks JS for its lines while it is shown; a local one reads its engine.
		.onAppear {
			if reportsShown { viewModel.technicalInfoShown(true) }
			refresh()
		}
		.onDisappear { if reportsShown { viewModel.technicalInfoShown(false) } }
		.onReceive(timer) { _ in refresh() }
	}

	private var panel: some View {
		VStack(alignment: .leading, spacing: 3) {
			ForEach(entries.indices, id: \.self) { index in
				line(entries[index].label, entries[index].value)
			}
		}
		.font(.caption2.monospaced())
		.foregroundStyle(.white)
		.padding(10)
		.frame(maxWidth: 340, alignment: .leading)
		.background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
		.onTapGesture { viewModel.showTechnicalInfo = false }
	}

	/// What the panel lists: JS's lines (what the TV plays), else the engine's.
	private var entries: [(label: String, value: String)] {
		if viewModel.capabilities.technicalInfoFromJs { return viewModel.technicalLines }
		var entries: [(label: String, value: String)] = []
		if let playMethod = viewModel.playMethod { entries.append(("Play method", playMethod)) }
		if !viewModel.transcodeReasons.isEmpty {
			entries.append(("Transcode reasons", viewModel.transcodeReasons.joined(separator: ", ")))
		}
		for key in info.keys.sorted() { entries.append((key, String(describing: info[key] ?? ""))) }
		return entries
	}

	private func refresh() {
		guard !viewModel.capabilities.technicalInfoFromJs else { return }
		// Completion arrives on the mpv work queue — hop back for @State.
		viewModel.technicalInfo { latest in
			DispatchQueue.main.async { info = latest }
		}
	}

	private func line(_ key: String, _ value: String) -> some View {
		HStack(alignment: .top, spacing: 6) {
			Text(key + ":")
				.foregroundStyle(.white.opacity(0.6))
			Text(value)
				.lineLimit(2)
		}
	}

	#if os(iOS)
	/// Title and close, a rule, then each line: its label on the left, its value against the right edge.
	private func compactCard(width: CGFloat, scrolls: Bool) -> some View {
		VStack(alignment: .leading, spacing: 0) {
			HStack(spacing: 0) {
				Text(viewModel.str("technicalInfo", "Technical Info"))
					.font(.system(size: Self.compactTitleSize, weight: .bold))
				Spacer(minLength: Self.compactGap)
				Button {
					viewModel.showTechnicalInfo = false
				} label: {
					Image(systemName: "xmark")
						.font(.system(size: Self.compactTextSize, weight: .semibold))
						.frame(width: Self.compactCloseSize, height: Self.compactCloseSize)
						.contentShape(Rectangle())
				}
				.accessibilityLabel(viewModel.str("close", "Close"))
			}
			Rectangle()
				.fill(.white.opacity(0.2))
				.frame(height: 1)
				.padding(.vertical, Self.compactRuleInset)
			if scrolls {
				ScrollView { compactLines(width: width) }
			} else {
				compactLines(width: width)
			}
		}
		.foregroundStyle(.white)
		.padding(Self.compactPadding)
		.frame(width: width)
		.background(.black.opacity(0.85), in: RoundedRectangle(cornerRadius: Self.compactCornerRadius))
		// Touches on the card stay on it: a double tap there does not seek.
		.contentShape(RoundedRectangle(cornerRadius: Self.compactCornerRadius))
		.onTapGesture {}
	}

	private func compactLines(width: CGFloat) -> some View {
		let room = max(width - 2 * Self.compactPadding - Self.compactGap, 0)
		// The line height follows the text, as Android's 15 sp does.
		let spacing = max(Self.compactLineHeight - UIFont.systemFont(ofSize: Self.compactTextSize).lineHeight, 0)
		return VStack(alignment: .leading, spacing: 0) {
			ForEach(entries.indices, id: \.self) { index in
				// Over a narrow artwork, a long label wraps rather than leave its value a word per line.
				HStack(alignment: .top, spacing: Self.compactGap) {
					Text(entries[index].label)
						.font(.system(size: Self.compactTextSize))
						.foregroundStyle(.white.opacity(0.6))
						.frame(width: room * Self.compactLabelShare, alignment: .leading)
					Text(entries[index].value)
						.font(.system(size: Self.compactTextSize, weight: .medium, design: .monospaced))
						.multilineTextAlignment(.trailing)
						.frame(width: room * (1 - Self.compactLabelShare), alignment: .trailing)
				}
				.lineSpacing(spacing)
				.fixedSize(horizontal: false, vertical: true)
				.padding(.vertical, Self.compactLineInset)
			}
		}
	}
	#endif
}
