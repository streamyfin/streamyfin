import SwiftUI

/// The panel where the touch players draw it, the local one and the remote screen: top left, under the bar.
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
struct TechnicalInfoOverlay: View {
	@ObservedObject var viewModel: PlayerViewModel

	@State private var info: [String: Any] = [:]

	private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

	var body: some View {
		VStack(alignment: .leading, spacing: 3) {
			if viewModel.capabilities.technicalInfoFromJs {
				ForEach(viewModel.technicalLines.indices, id: \.self) { index in
					line(viewModel.technicalLines[index].label, viewModel.technicalLines[index].value)
				}
			} else {
				engineLines
			}
		}
		.font(.caption2.monospaced())
		.foregroundStyle(.white)
		.padding(10)
		.frame(maxWidth: 340, alignment: .leading)
		.background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
		.onTapGesture { viewModel.showTechnicalInfo = false }
		// A remote panel asks JS for its lines while it is shown; a local one reads its engine.
		.onAppear {
			viewModel.technicalInfoShown(true)
			refresh()
		}
		.onDisappear { viewModel.technicalInfoShown(false) }
		.onReceive(timer) { _ in refresh() }
	}

	@ViewBuilder private var engineLines: some View {
		if let playMethod = viewModel.playMethod {
			line("Play method", playMethod)
		}
		if !viewModel.transcodeReasons.isEmpty {
			line("Transcode reasons", viewModel.transcodeReasons.joined(separator: ", "))
		}
		ForEach(info.keys.sorted(), id: \.self) { key in
			line(key, String(describing: info[key] ?? ""))
		}
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
}
