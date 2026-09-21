/**
 * Where the published spec does not describe what a Seerr server sends.
 *
 * Seerr mounts its OpenAPI validator with `validateRequests: true` and nothing
 * on responses, so the response half of the spec is documentation rather than
 * a contract, and it has drifted. Every entry below was measured against a
 * running server rather than read off the spec.
 *
 * Two readers: `types.ts`, which encodes the same gaps as real types, and
 * `contract.test.ts`, which compares them with response shapes captured from a
 * server. A correction that stops being needed fails that test, which is how
 * we find out the day upstream fixes one. The aim is for this file to shrink.
 *
 * Upstream: seerr-team/seerr#3298, and the pull request restoring response
 * validation so the spec stops drifting on its own.
 */
export interface Correction {
  /** ISO date of the measurement behind this entry. */
  measured: string;
  /** Property paths the server sends and the spec does not declare. */
  added: string[];
  /** Paths declared non-nullable that the server sends as `null`. */
  nullable: string[];
  /** Paths declared required that the server does not send. */
  absent: string[];
  /** Paths the spec names differently, spec name then served name. */
  renamed: [string, string][];
  /** Why, in one line. */
  note: string;
}

const none = { added: [], nullable: [], absent: [], renamed: [] };

/**
 * Keyed the way `generated/api-shapes.json` is keyed, so the contract test can
 * put the two side by side without translating between them.
 */
