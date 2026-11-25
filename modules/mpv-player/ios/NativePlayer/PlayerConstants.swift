import Foundation

/// The chrome's values that code outside its view model reads too, as Android's PlayerConstants holds them.
enum PlayerConstants {
	/// More than this far into a chapter, "previous chapter" restarts it; past it into an item, the
	/// Cast engine's previous restarts the item.
	static let chapterRestartThreshold: Double = 3
	/// The fake remote engine (tests, debug probe): how long its "TV" takes to load, how long each of its items
	/// lasts, and the item id whose load it fails, as a receiver the account cannot play on. Android:
	/// FAKE_REMOTE_LOAD_MS, FAKE_REMOTE_ITEM_SEC and FAKE_REMOTE_FAIL_ID.
	static let fakeRemoteLoadMs: Double = 600
	static let fakeRemoteItemSec: Double = 120
	static let fakeRemoteFailId = "fake-fail"

	/// The remote player's layout (RemoteLayout, RemoteMetrics), by size class and never by device model, in
	/// points: Android's REMOTE_*_DP, the same numbers. A window shorter than remoteCompactHeight is couched;
	/// otherwise one at least remoteWideMinWidth wide, and wider than tall, puts the artwork beside the controls.
	static let remoteCompactHeight: Double = 480
	static let remoteWideMinWidth: Double = 600
	/// The artwork takes what the rest leaves, between these two; it gives up its height before anything else.
	/// Upright, the maximum grows with the window, to this share of its width when that is more, so a tablet's artwork
	/// is as large a part of its screen as a phone's: a phone's margins leave it 87 to 89 %, under 420, so no phone
	/// changes. Android: REMOTE_PORTRAIT_ARTWORK_MAX_SHARE.
	static let remoteArtworkMin: Double = 96
	static let remoteArtworkMax: Double = 420
	static let remotePortraitArtworkMaxShare: Double = 0.9
	static let remoteHorizontalPadding: Double = 24
	/// The remote screen draws the technical info panel within the artwork, this far from its edges.
	/// Android: REMOTE_TECHNICAL_INFO_INSET_DP.
	static let remoteTechnicalInfoInset: Double = 8
	/// The remote screen's technical info card is at most this wide, Android's panel; the local panel has its own.
	/// Android: TECHNICAL_INFO_WIDTH_DP.
	static let remoteTechnicalInfoMaxWidth: Double = 320
	/// On the remote card, the label's share of a line; the value takes the rest.
	/// Android: REMOTE_TECHNICAL_INFO_LABEL_SHARE.
	static let remoteTechnicalInfoLabelShare: Double = 0.4
	/// A remote control the TV's state leaves inactive (reconnecting, nothing loaded) is drawn at this opacity.
	/// Android: REMOTE_INERT_ALPHA.
	static let remoteInertOpacity: Double = 0.4
	/// The segment skip's band across the bottom of the remote artwork, at least this tall.
	/// Android: REMOTE_SKIP_BANNER_HEIGHT_DP.
	static let remoteSkipBannerHeight: Double = 44
	/// Play here's band wraps to this many lines: whole at the largest text sizes. Android: REMOTE_PLAY_HERE_MAX_LINES.
	static let remotePlayHereMaxLines = 2
	/// The Continue pill under the next episode, at least the small button's height: white at this opacity over
	/// the tint. Android: REMOTE_PLAY_HERE_FILL_ALPHA.
	static let remotePlayHereFillOpacity: Double = 0.18
	/// The next episode's card at the end of the list the TV got: its 16:9 image is this wide.
	/// Android: REMOTE_NEXT_UP_IMAGE_WIDTH_DP.
	static let remoteNextUpImageWidth: Double = 112
	/// Wide, the artwork's share of the width, beside the column.
	static let remoteWideArtworkFraction: Double = 0.45
	/// Couched, the image and the column are two equal halves between the side margins, this far apart; the image
	/// keeps this inset above and below in the band under the top bar. Android: REMOTE_LANDSCAPE_GUTTER_DP,
	/// REMOTE_LANDSCAPE_ARTWORK_INSET_DP.
	static let remoteLandscapeGutter: Double = 24
	static let remoteLandscapeArtworkInset: Double = 16
	/// The air the couched top bar's end buttons have in their boxes, on the margin's side: the chevron's and the dots
	/// of "more", measured on an iPhone 17 capture (SF Symbols draw otherwise than Android's icons, so the numbers
	/// differ); a track button's 22 icon, not measured yet. The bar reaches past the margins by as much, so the ink
	/// meets them. Android: REMOTE_CHEVRON_INK_INSET_DP and the two others.
	static let remoteChevronInkInset: Double = 12.33
	static let remoteMoreInkInset: Double = 12.67
	static let remoteTrackButtonInkInset: Double = 11
	/// What the rest of the screen takes upright: the part that keeps its size (buttons, the bar's track, gaps) and
	/// the text, counted one line each at the font scale asked for. Measured at the probe on an iPhone 17 with every
	/// slot filled (RemoteLayoutTests.theUprightChromeMatchesTheMeasuredScreen).
	static let remotePortraitFixed: Double = 305
	static let remotePortraitText: Double = 73
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

	/// How long the TV's level stays on the remote screen after it changes, restarted by the next change
	/// (VolumeIndicatorModel). Android: REMOTE_VOLUME_INDICATOR_MS, the same duration.
	static let remoteVolumeIndicatorDuration: TimeInterval = 1.5
}
