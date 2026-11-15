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
