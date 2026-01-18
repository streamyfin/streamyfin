/**
 * OpenSubtitles REST API Client
 * Docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 *
 * This is a fallback for when the Jellyfin server doesn't have a subtitle provider configured.
 */

const OPENSUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1";

export interface OpenSubtitlesSearchParams {
  /** IMDB ID (without "tt" prefix) */
  imdbId?: string;
  /** Title for text search */
  query?: string;
  /** Year of release */
  year?: number;
  /** ISO 639-2B language code (e.g., "eng", "spa") */
  languages?: string;
  /** Season number for TV shows */
  seasonNumber?: number;
  /** Episode number for TV shows */
  episodeNumber?: number;
}

export interface OpenSubtitlesFile {
  file_id: number;
  file_name: string;
}

export interface OpenSubtitlesFeatureDetails {
  imdb_id: number;
  title: string;
  year: number;
  feature_type: string;
  season_number?: number;
  episode_number?: number;
}

export interface OpenSubtitlesAttributes {
  subtitle_id: string;
  language: string;
  download_count: number;
  hearing_impaired: boolean;
  ai_translated: boolean;
  machine_translated: boolean;
  fps: number;
  format: string;
  from_trusted: boolean;
  foreign_parts_only: boolean;
  release: string;
  files: OpenSubtitlesFile[];
  feature_details: OpenSubtitlesFeatureDetails;
  ratings: number;
}

export interface OpenSubtitlesResult {
  id: string;
  type: string;
  attributes: OpenSubtitlesAttributes;
}

export interface OpenSubtitlesSearchResponse {
  total_count: number;
  total_pages: number;
  page: number;
  data: OpenSubtitlesResult[];
}

export interface OpenSubtitlesDownloadResponse {
  link: string;
  file_name: string;
  requests: number;
  remaining: number;
  message: string;
  reset_time: string;
  reset_time_utc: string;
}

export class OpenSubtitlesApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = "OpenSubtitlesApiError";
  }
}

/**
 * OpenSubtitles API client for direct subtitle fetching
 */
export class OpenSubtitlesApi {
  private apiKey: string;
  private userAgent: string;

  constructor(apiKey: string, userAgent = "streamyfin v1.0") {
    this.apiKey = apiKey;
    this.userAgent = userAgent;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${OPENSUBTITLES_API_URL}${endpoint}`;
    const headers: HeadersInit = {
      "Api-Key": this.apiKey,
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OpenSubtitlesApiError(
        `OpenSubtitles API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody,
      );
    }

    return response.json();
  }

  /**
   * Search for subtitles
   * Rate limit: 40 requests / 10 seconds
   */
  async search(
    params: OpenSubtitlesSearchParams,
  ): Promise<OpenSubtitlesSearchResponse> {
    const queryParams = new URLSearchParams();

    if (params.imdbId) {
      // Ensure IMDB ID has correct format (with "tt" prefix)
      const imdbId = params.imdbId.startsWith("tt")
        ? params.imdbId
        : `tt${params.imdbId}`;
      queryParams.set("imdb_id", imdbId);
    }
    if (params.query) {
      queryParams.set("query", params.query);
    }
    if (params.year) {
      queryParams.set("year", params.year.toString());
    }
    if (params.languages) {
      queryParams.set("languages", params.languages);
    }
    if (params.seasonNumber !== undefined) {
      queryParams.set("season_number", params.seasonNumber.toString());
    }
    if (params.episodeNumber !== undefined) {
      queryParams.set("episode_number", params.episodeNumber.toString());
    }

    return this.request<OpenSubtitlesSearchResponse>(
      `/subtitles?${queryParams.toString()}`,
    );
  }

  /**
   * Get download link for a subtitle file
   * Rate limits:
   * - Anonymous: 5 downloads/day
   * - Authenticated: 10 downloads/day (can be increased)
   */
  async download(fileId: number): Promise<OpenSubtitlesDownloadResponse> {
    return this.request<OpenSubtitlesDownloadResponse>("/download", {
      method: "POST",
      body: JSON.stringify({ file_id: fileId }),
    });
  }
}

/**
 * Convert ISO 639-1 (2-letter) to ISO 639-2B (3-letter) language code
 * OpenSubtitles uses ISO 639-2B codes
 */
export function toIso6392B(code: string): string {
  const mapping: Record<string, string> = {
    en: "eng",
    es: "spa",
    fr: "fre",
    de: "ger",
    it: "ita",
    pt: "por",
    ru: "rus",
    ja: "jpn",
    ko: "kor",
    zh: "chi",
    ar: "ara",
    pl: "pol",
    nl: "dut",
    sv: "swe",
    no: "nor",
    da: "dan",
    fi: "fin",
    tr: "tur",
    cs: "cze",
    el: "gre",
    he: "heb",
    hu: "hun",
    ro: "rum",
    th: "tha",
    vi: "vie",
    id: "ind",
    ms: "may",
    bg: "bul",
    hr: "hrv",
    sk: "slo",
    sl: "slv",
    uk: "ukr",
  };

  // If already 3 letters, return as-is
  if (code.length === 3) return code;

  return mapping[code.toLowerCase()] || code;
}

/**
 * Common subtitle languages for display
 */
export const COMMON_SUBTITLE_LANGUAGES = [
  { code: "eng", name: "English" },
  { code: "spa", name: "Spanish" },
  { code: "fre", name: "French" },
  { code: "ger", name: "German" },
  { code: "ita", name: "Italian" },
  { code: "por", name: "Portuguese" },
  { code: "rus", name: "Russian" },
  { code: "jpn", name: "Japanese" },
  { code: "kor", name: "Korean" },
  { code: "chi", name: "Chinese" },
  { code: "ara", name: "Arabic" },
  { code: "pol", name: "Polish" },
  { code: "dut", name: "Dutch" },
  { code: "swe", name: "Swedish" },
  { code: "nor", name: "Norwegian" },
  { code: "dan", name: "Danish" },
  { code: "fin", name: "Finnish" },
  { code: "tur", name: "Turkish" },
  { code: "cze", name: "Czech" },
  { code: "gre", name: "Greek" },
  { code: "heb", name: "Hebrew" },
  { code: "hun", name: "Hungarian" },
  { code: "rom", name: "Romanian" },
  { code: "tha", name: "Thai" },
  { code: "vie", name: "Vietnamese" },
  { code: "ind", name: "Indonesian" },
  { code: "may", name: "Malay" },
  { code: "bul", name: "Bulgarian" },
  { code: "hrv", name: "Croatian" },
  { code: "slo", name: "Slovak" },
  { code: "slv", name: "Slovenian" },
  { code: "ukr", name: "Ukrainian" },
];
