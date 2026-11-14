/**
 * Streaming quality: the two choices that carry no bitrate of their own, and
 * how Auto measures one, the way jellyfin-web's bitrate test does.
 */

/** The quality measured on the connection to the server, the default. */
export const AUTO_BITRATE_KEY = "Auto";

/** The quality that sets no cap at all. */
export const MAX_BITRATE_KEY = "Max";

/**
 * Auto and Max in a play request, the player's route and its quality menu,
 * where a quality is otherwise a bitrate in bit/s. A request that names none
 * plays at the default quality. The players measure Auto before asking the
 * server for a stream, which never sees either.
 */
export const AUTO_BITRATE_VALUE = "auto";
export const MAX_BITRATE_VALUE = "max";

/**
 * The Jellyfin receiver's own ceiling, what a cast asks for when it sets no
 * cap: under Max, or when Auto could measure nothing. A cast always names a
 * bitrate, since one that names none leaves the receiver on the cap of the
 * cast before it.
 */
export const RECEIVER_MAX_BITRATE = 120_000_000;

/**
 * The native player's quality menu hands back the index of the entry picked,
 * and the bitrate is that index: Max and Auto, which have none, take two that
 * no bitrate can be.
 */
export const NATIVE_MAX_QUALITY_INDEX = -1;
export const NATIVE_AUTO_QUALITY_INDEX = -2;

/** The server's speed test: it answers with as many bytes as it is asked. */
export const BITRATE_TEST_PATH = "/Playback/BitrateTest";

/** Sent with every speed test, so no cache on the way answers in its place. */
export const BITRATE_TEST_CACHE_CONTROL = "no-cache, no-store";

/**
 * How long a detected bitrate is used before the server is measured again,
 * unless the settings say otherwise.
 */
export const BITRATE_DETECTION_TTL_MS = 60 * 60 * 1000;

/**
 * Seconds short of the end of a file that the player's cache may stop at for
 * its stream to count as downloaded. A swap over a stream still downloading
 * keeps Auto's measure before; past that, the link is free to measure.
 */
export const AUTO_STREAM_CACHED_TO_END_SLACK_SECONDS = 2;

/**
 * How long a detection that measured nothing is remembered, so the plays
 * after it do not each wait on the same failed tests and their timeouts.
 */
export const BITRATE_DETECTION_RETRY_MS = 2 * 60 * 1000;

/**
 * How long each request of a detection may take, the body of a speed test
 * included: playback waits on it. A speed test whose body is still coming then
 * is measured on what has arrived, one whose headers have not has failed.
 */
export const BITRATE_REQUEST_TIMEOUT_MS = 5_000;

/**
 * The speed tests, run in order: the size each downloads, and the rate in
 * bit/s under which the detection ends there instead of measuring a link that
 * slow with a larger download.
 */
export const BITRATE_TESTS = [
  { bytes: 500_000, stopBelow: 500_000 },
  { bytes: 1_000_000, stopBelow: 20_000_000 },
  { bytes: 3_000_000, stopBelow: 50_000_000 },
] as const;

/** The share of the measured rate a stream may take: the link varies. */
export const DETECTED_BITRATE_RATIO = 0.7;

/**
 * MMKV key of Auto's last measures, per server address and per network, so a
 * launch on a network measured lately does not measure it again.
 */
export const AUTO_BITRATE_MEASURES_STORAGE_KEY = "autoBitrateMeasures";

/** The shares of the measured speed the Auto settings offer. */
export const AUTO_BITRATE_RATIO_CHOICES = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * How long a measure may be used, in minutes, as the Auto settings offer it:
 * the durations the inactivity timeout already names.
 */
export const AUTO_BITRATE_TTL_CHOICES = [15, 30, 60, 240, 1440] as const;

/** The floors in the server's network the Auto settings offer; 0 is none. */
export const AUTO_BITRATE_IN_NETWORK_MIN_CHOICES = [
  0, 40_000_000, 80_000_000, 140_000_000, 200_000_000,
] as const;

/** The server reads the bitrate it is asked for as a 32 bit integer. */
export const MAX_DETECTED_BITRATE = 2_147_483_647;

/**
 * The least a client in the server's own network is given: a test of a few
 * megabytes is over before a local network gets up to speed.
 */
export const IN_NETWORK_MIN_BITRATE = 140_000_000;
