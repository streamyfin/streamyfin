import SwiftUI

/// Stats-for-nerds overlay: play method + transcode reasons from the config,
/// live values polled from the engine once per second. Shared by the iOS
/// touch chrome and the tvOS panel (which scales it up for viewing distance).
struct TechnicalInfoOverlay: View {
	@ObservedObject var viewModel: PlayerViewModel

	@State private var info: [String: Any] = [:]

	private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

	var body: some View {
		VStack(alignment: .leading, spacing: 3) {
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
		.font(.caption2.monospaced())
		.foregroundStyle(.white)
		.padding(10)
		.frame(maxWidth: 340, alignment: .leading)
		.background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
		.onTapGesture { viewModel.showTechnicalInfo = false }
		.onAppear { refresh() }
		.onReceive(timer) { _ in refresh() }
	}

	private func refresh() {
		// Completion arrives on the mpv work queue — hop back for @State.
		viewModel.engine?.getTechnicalInfo { latest in
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