export const CORRECTIONS: Record<string, Correction> = {
  "GET /auth/me": {
    ...none,
    measured: "2026-09-18",
    added: [
      "avatarETag",
      "avatarVersion",
      "displayName",
      "jellyfinUserId",
      "jellyfinUsername",
      "movieQuotaDays",
      "movieQuotaLimit",
      "plexId",
      "recoveryLinkExpirationDate",
      "settings",
      "tvQuotaDays",
      "tvQuotaLimit",
      "warnings",
    ],
    nullable: ["plexUsername", "username"],
    note: "Serves the whole user. The User schema describes neither this nor the filtered shape /user serves.",
  },

  "GET /user": {
    ...none,
    measured: "2026-09-18",
    added: [
      "pageInfo.pageSize",
      "results[].avatarETag",
      "results[].avatarVersion",
      "results[].displayName",
      "results[].jellyfinUserId",
      "results[].jellyfinUsername",
      "results[].movieQuotaDays",
      "results[].movieQuotaLimit",
      "results[].recoveryLinkExpirationDate",
      "results[].tvQuotaDays",
      "results[].tvQuotaLimit",
      "results[].warnings",
    ],
    nullable: ["results[].plexUsername"],
    absent: ["results[].email"],
    note: "Serves the user through User.filteredFields, which strips email, while the schema declares it required.",
  },

  "GET /request": {
    ...none,
    measured: "2026-09-18",
    added: [
      "pageInfo.pageSize",
      "serviceErrors",
      "results[].isAutoRequest",
      "results[].languageProfileId",
      "results[].seasonCount",
      "results[].seasons",
      "results[].tags",
      "results[].type",
    ],
    nullable: [
      "results[].profileId",
      "results[].rootFolder",
      "results[].serverId",
    ],
    note: "A request that no service has picked up yet carries nulls where the schema promises values.",
  },

  "GET /settings/discover": {
    ...none,
    measured: "2026-09-18",
    added: ["[].createdAt", "[].order", "[].updatedAt"],
    note: "order is what the app sorts the sliders by, and it is not declared.",
  },

  "GET /discover/movies": {
    ...none,
    measured: "2026-09-18",
    added: ["keywords"],
    note: "Echoes the keywords it filtered on, at the root beside the results.",
  },

  "GET /discover/tv": {
    ...none,
    measured: "2026-09-18",
    added: ["keywords"],
    note: "Echoes the keywords it filtered on, at the root beside the results.",
  },

  "GET /issue": {
    ...none,
    measured: "2026-09-18",
    added: ["pageInfo.pageSize"],
    note: "PageInfo declares page, pages and results, and every paged route also sends pageSize.",
  },

  "GET /discover/movies/studio/{studioId}": {
    ...none,
    measured: "2026-09-21",
    added: ["studio.description", "studio.headquarters", "studio.homepage"],
    note: "ProductionCompany is declared with four of its seven properties.",
  },

  "GET /discover/tv/network/{networkId}": {
    ...none,
    measured: "2026-09-21",
    added: ["network.headquarters", "network.homepage"],
    note: "Network is declared without the two fields TMDB fills in for a company page.",
  },

  "GET /movie/{movieId}": {
    ...none,
    measured: "2026-09-21",
    added: [
      "keywords",
      "onUserWatchlist",
      "spokenLanguages[].english_name",
      "mediaInfo.downloadStatus",
      "mediaInfo.downloadStatus4k",
      "mediaInfo.externalServiceId",
      "mediaInfo.externalServiceId4k",
      "mediaInfo.externalServiceSlug",
      "mediaInfo.externalServiceSlug4k",
      "mediaInfo.imdbId",
      "mediaInfo.issues",
      "mediaInfo.jellyfinMediaId",
      "mediaInfo.jellyfinMediaId4k",
      "mediaInfo.lastSeasonChange",
      "mediaInfo.mediaAddedAt",
      "mediaInfo.mediaType",
      "mediaInfo.ratingKey",
      "mediaInfo.ratingKey4k",
      "mediaInfo.seasons",
      "mediaInfo.serviceId",
      "mediaInfo.serviceId4k",
      "mediaInfo.serviceUrl",
      "mediaInfo.status4k",
    ],
    renamed: [["watchProviders[][]", "watchProviders[]"]],
    note: "MediaInfo declares 6 of the 25 properties it carries, and watchProviders is declared as an array of arrays where the server sends one array.",
  },

  "GET /tv/{tvId}": {
    ...none,
    measured: "2026-09-21",
    added: [
      "onUserWatchlist",
      "relatedVideos",
      "createdBy[].credit_id",
      "createdBy[].original_name",
      "createdBy[].profile_path",
      "mediaInfo.downloadStatus",
      "mediaInfo.downloadStatus4k",
      "mediaInfo.externalServiceId",
      "mediaInfo.externalServiceId4k",
      "mediaInfo.externalServiceSlug",
      "mediaInfo.externalServiceSlug4k",
      "mediaInfo.imdbId",
      "mediaInfo.issues",
      "mediaInfo.jellyfinMediaId",
      "mediaInfo.jellyfinMediaId4k",
      "mediaInfo.lastSeasonChange",
      "mediaInfo.mediaAddedAt",
      "mediaInfo.mediaType",
      "mediaInfo.ratingKey",
      "mediaInfo.ratingKey4k",
      "mediaInfo.seasons",
      "mediaInfo.serviceId",
      "mediaInfo.serviceId4k",
      "mediaInfo.serviceUrl",
      "mediaInfo.status4k",
    ],
    renamed: [
      ["numberOfSeason", "numberOfSeasons"],
      ["watchProviders[][]", "watchProviders[]"],
    ],
    note: "numberOfSeason is a typo, MediaInfo is as under-declared here as on a film, and watchProviders is declared one array deeper than it is sent.",
  },

  "GET /tv/{tvId}/season/{seasonNumber}": {
    ...none,
    measured: "2026-09-18",
    added: ["externalIds"],
    note: "Season declares the episodes, and the ids of the season on other databases are the one thing it leaves out.",
  },

  "GET /tv/{tvId}/ratings": {
    ...none,
    measured: "2026-09-18",
    added: ["audienceRating", "audienceScore"],
    note: "Rotten Tomatoes sends a critics score and an audience score; only the critics half is declared.",
  },

  "GET /person/{personId}": {
    ...none,
    measured: "2026-09-18",
    added: ["birthday"],
    note: "Declared on PersonResult, missing from PersonDetails.",
  },

  "GET /service/radarr": {
    ...none,
    measured: "2026-09-18",
    added: ["[].activeTags"],
    absent: [
      "[].hostname",
      "[].port",
      "[].apiKey",
      "[].useSsl",
      "[].activeProfileName",
      "[].minimumAvailability",
    ],
    note: "Declares RadarrSettings, serves the seven fields of a common service. Reading the spec here would have the app expect an API key the route never sends.",
  },

  "GET /service/sonarr": {
    ...none,
    measured: "2026-09-18",
    added: ["[].activeTags"],
    absent: [
      "[].hostname",
      "[].port",
      "[].apiKey",
      "[].useSsl",
      "[].activeProfileName",
      "[].enableSeasonFolders",
    ],
    note: "Same as radarr: declares SonarrSettings, serves the common service shape.",
  },
};
