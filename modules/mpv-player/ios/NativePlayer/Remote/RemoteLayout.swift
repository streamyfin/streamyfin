import Foundation

/// The remote screen's three layouts (design §3.1, §3.2), chosen from the window's size class, never from the
/// device model: a short window is couched, a wide one puts the artwork beside the controls, the rest stands
/// upright. iOS points and Android dp are worth the same here. Twin: RemoteLayout.kt.
enum RemoteLayout: Equatable {
	case portrait
	case landscape
	case wide

	static func of(width: Double, height: Double) -> RemoteLayout {
		if height < PlayerConstants.remoteCompactHeight { return .landscape }
		if width >= PlayerConstants.remoteWideMinWidth { return .wide }
		return .portrait
	}
}

/// How big the artwork is: what the rest of the screen leaves once its text is counted at the font scale asked
/// for, between remoteArtworkMin and remoteArtworkMax. The artwork gives up its height first; when nothing fits
/// even at its minimum, the column scrolls.
enum RemoteMetrics {
	/// The height the rest of the screen takes beside the artwork's, in the same column.
	static func chromeHeight(layout: RemoteLayout, fontScale: Double) -> Double {
		switch layout {
		case .portrait:
			return PlayerConstants.remotePortraitFixed + PlayerConstants.remotePortraitText * fontScale
		case .landscape:
			return PlayerConstants.remoteLandscapeFixed + PlayerConstants.remoteLandscapeText * fontScale
		case .wide:
			// Beside the column, the artwork only keeps a margin above and below.
			return 2 * PlayerConstants.remoteHorizontalPadding
		}
	}

	/// The width of the box beside the column. Wide, the artwork's share of the whole width, the one its size is
	/// reckoned against; couched the box wraps the artwork, and upright nothing stands beside the column: nil.
	static func besideWidth(layout: RemoteLayout, width: Double) -> Double? {
		layout == .wide ? width * PlayerConstants.remoteWideArtworkFraction : nil
	}

	static func artworkHeight(layout: RemoteLayout, width: Double, height: Double, fontScale: Double) -> Double {
		let byWidth: Double
		switch layout {
		case .portrait: byWidth = width - 2 * PlayerConstants.remoteHorizontalPadding
		case .landscape: byWidth = width * PlayerConstants.remoteLandscapeArtworkFraction
		case .wide: byWidth = width * PlayerConstants.remoteWideArtworkFraction
		}
		let byHeight = height - chromeHeight(layout: layout, fontScale: fontScale)
		return min(max(min(byWidth, byHeight), PlayerConstants.remoteArtworkMin), PlayerConstants.remoteArtworkMax)
	}
}

/// The six slots every layout places (design §3.1). Twin: RemoteSlot in RemoteLayout.kt.
enum RemoteSlot: String, CaseIterable {
	case header, artwork, titles, bar, transport, bottomRow
}

/// Where a layout puts the slots: a bar across the top, the slot beside the rest (the artwork, on the left), the
/// column, top to bottom, and a band across the bottom. Couched, the header, the titles and the bottom row's
/// buttons share the top bar and the bar runs along the bottom; wide, the upright column stands beside the artwork.
/// `spaces` are the column's indices where the free height goes, shared equally when the screen is taller than the
/// slots (`column.count`: after the last): upright above the bottom row, as in the mockup; couched and wide around
/// the middle, so the transport sits level with the artwork.
struct RemoteArrangement: Equatable {
	let topBar: [RemoteSlot]
	let beside: RemoteSlot?
	let column: [RemoteSlot]
	let bottom: [RemoteSlot]
	let spaces: [Int]

	private static let upright: [RemoteSlot] = [.header, .artwork, .titles, .bar, .transport, .bottomRow]

	static func of(_ layout: RemoteLayout) -> RemoteArrangement {
		switch layout {
		case .portrait:
			return RemoteArrangement(topBar: [], beside: nil, column: upright, bottom: [], spaces: [upright.count - 1])
		case .landscape:
			return RemoteArrangement(
				topBar: [.header, .titles, .bottomRow], beside: .artwork, column: [.transport], bottom: [.bar], spaces: [0, 1]
			)
		case .wide:
			let column = upright.filter { $0 != .artwork }
			return RemoteArrangement(topBar: [], beside: .artwork, column: column, bottom: [], spaces: [1, column.count - 1])
		}
	}
}

/// The transport's buttons, the chrome's sizes, and the gap between them: narrower upright, to fit the width.
struct RemoteTransport: Equatable {
	let side: Double
	let seek: Double
	let play: Double
	let gap: Double

	static func of(_ layout: RemoteLayout) -> RemoteTransport {
		RemoteTransport(
			side: PlayerConstants.remoteButtonSmall,
			seek: PlayerConstants.remoteButtonMedium,
			play: PlayerConstants.remoteButtonPlay,
			gap: layout == .portrait ? PlayerConstants.remoteTransportGapPortrait : PlayerConstants.remoteTransportGap
		)
	}
}

/// What lights up in the active color on the remote screen (design §3.3).
enum RemoteActive {
	/// Subtitles are on when the chosen entry is a real track: "None" is SUBTITLES_OFF, -1, on the JS side.
	static func subtitlesOn(selectedIndex: Int?) -> Bool {
		guard let selectedIndex else { return false }
		return selectedIndex >= 0
	}
}

/// The remote screen's colors, 0xRRGGBB, from the tint JS sends (remoteTint): the background's top and bottom and
/// the active color. A missing or unreadable tint gives the neutral background and remoteActiveColor, the screen as
/// it stands before JS knows the artwork's color; half a background falls back whole. Twin: RemoteColors in
/// RemoteLayout.kt.
struct RemoteColors: Equatable {
	let top: UInt32
	let bottom: UInt32
	let accent: UInt32

	static func of(top: String?, bottom: String?, accent: String?) -> RemoteColors {
		let background = rgb(top).flatMap { t in rgb(bottom).map { (t, $0) } }
		return RemoteColors(
			top: background?.0 ?? PlayerConstants.remoteTintNeutralTop,
			bottom: background?.1 ?? PlayerConstants.remoteTintNeutralBottom,
			accent: rgb(accent) ?? PlayerConstants.remoteActiveColor
		)
	}

	/// `#RRGGBB` as 0xRRGGBB; anything else is nil.
	private static func rgb(_ hex: String?) -> UInt32? {
		guard let hex, hex.count == 7, hex.first == "#" else { return nil }
		let digits = hex.dropFirst()
		guard digits.allSatisfy(\.isHexDigit) else { return nil }
		return UInt32(digits, radix: 16)
	}
}

/// The headers the remote artwork is fetched with: its own (metadata.artworkHeaders), else the server's
/// (config.imageHeaders); an empty map counts as none. Twin: remoteImageHeaders in RemoteImage.kt.
enum RemoteImageHeaders {
	static func of(own: [String: String]?, server: [String: String]?) -> [String: String]? {
		if let own, !own.isEmpty { return own }
		if let server, !server.isEmpty { return server }
		return nil
	}
}
