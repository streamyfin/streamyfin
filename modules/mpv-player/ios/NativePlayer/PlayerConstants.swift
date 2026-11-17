import Foundation

/// The chrome's values that code outside its view model reads too, as Android's PlayerConstants holds them.
enum PlayerConstants {
	/// More than this far into a chapter, "previous chapter" restarts it; past it into an item, the
	/// Cast engine's previous restarts the item.
	static let chapterRestartThreshold: Double = 3
	/// The fake remote engine (tests, debug probe): how long its "TV" takes to load, and how long each of
	/// its default items lasts. Android: FAKE_REMOTE_LOAD_MS and FAKE_REMOTE_ITEM_SEC.
	static let fakeRemoteLoadMs: Double = 600
	static let fakeRemoteItemSec: Double = 120

	/// The remote player's layout (RemoteLayout, RemoteMetrics), by size class and never by device model, in
	/// points: Android's REMOTE_*_DP, the same numbers. A window shorter than remoteCompactHeight is couched;
	/// otherwise one at least remoteWideMinWidth wide puts the artwork beside the controls.
	static let remoteCompactHeight: Double = 480
	static let remoteWideMinWidth: Double = 600
	/// The artwork takes what the rest leaves, between these two; it gives up its height before anything else.
	static let remoteArtworkMin: Double = 96
	static let remoteArtworkMax: Double = 420
	static let remoteHorizontalPadding: Double = 24
	/// Couched, the artwork is at most this share of the width; wide, beside the column, this one.
	static let remoteLandscapeArtworkFraction: Double = 0.4
	static let remoteWideArtworkFraction: Double = 0.45
	/// What the rest of the screen takes, upright and couched: the part that keeps its size (buttons, the
	/// bar's track, gaps) and the text, counted one line each at the font scale asked for. Upright, measured at the
	/// probe on an iPhone 17 with every slot filled (RemoteLayoutTests.theUprightChromeMatchesTheMeasuredScreen).
	static let remotePortraitFixed: Double = 305
	static let remotePortraitText: Double = 73
	static let remoteLandscapeFixed: Double = 108
	static let remoteLandscapeText: Double = 34
	/// The remote transport (RemoteTransport): the chrome's three button sizes, and the gap between them,
	/// narrower upright so five buttons fit a phone's width. Android: REMOTE_BUTTON_*_DP, REMOTE_TRANSPORT_GAP_*_DP.
	static let remoteButtonSmall: Double = 44
	static let remoteButtonMedium: Double = 52
	static let remoteButtonPlay: Double = 68
	static let remoteTransportGapPortrait: Double = 20
	static let remoteTransportGap: Double = 28
	/// What is active or connected on the remote screen (the TV's name, subtitles on, the current episode, the
	/// chosen track), 0xRRGGBB: a light violet, 6:1 on the screen's darkest tones where the app's violet gives 2.2.
	/// Android: REMOTE_ACTIVE_COLOR.
	static let remoteActiveColor: UInt32 = 0xC9A7FB
	/// The remote screen's background with no tint from JS, 0xRRGGBB (constants/RemotePlayer.ts REMOTE_TINT_NEUTRAL),
	/// how long a new tint takes to fade in (REMOTE_TINT_FADE_MS), and the share of the height where the gradient
	/// reaches its bottom color, which then holds to the bottom edge. Android: REMOTE_TINT_*.
	static let remoteTintNeutralTop: UInt32 = 0x342E3D
	static let remoteTintNeutralBottom: UInt32 = 0x1F1927
	static let remoteTintFadeMs: Double = 300
	static let remoteTintGradientEnd: Double = 0.66
	/// A drag down closes the remote screen like the chevron once it covers this share of the screen's height, or ends
	/// faster than this many points per second (RemoteGestures). Android: REMOTE_DISMISS_*, the same numbers.
	static let remoteDismissDragFraction: Double = 0.25
	static let remoteDismissDragVelocity: Double = 1200
}
