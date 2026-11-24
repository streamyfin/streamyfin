import Foundation

/// What the TV button says: the TV's name, or that the session is coming back.
enum TargetLabel: Equatable {
	case name(String?)
	case reconnecting
}

/// Why the model closes the screen.
enum RemoteClose: Equatable {
	/// The film is over, or the list ended with nothing after it.
	case playbackEnded
	/// The connection to the TV is over.
	case remoteEnded

	/// The dismiss reason JS gets.
	var reason: String {
		switch self {
		case .playbackEnded: return "playbackEnded"
		case .remoteEnded: return "remoteEnded"
		}
	}
}

/// What the remote screen shows for the state of the TV, the design's table of states: a loading TV spins in
/// the play button, a reconnecting one dims the controls and cuts the transport, between two items the bar and
/// the track menus rest, a TV stopped from its remote keeps the screen and play resumes, and the end of the film
/// or of the connection closes it. Pure. Twin: RemoteScreenModel.kt.
struct RemoteScreenModel: Equatable {
	var targetLabel: TargetLabel
	var controlsDimmed: Bool
	var transportEnabled: Bool
	var seekEnabled: Bool
	var trackMenusEnabled: Bool
	/// What the reduced player leaves out: it plays media our server does not know, so nothing comes from it.
	var showsEpisodes: Bool
	var showsTrackMenus: Bool
	var showsMoreMenu: Bool
	var showsPreviousNext: Bool
	var playShowsSpinner: Bool
	var nextUpVisible: Bool
	/// A failure, shown whatever the rest says.
	var failure: String?
	/// The failure offers to play on the phone instead.
	var canPlayHere: Bool
	/// The segment skip band may show: not over Play here, the one way out the failure offers.
	var showsSkip: Bool
	var closes: RemoteClose?

	/// Whether a failure shown while the TV was at `from` goes as it moves to `to`: the TV loads again or plays
	/// again. A TV already loading when the failure came (a timed out load) keeps it until it plays.
	static func failureClears(from: RemotePhase, to: RemotePhase) -> Bool {
		from != to && (to == .loading || to == .playing)
	}

	/// Whether the screen has seen the TV hold an item since it opened or took a new config, once the TV is at
	/// `phase`. Until then an end is the item before's (the SDK keeps a finished status), not this screen's.
	static func sawPlayback(before: Bool, phase: RemotePhase) -> Bool {
		before || phase == .playing || phase == .paused
	}

	/// `sawPlayback` for a new config of `itemId` while the TV is at `snapshot`: the item it holds already when JS
	/// followed it onto the next of its list, since no phase change comes before that item's end; another item
	/// waits for its playback. A `reduced` config carries no item id and is built from what the TV holds now.
	static func sawPlaybackOnUpdate(itemId: String?, snapshot: RemotePlaybackSnapshot, reduced: Bool = false) -> Bool {
		(reduced || (itemId != nil && itemId == snapshot.itemId)) && sawPlayback(before: false, phase: snapshot.phase)
	}

	/// `hasNext`: the phone knows an episode after this one. `reduced`: the TV plays media our server does not
	/// know, so there are no track menus. `canPlayHere` only counts with a `failure`. `sawPlayback`: see
	/// `sawPlayback(before:phase:)`; an end the screen never saw play neither closes it nor offers the next episode.
	static func of(
		_ snapshot: RemotePlaybackSnapshot, targetName: String?, hasNext: Bool, reduced: Bool, failure: String?,
		canPlayHere: Bool = false, sawPlayback: Bool = true
	) -> RemoteScreenModel {
		let reconnecting = snapshot.reconnecting
		// Something is loaded on the TV, so a seek or a track change has something to act on.
		let itemLoaded = [.loading, .playing, .paused].contains(snapshot.phase)
		let ended = snapshot.phase == .ended && sawPlayback
		// The reduced player knows nothing after what plays, nor how to play it on the phone.
		let next = hasNext && !reduced
		let playHere = failure != nil && canPlayHere && !reduced
		let closes: RemoteClose?
		if !snapshot.connected {
			closes = .remoteEnded
		} else if ended, !next {
			closes = .playbackEnded
		} else {
			closes = nil
		}
		return RemoteScreenModel(
			targetLabel: reconnecting ? .reconnecting : .name(targetName),
			controlsDimmed: reconnecting,
			transportEnabled: !reconnecting,
			seekEnabled: !reconnecting && itemLoaded,
			trackMenusEnabled: !reconnecting && itemLoaded && !reduced,
			showsEpisodes: !reduced,
			showsTrackMenus: !reduced,
			showsMoreMenu: !reduced,
			showsPreviousNext: !reduced,
			playShowsSpinner: !reconnecting && (snapshot.phase == .loading || snapshot.phase == .between),
			nextUpVisible: snapshot.connected && ended && next,
			failure: failure,
			canPlayHere: playHere,
			showsSkip: !playHere,
			closes: closes
		)
	}
}
