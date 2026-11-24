import Foundation

/// The remote screen's three layouts (design §3.1, §3.2), chosen from the window's size class, never from the
/// device model: a short window is couched, a wide one that is wider than tall puts the artwork beside the
/// controls, the rest stands upright, a tablet held upright as a phone does. iOS points and Android dp are worth the
/// same here. Twin: RemoteLayout.kt.
enum RemoteLayout: Equatable {
	case portrait
	case landscape
	case wide

	static func of(width: Double, height: Double) -> RemoteLayout {
		if height < PlayerConstants.remoteCompactHeight { return .landscape }
		if width >= PlayerConstants.remoteWideMinWidth && width > height { return .wide }
		return .portrait
	}
}

/// A box's size, in points. Twin: RemoteBox in RemoteLayout.kt.
struct RemoteBox: Equatable {
	let width: Double
	let height: Double
}

/// What ends the couched top bar on the right: "more" when it has a menu, else the last track button, else the TV.
/// Its ink, not its box, meets the margin (RemoteMetrics.topBarInkInsets). Twin: RemoteTopBarEnd in RemoteLayout.kt.
enum RemoteTopBarEnd: Equatable {
	case more
	case trackButton
	case target

	static func of(showsMore: Bool, trackButtons: Int) -> RemoteTopBarEnd {
		if showsMore { return .more }
		return trackButtons > 0 ? .trackButton : .target
	}
}

/// How big the artwork is. Upright and wide, a square: what the rest of the screen leaves once its text is counted
/// at the font scale asked for, between remoteArtworkMin and remoteArtworkMax (upright, at least
/// remotePortraitArtworkMaxShare of the width); the artwork gives up its height first, and when nothing fits even at
/// its minimum, the column scrolls. Couched, the image in its own shape, as
/// large as the left half and the band under the top bar leave it: the text stands beside it, and scrolls there.
enum RemoteMetrics {
	/// The height the rest of the screen takes above and below the artwork. Couched, `topBarHeight` is the top bar as
	/// measured: its TV button grows with the text size; before the first measure, the height of its buttons.
	static func chromeHeight(layout: RemoteLayout, fontScale: Double, topBarHeight: Double? = nil) -> Double {
		switch layout {
		case .portrait:
			return PlayerConstants.remotePortraitFixed + PlayerConstants.remotePortraitText * fontScale
		case .landscape:
			// The top bar, and the image's inset above and below in the band under it.
			return (topBarHeight ?? PlayerConstants.remoteButtonSmall) + 2 * PlayerConstants.remoteLandscapeArtworkInset
		case .wide:
			// Beside the column, the artwork only keeps a margin above and below.
			return 2 * PlayerConstants.remoteHorizontalPadding
		}
	}

	/// The width of the box beside the column. Wide, the artwork's share of the whole width, the one its size is
	/// reckoned against; couched, one of the two equal halves the side margins and the gutter leave; upright nothing
	/// stands beside the column: nil.
	static func besideWidth(layout: RemoteLayout, width: Double) -> Double? {
		switch layout {
		case .wide:
			return width * PlayerConstants.remoteWideArtworkFraction
		case .landscape:
			let halves = width - 2 * PlayerConstants.remoteHorizontalPadding - PlayerConstants.remoteLandscapeGutter
			return max(halves / 2, 0)
		case .portrait:
			return nil
		}
	}

