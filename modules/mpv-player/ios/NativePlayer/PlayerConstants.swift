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
	/// bar's track, gaps) and the text, counted one line each at the font scale asked for.
	static let remotePortraitFixed: Double = 276
	static let remotePortraitText: Double = 82
	static let remoteLandscapeFixed: Double = 108
	static let remoteLandscapeText: Double = 34
}
