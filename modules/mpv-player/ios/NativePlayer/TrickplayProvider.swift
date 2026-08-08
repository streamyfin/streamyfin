#if os(iOS)
import UIKit

/// Fetches Jellyfin trickplay tile sheets (JPEG grids) and crops individual
/// scrub-preview thumbnails out of them. Tile math is a port of
/// hooks/useTrickplay.ts::calculateTrickplayTile. Sheet URLs are fully formed
/// by JS (online: ApiKey in the query; offline: file:// paths), so fetching is
/// uniform here.
actor TrickplayProvider {
	private let config: TrickplayRecord
	private let cache = NSCache<NSNumber, UIImage>()
	private var inflight: [Int: Task<UIImage?, Never>] = [:]
	private let urlSession: URLSession

	init(config: TrickplayRecord) {
		self.config = config
		// Decoded sheets are big (grid JPEGs); cap by pixel cost ≈ 50 MB.
		cache.totalCostLimit = 50 * 1024 * 1024

		let sessionConfig = URLSessionConfiguration.default
		if let headers = config.headers, !headers.isEmpty {
			sessionConfig.httpAdditionalHeaders = headers
		}
		urlSession = URLSession(configuration: sessionConfig)
	}

	nonisolated var isAvailable: Bool {
		!config.sheetUrls.isEmpty
			&& config.intervalMs > 0
			&& config.tileCols > 0
			&& config.tileRows > 0
			&& config.thumbWidth > 0
			&& config.thumbHeight > 0
	}

	nonisolated var aspectRatio: Double {
		guard config.thumbHeight > 0 else { return 16.0 / 9.0 }
		return config.thumbWidth / config.thumbHeight
	}

	/// Bucket a position to its tile index — views use this as a task id so
	/// requests naturally debounce to one per tile while scrubbing.
	nonisolated func tileIndex(forSeconds seconds: Double) -> Int {
		guard isAvailable else { return 0 }
		return max(0, Int((seconds * 1000) / config.intervalMs))
	}

	func thumbnail(forSeconds seconds: Double) async -> UIImage? {
		guard isAvailable else { return nil }

		let tile = tileIndex(forSeconds: seconds)
		let tilesPerSheet = config.tileCols * config.tileRows
		guard tilesPerSheet > 0 else { return nil }
		let sheetIndex = tile / tilesPerSheet
		guard sheetIndex >= 0, sheetIndex < config.sheetUrls.count else { return nil }

		let tileInSheet = tile % tilesPerSheet
		let col = tileInSheet % config.tileCols
		let row = tileInSheet / config.tileCols

		guard let sheet = await sheetImage(at: sheetIndex) else { return nil }

		// Warm the neighbors so continued scrubbing doesn't stall on fetches.
		prefetchSheet(at: sheetIndex + 1)
		prefetchSheet(at: sheetIndex - 1)

		guard let cgSheet = sheet.cgImage else { return nil }
		// Crop in pixel space (cgImage), clamped for the final partially
		// filled sheet.
		let cropRect = CGRect(
			x: Double(col) * config.thumbWidth,
			y: Double(row) * config.thumbHeight,
			width: config.thumbWidth,
			height: config.thumbHeight
		).intersection(CGRect(x: 0, y: 0, width: cgSheet.width, height: cgSheet.height))
		guard !cropRect.isEmpty, let cropped = cgSheet.cropping(to: cropRect) else { return nil }
		return UIImage(cgImage: cropped)
	}

	// MARK: - Sheets

	private func sheetImage(at index: Int) async -> UIImage? {
		if let cached = cache.object(forKey: NSNumber(value: index)) {
			return cached
		}
		if let running = inflight[index] {
			return await running.value
		}
		guard index >= 0, index < config.sheetUrls.count,
			  let url = URL(string: config.sheetUrls[index]) else { return nil }

		let task = Task<UIImage?, Never> { [urlSession] in
			guard let (data, _) = try? await urlSession.data(from: url),
				  let image = UIImage(data: data) else { return nil }
			return image
		}
		inflight[index] = task
		let image = await task.value
		inflight[index] = nil

		if let image, let cg = image.cgImage {
			let cost = cg.bytesPerRow * cg.height
			cache.setObject(image, forKey: NSNumber(value: index), cost: cost)
		}
		return image
	}

	private func prefetchSheet(at index: Int) {
		guard index >= 0, index < config.sheetUrls.count,
			  cache.object(forKey: NSNumber(value: index)) == nil,
			  inflight[index] == nil else { return }
		Task { _ = await sheetImage(at: index) }
	}
}
#endif