	/// The artwork's box. `aspectRatio` is the image's width over its height, as JS sends it (artworkAspectRatio);
	/// couched, an unknown or impossible one gives the square the artwork had before the screen knew shapes, and
	/// `topBarHeight` is the measured top bar (see chromeHeight).
	static func artworkBox(
		layout: RemoteLayout, width: Double, height: Double, fontScale: Double, aspectRatio: Double?,
		topBarHeight: Double? = nil
	) -> RemoteBox {
		guard layout == .landscape else {
			let side = artworkHeight(layout: layout, width: width, height: height, fontScale: fontScale)
			return RemoteBox(width: side, height: side)
		}
		let ratio = aspectRatio.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } ?? 1
		let maxWidth = besideWidth(layout: layout, width: width) ?? 0
		let maxHeight = max(height - chromeHeight(layout: layout, fontScale: fontScale, topBarHeight: topBarHeight), 0)
		// Wider than the room's shape, the width binds; otherwise the height does.
		if maxHeight * ratio > maxWidth { return RemoteBox(width: maxWidth, height: maxWidth / ratio) }
		return RemoteBox(width: maxHeight * ratio, height: maxHeight)
	}

	/// The image itself in `box`, scaled to fit: the failure and skip bands lie on it, never past it. An unknown or
	/// impossible `aspectRatio` fills the box; couched, the box has the image's shape already.
	static func imageSize(box: RemoteBox, aspectRatio: Double?) -> RemoteBox {
		guard let ratio = aspectRatio, ratio.isFinite, ratio > 0 else { return box }
		// Narrower than the box's shape, the height binds; otherwise the width does.
		if box.width > box.height * ratio { return RemoteBox(width: box.height * ratio, height: box.height) }
		return RemoteBox(width: box.width, height: box.width / ratio)
	}

	/// The square artwork's side, upright and wide; couched, the height of the box artworkBox gives a square.
	static func artworkHeight(layout: RemoteLayout, width: Double, height: Double, fontScale: Double) -> Double {
		let byWidth: Double
		switch layout {
		case .portrait: byWidth = width - 2 * PlayerConstants.remoteHorizontalPadding
		case .landscape:
			return artworkBox(layout: layout, width: width, height: height, fontScale: fontScale, aspectRatio: nil).height
		// Centered in its share, with the side margin on each side: the whole share put it against the titles.
		case .wide: byWidth = width * PlayerConstants.remoteWideArtworkFraction - 2 * PlayerConstants.remoteHorizontalPadding
		}
		let byHeight = height - chromeHeight(layout: layout, fontScale: fontScale)
		// Upright, the maximum grows with the window: a tablet's artwork takes the share of it a phone's does.
		let largest = layout == .portrait
			? max(PlayerConstants.remoteArtworkMax, width * PlayerConstants.remotePortraitArtworkMaxShare)
			: PlayerConstants.remoteArtworkMax
		return min(max(min(byWidth, byHeight), PlayerConstants.remoteArtworkMin), largest)
	}

	/// How far the couched top bar reaches past the side margins, start and end, so the ink of its first and last
	/// buttons meets them rather than their boxes' air.
	static func topBarInkInsets(end: RemoteTopBarEnd) -> (start: Double, end: Double) {
		let trailing: Double
		switch end {
		case .more: trailing = PlayerConstants.remoteMoreInkInset
		case .trackButton: trailing = PlayerConstants.remoteTrackButtonInkInset
		case .target: trailing = 0
		}
		return (PlayerConstants.remoteChevronInkInset, trailing)
	}
}

/// The six slots every layout places (design §3.1). Twin: RemoteSlot in RemoteLayout.kt.
enum RemoteSlot: String, CaseIterable {
	case header, artwork, titles, bar, transport, bottomRow
}

/// Where a layout puts the slots: a bar across the top, the slot beside the rest (the artwork, on the left), the
/// column, top to bottom, and a band across the bottom. Couched, the header and the bottom row's buttons share the
/// top bar, and the titles, the bar and the transport stand beside the image; wide, the upright column stands
/// beside the artwork. `spaces` are the column's indices where the free height goes, shared equally when the column
/// is taller than its slots (`column.count`: after the last): upright above and below the artwork, the rest kept
/// together at the bottom as Spotify's player does; couched before the bar and the transport, so the column as tall
/// as the image has the titles level with its top and the transport with its bottom; wide around the middle.
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
			return RemoteArrangement(
				topBar: [], beside: nil, column: upright, bottom: [],
				spaces: [upright.firstIndex(of: .artwork)!, upright.firstIndex(of: .titles)!]
			)
		case .landscape:
			return RemoteArrangement(
				topBar: [.header, .bottomRow], beside: .artwork, column: [.titles, .bar, .transport], bottom: [], spaces: [1, 2]
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

	/// The gap between `count` buttons `buttons` wide in all, in a row `width` wide (fittingGap).
	func fittingGap(width: Double, buttons: Double, count: Int) -> Double {
		RemoteTransport.fittingGap(width: width, buttons: buttons, count: count, gap: gap)
	}

	/// `gap` when the row has room for it, less when it has not, never under 0: the gap gives way so that no button
	/// shrinks or spills. Five buttons upright (340 at the 20 gap) are wider than a 375pt iPhone's column (327), and
	/// the wide column (0.55w - 48) is under the 372 the 28 gap asks for below about 763. Twin:
	/// RemoteTransport.fittingGap in RemoteLayout.kt.
	static func fittingGap(width: Double, buttons: Double, count: Int, gap: Double) -> Double {
		guard count > 1 else { return gap }
		return min(max((width - buttons) / Double(count - 1), 0), gap)
	}
}

/// The remote "more" menu: what ChromeCapabilities leaves of the local one, quality and chapters. With neither, its
/// button is not drawn, as it would open an empty menu. Twin: RemoteMore in RemoteLayout.kt.
enum RemoteMore {
	static func shows(chapters: Int, qualities: Int) -> Bool {
		chapters > 0 || qualities > 0
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
