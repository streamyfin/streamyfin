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
}
