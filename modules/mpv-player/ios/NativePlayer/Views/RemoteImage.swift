#if os(iOS) || os(tvOS)
import SwiftUI

/// `AsyncImage` that can carry custom proxy auth headers.
///
/// The player loads a few thumbnails itself (episode list, next episode), and
/// behind an access gateway those URLs need the same headers as the stream —
/// which `AsyncImage(url:)` has no way to send.
struct RemoteImage<Placeholder: View>: View {
	let url: URL
	let headers: [String: String]?
	@ViewBuilder var placeholder: () -> Placeholder

	@State private var image: UIImage?

	var body: some View {
		Group {
			if let image {
				Image(uiImage: image).resizable().aspectRatio(contentMode: .fill)
			} else {
				placeholder()
			}
		}
		.task(id: url) { await load() }
	}

	private func load() async {
		// No headers to add: the shared session's cache still applies.
		var request = URLRequest(url: url)
		headers?.forEach { key, value in
			request.setValue(value, forHTTPHeaderField: key)
		}

		guard let (data, _) = try? await URLSession.shared.data(for: request),
			  let loaded = UIImage(data: data) else { return }

		image = loaded
	}
}
#endif
