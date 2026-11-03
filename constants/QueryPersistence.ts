/**
 * First segment of the query keys written to disk. Every launch parses what is
 * written here, so a family belongs only if launch or a screen opened without
 * a connection reads it. A new query is not persisted until it is added here.
 *
 * Left out on purpose: `search`, `item` and the other per item detail pages,
 * `library-items` (deep pages, one entry per filter), `seerr`, `livetv`,
 * `sessions` and playback info. Downloaded video never needs the cache: its
 * queries answer from the downloads database.
 */
export const PERSISTED_QUERY_FAMILIES: readonly string[] = [
  // Home's sections, hero and favourites rows.
  "home",
  // Home's Streamystats rows wait for the server info before they render.
  "jellyfin",
  "streamystats",
  // The Libraries tab: the list, each library's header and its count.
  "user-views",
  "library",
  "library-count",
  "library-data",
  // Music browsing, which the cache is the only offline source for.
  "music-latest",
  "music-recently-played",
  "music-frequently-played",
  "music-artists",
  "music-albums",
  "music-playlists",
  "music-artist",
  "music-artist-albums",
  "music-artist-top-tracks",
  "music-album",
  "music-album-tracks",
  "music-playlist",
  "music-playlist-tracks",
];

/**
 * Pages of an infinite query kept on disk. The first pages are what a screen
 * shows on opening, and a refetch starts from them. Scrolling a library to its
 * end must not turn into a blob that every launch parses. The families in
 * `UNTRIMMED_INFINITE_FAMILIES` are the exception.
 */
export const MAX_PERSISTED_PAGES = 3;

/**
 * Infinite queries written with every page they hold. The music lists are the
 * only offline source for browsing music, and an album, artist or playlist
 * past the cut would be unreachable without a connection.
 */
export const UNTRIMMED_INFINITE_FAMILIES: readonly string[] = [
  "music-albums",
  "music-artists",
  "music-playlists",
];
