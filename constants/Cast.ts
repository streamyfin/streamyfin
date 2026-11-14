/**
 * Jellyfin session client name of the official Cast receiver (F007D354). The
 * server keys a session on client + device + user, so a stop reported on the
 * receiver's behalf has to use this exact name.
 */
export const JELLYFIN_RECEIVER_CLIENT = "Chromecast";

/**
 * Name handed to the receiver for a TV whose Cast name it cannot take, followed
 * by this many characters from the end of the Cast device id, so two such TVs
 * do not share one DeviceId on the server.
 */
export const RECEIVER_FALLBACK_NAME = "Chromecast";
export const RECEIVER_FALLBACK_ID_LENGTH = 8;

/**
 * Bitrate cap, in bit/s, sent when the user picked none ("Max", or music): the
 * ceiling the receiver puts on its own bandwidth measurement, which it skips
 * once it has a cap. The receiver keeps the last cap it was given for as long
 * as its app runs, so a message that leaves maxBitrate out never lifts an
 * earlier cap; every message states one instead.
 */
export const RECEIVER_UNCAPPED_BITRATE = 120_000_000;

/**
 * Receivers the remote quality settings remember, the latest first: a connection
 * adds one, and the oldest leaves the list, with its own quality, past this many.
 */
export const REMOTE_QUALITY_KNOWN_TARGETS_MAX = 20;

/**
 * Most items handed to the receiver in one PlayNow message. Each one is only a
 * few ids, but a Cast message is capped at 64 KB, so a long music queue is sent
 * as a window of this size around the selected track.
 */
export const RECEIVER_MAX_QUEUE_ITEMS = 100;

/**
 * How long a cast waits for the receiver to load the item before telling the
 * user it did not start. A receiver that cannot reach the server fails on its
 * first request without a word back, so this wait is the only sign of it. A
 * receiver fetches the item and runs PlaybackInfo before loading, which takes
 * a few seconds on a home network.
 */
export const RECEIVER_LOAD_TIMEOUT_MS = 30_000;

/**
 * How long a receiver that finished an item, or reloads its stream, may stay
 * idle before it counts as stopped. It runs GET /Items and PlaybackInfo before
 * the next item buffers; until then the queue goes on, and a Play, Next or
 * Previous would race its own move. CastEngineConstants.kt and
 * CastEngineConstants.swift hold the same wait.
 */
export const RECEIVER_NEXT_ITEM_WAIT_MS = 15_000;

/**
 * How long a status asked of the receiver is waited for before the one held
 * stands in. The receiver reports on events only, so "Continue here" asks it
 * where it is; it answers in well under a second on a home network.
 */
export const RECEIVER_STATUS_TIMEOUT_MS = 2_000;

/**
 * How long "Continue here" waits for the server to describe the receiver's
 * item. The receiver plays on meanwhile; past this the tap gives up and says
 * so, instead of holding later taps and stopping the receiver much later.
 */
export const RECEIVER_ITEM_LOOKUP_TIMEOUT_MS = 10_000;

/**
 * How long a Play pressed while a receiver connects waits for the connection.
 * Connections took a few seconds on the bench; past this the press gives up and
 * says the connection failed, instead of starting much later on its own.
 */
export const PLAY_TARGET_WAIT_MS = 20_000;

/**
 * Tries at opening the receiver channel before a command gives up. A session
 * that changes again on every try is a device the sender cannot hold on to,
 * and giving up beats looping on it.
 */
export const RECEIVER_CHANNEL_OPEN_ATTEMPTS = 3;

/**
 * How far back, in seconds, the stop reporter looks for the receiver's
 * session: the window jellyfin-web's dashboard lists sessions over. The server
 * stops a playing session that has not checked in for 5 minutes, on a 5 minute
 * timer, so one it still has playing was active well within it.
 */
export const RECEIVER_SESSION_WINDOW_SECONDS = 960;

/**
 * After a Cast session ends on a connection loss, how long to leave the
 * receiver to report its own stop before checking on it.
 */
export const RECEIVER_STOP_GRACE_MS = 3_000;

/**
 * The receiver reports progress every ~5 s while playing, so a session that has
 * not checked in across this window is no longer backed by a running receiver.
 * Three missed reports keeps one late request from reading as a dead TV.
 */
export const RECEIVER_LIVENESS_WINDOW_MS = 15_000;

/**
 * How often the music player moves its position on while the receiver plays a
 * queue. The receiver reports its position only when its state changes, so in
 * between the player counts on from the last report.
 */
export const MUSIC_CAST_PROGRESS_TICK_MS = 1_000;

/**
 * A track the receiver stopped within this much of its end counts as played
 * to the end: play then starts it again from its top, not from its last
 * seconds.
 */
export const MUSIC_CAST_RESUME_END_MARGIN_SECONDS = 2;

/**
 * An error the receiver reports within this long of its first report on a
 * queue sent to start mid track is the receiver failing to start there, as a
 * Google TV Streamer does with FLAC: the queue goes again from the top of that
 * track, once. A later error is the stream failing, which is not retried.
 */
export const MUSIC_CAST_START_FAILURE_WINDOW_MS = 10_000;

/**
 * Where the native output sheet puts a receiver's name in a text JS sends it
 * (OutputPickerStrings.kt and OutputPickerStrings.swift replace this same marker).
 */
export const OUTPUT_PICKER_NAME_MARKER = "{{name}}";
