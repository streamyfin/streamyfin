import axios, { type AxiosError, type AxiosInstance } from "axios";
import { atom, useAtomValue } from "jotai";
import { useAtom } from "jotai/index";
import { inRange } from "lodash";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";
import type {
  MovieResult,
  Results,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { storage } from "@/utils/mmkv";
import "@/augmentations";
import { t } from "i18next";
import { useCallback, useMemo } from "react";
import { toast } from "sonner-native";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useSettings } from "@/utils/atoms/settings";
import {
  customHeadersVersionAtom,
  getIntegrationHeaders,
} from "@/utils/customHeaders";
import type { RTRating } from "@/utils/jellyseerr/server/api/rating/rottentomatoes";
import {
  IssueStatus,
  type IssueType,
} from "@/utils/jellyseerr/server/constants/issue";
import {
  MediaRequestStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import type Issue from "@/utils/jellyseerr/server/entity/Issue";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { GenreSliderItem } from "@/utils/jellyseerr/server/interfaces/api/discoverInterfaces";
import type {
  MediaRequestBody,
  RequestResultsResponse,
} from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import type {
  ServiceCommonServer,
  ServiceCommonServerWithDetails,
} from "@/utils/jellyseerr/server/interfaces/api/serviceInterfaces";
import type { UserResultsResponse } from "@/utils/jellyseerr/server/interfaces/api/userInterfaces";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type {
  CombinedCredit,
  PersonCreditCast,
  PersonDetails,
} from "@/utils/jellyseerr/server/models/Person";
import type {
  SeasonWithEpisodes,
  TvDetails,
} from "@/utils/jellyseerr/server/models/Tv";
import { logAndCaptureError, writeErrorLog, writeToLog } from "@/utils/log";
import { isVersionBelow } from "@/utils/serverUrl/semver";

interface SearchParams {
  query: string;
  page: number;
  // language: string;
}

interface SearchResults {
  page: number;
  totalPages: number;
  totalResults: number;
  results: Results[];
}

const JELLYSEERR_USER = "JELLYSEERR_USER";
const JELLYSEERR_COOKIES = "JELLYSEERR_COOKIES";

export const clearJellyseerrStorageData = () => {
  storage.remove(JELLYSEERR_USER);
  storage.remove(JELLYSEERR_COOKIES);
};

export enum Endpoints {
  STATUS = "/status",
  API_V1 = "/api/v1",
  SEARCH = "/search",
  REQUEST = "/request",
  PERSON = "/person",
  COMBINED_CREDITS = "/combined_credits",
  MOVIE = "/movie",
  RATINGS = "/ratings",
  ISSUE = "/issue",
  USER = "/user",
  SERVICE = "/service",
  TV = "/tv",
  SETTINGS = "/settings",
  NETWORK = "/network",
  STUDIO = "/studio",
  GENRE_SLIDER = "/genreslider",
  DISCOVER = "/discover",
  DISCOVER_TRENDING = `${DISCOVER}/trending`,
  DISCOVER_MOVIES = `${DISCOVER}/movies`,
  DISCOVER_TV = DISCOVER + TV,
  DISCOVER_TV_NETWORK = DISCOVER + TV + NETWORK,
  DISCOVER_MOVIES_STUDIO = `${DISCOVER}${MOVIE}s${STUDIO}`,
  AUTH_JELLYFIN = "/auth/jellyfin",
  USER_JELLYFIN = `${USER}/jellyfin`,
}

export type DiscoverEndpoint =
  | Endpoints.DISCOVER_TV_NETWORK
  | Endpoints.DISCOVER_TRENDING
  | Endpoints.DISCOVER_MOVIES
  | Endpoints.DISCOVER_TV;

export type TestResult =
  | {
      isValid: true;
      requiresPass: boolean;
    }
  | {
      isValid: false;
    };

// The response interceptor fires once per axios attempt, and React Query
// retries a failing request up to 3× — without a throttle one user-visible
// failure emits several Sentry events. 401/403 are excluded entirely:
// expired cookies are routine and self-heal via auto-login.
const recentJellyseerrReports = new Map<string, number>();
const JELLYSEERR_REPORT_THROTTLE_MS = 60_000;

const shouldReportJellyseerrError = (
  status: number | undefined,
  path: string | undefined,
): boolean => {
  if (status === 401 || status === 403) return false;
  const key = `${status}|${path}`;
  const now = Date.now();
  const last = recentJellyseerrReports.get(key);
  if (last !== undefined && now - last < JELLYSEERR_REPORT_THROTTLE_MS) {
    return false;
  }
  recentJellyseerrReports.set(key, now);
  return true;
};

const truncateForLog = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
};

export class JellyseerrApi {
  axios: AxiosInstance;
  /** Proxy auth headers for a Jellyseerr behind an access gateway. */
  private customHeaders: Record<string, string>;
  /** Admin API key: authenticates every call without a session cookie. */
  private apiKey?: string;
  /**
   * API-key calls act as the key's owner, so requests must carry the Seerr id
   * of the signed-in user to be attributed to them.
   */
  actAsUserId?: number;

  constructor(
    baseUrl: string,
    customHeaders?: Record<string, string>,
    apiKey?: string,
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      withCredentials: true,
      withXSRFToken: true,
      xsrfHeaderName: "XSRF-TOKEN",
    });
    this.customHeaders = customHeaders ?? {};
    this.apiKey = apiKey;

    this.setInterceptors();
  }

  async test(): Promise<TestResult> {
    const user = storage.get<JellyseerrUser>(JELLYSEERR_USER);
    const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);

    if (user && cookies) {
      return Promise.resolve({
        isValid: true,
        requiresPass: false,
      });
    }

    return await this.axios
      .get(Endpoints.API_V1 + Endpoints.STATUS)
      .then((response) => {
        const { status, headers, data } = response;
        if (inRange(status, 200, 299)) {
          if (data.version && isVersionBelow(data.version, "2.0.0")) {
            writeErrorLog(
              `Jellyseerr version ${data.version} is below the required 2.0.0`,
            );
            toast.error(
              t("jellyseerr.toasts.jellyseerr_does_not_meet_requirements"),
            );
            // Return rather than throw: the catch below exists for transport
            // failures and would stack a second, misleading "could not test
            // the server URL" toast on top of this precise one.
            return {
              isValid: false,
              requiresPass: false,
            };
          }

          storage.setAny(
            JELLYSEERR_COOKIES,
            headers["set-cookie"]?.flatMap((c) => c.split("; ")) ?? [],
          );
          return {
            isValid: true,
            requiresPass: true,
          };
        }
        toast.error(t("jellyseerr.toasts.jellyseerr_test_failed"));
        writeErrorLog(
          `Jellyseerr returned a ${status} for url:\n${response.config.url}`,
          response.data,
        );
        return {
          isValid: false,
          requiresPass: false,
        };
      })
      .catch((e) => {
        const msg = t("jellyseerr.toasts.failed_to_test_jellyseerr_server_url");
        toast.error(msg);
        console.error(msg, e);
        return {
          isValid: false,
          requiresPass: false,
        };
      });
  }

  async login(username: string, password: string): Promise<JellyseerrUser> {
    return this.axios
      ?.post<JellyseerrUser>(Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN, {
        username,
        password,
        email: username,
      })
      .then((response) => {
        const user = response?.data;
        if (!user) throw Error("Login failed");
        storage.setAny(JELLYSEERR_USER, user);
        return user;
      });
  }

  /**
   * Passwordless sign-in: resolve the Seerr account linked to a Jellyfin user
   * through GET /user/jellyfin/{jellyfinUserId}. Needs the admin API key; the
   * route 404s on Seerr servers that predate it.
   */
  async loginWithApiKey(jellyfinUserId: string): Promise<JellyseerrUser> {
    return this.axios
      .get<JellyseerrUser>(
        `${Endpoints.API_V1}${Endpoints.USER_JELLYFIN}/${jellyfinUserId}`,
      )
      .then(({ data }) => {
        if (!data) throw Error("Login failed");
        storage.setAny(JELLYSEERR_USER, data);
        return data;
      });
  }

  async discoverSettings(): Promise<DiscoverSlider[]> {
    return this.axios
      ?.get<DiscoverSlider[]>(
        Endpoints.API_V1 + Endpoints.SETTINGS + Endpoints.DISCOVER,
      )
      .then(({ data }) => data);
  }

  async discover(
    endpoint: DiscoverEndpoint | string,
    params: any,
  ): Promise<SearchResults> {
    return this.axios
      ?.get<SearchResults>(Endpoints.API_V1 + endpoint, { params })
      .then(({ data }) => data);
  }

  async getGenreSliders(
    endpoint: Endpoints.TV | Endpoints.MOVIE,
    params: any = undefined,
  ): Promise<GenreSliderItem[]> {
    return this.axios
      ?.get<GenreSliderItem[]>(
        Endpoints.API_V1 +
          Endpoints.DISCOVER +
          Endpoints.GENRE_SLIDER +
          endpoint,
        { params },
      )
      .then(({ data }) => data);
  }

  async search(params: SearchParams): Promise<SearchResults> {
    return this.axios
      ?.get<SearchResults>(Endpoints.API_V1 + Endpoints.SEARCH, { params })
      .then(({ data }) => data);
  }

  async request(request: MediaRequestBody): Promise<MediaRequest> {
    const body =
      this.apiKey && this.actAsUserId != null && request.userId == null
        ? { ...request, userId: this.actAsUserId }
        : request;
    return this.axios
      ?.post<MediaRequest>(Endpoints.API_V1 + Endpoints.REQUEST, body)
      .then(({ data }) => data);
  }

  async getRequest(id: number): Promise<MediaRequest> {
    return this.axios
      ?.get<MediaRequest>(`${Endpoints.API_V1 + Endpoints.REQUEST}/${id}`)
      .then(({ data }) => data);
  }

  async approveRequest(requestId: number): Promise<MediaRequest> {
    return this.axios
      ?.post<MediaRequest>(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${requestId}/approve`,
      )
      .then(({ data }) => data);
  }

  async declineRequest(requestId: number): Promise<MediaRequest> {
    return this.axios
      ?.post<MediaRequest>(
        `${Endpoints.API_V1 + Endpoints.REQUEST}/${requestId}/decline`,
      )
      .then(({ data }) => data);
  }

  async requests(
    params = {
      filter: "all",
      take: 10,
      sort: "modified",
      skip: 0,
    },
  ): Promise<RequestResultsResponse> {
    return this.axios
      ?.get<RequestResultsResponse>(Endpoints.API_V1 + Endpoints.REQUEST, {
        params,
      })
      .then(({ data }) => data);
  }

  async movieDetails(id: number) {
    return this.axios
      ?.get<MovieDetails>(`${Endpoints.API_V1 + Endpoints.MOVIE}/${id}`)
      .then((response) => {
        return response?.data;
      });
  }

  async personDetails(id: number | string): Promise<PersonDetails> {
    return this.axios
      ?.get<PersonDetails>(`${Endpoints.API_V1 + Endpoints.PERSON}/${id}`)
      .then((response) => {
        return response?.data;
      });
  }

  async personCombinedCredits(id: number | string): Promise<CombinedCredit> {
    return this.axios
      ?.get<CombinedCredit>(
        `${
          Endpoints.API_V1 + Endpoints.PERSON
        }/${id}${Endpoints.COMBINED_CREDITS}`,
      )
      .then((response) => {
        return response?.data;
      });
  }

  async movieRatings(id: number) {
    return this.axios
      ?.get<RTRating>(
        `${Endpoints.API_V1}${Endpoints.MOVIE}/${id}${Endpoints.RATINGS}`,
      )
      .then(({ data }) => data);
  }

  async tvDetails(id: number) {
    return this.axios
      ?.get<TvDetails>(`${Endpoints.API_V1}${Endpoints.TV}/${id}`)
      .then((response) => {
        return response?.data;
      });
  }

  async tvRatings(id: number) {
    return this.axios
      ?.get<RTRating>(
        `${Endpoints.API_V1}${Endpoints.TV}/${id}${Endpoints.RATINGS}`,
      )
      .then(({ data }) => data);
  }

  async tvSeason(id: number, seasonId: number) {
    return this.axios
      ?.get<SeasonWithEpisodes>(
        `${Endpoints.API_V1}${Endpoints.TV}/${id}/season/${seasonId}`,
      )
      .then((response) => {
        return response?.data;
      });
  }

  async user(params: any) {
    return this.axios
      ?.get<UserResultsResponse>(`${Endpoints.API_V1}${Endpoints.USER}`, {
        params,
      })
      .then(({ data }) => data.results);
  }

  imageProxy(path?: string, filter = "original", width = 1920, quality = 75) {
    return path
      ? `${this.axios.defaults.baseURL}/_next/image?${new URLSearchParams(
          `url=https://image.tmdb.org/t/p/${filter}/${path}&w=${width}&q=${quality}`,
        ).toString()}`
      : `${this.axios?.defaults.baseURL}/images/overseerr_poster_not_found_logo_top.png`;
  }

  async submitIssue(mediaId: number, issueType: IssueType, message: string) {
    return this.axios
      ?.post<Issue>(Endpoints.API_V1 + Endpoints.ISSUE, {
        mediaId,
        issueType,
        message,
      })
      .then((response) => {
        const issue = response.data;

        if (issue.status === IssueStatus.OPEN) {
          toast.success(t("jellyseerr.toasts.issue_submitted"));
        }
        return issue;
      });
  }

  async service(type: "radarr" | "sonarr") {
    return this.axios
      ?.get<ServiceCommonServer[]>(
        `${Endpoints.API_V1 + Endpoints.SERVICE}/${type}`,
      )
      .then(({ data }) => data);
  }

  async serviceDetails(type: "radarr" | "sonarr", id: number) {
    return this.axios
      ?.get<ServiceCommonServerWithDetails>(
        `${Endpoints.API_V1 + Endpoints.SERVICE}/${type}/${id}`,
      )
      .then(({ data }) => data);
  }

  private setInterceptors() {
    this.axios.interceptors.response.use(
      async (response) => {
        const cookies = response.headers["set-cookie"];
        if (cookies) {
          storage.setAny(
            JELLYSEERR_COOKIES,
            response.headers["set-cookie"]?.flatMap((c) => c.split("; ")),
          );
        }
        return response;
      },
      (error: AxiosError) => {
        const status = error.response?.status;
        const path = error.config?.url?.split("?")[0];
        if (error.response && shouldReportJellyseerrError(status, path)) {
          // A real server response — one capture covers the entire
          // Jellyseerr surface. 401/403 are excluded (expired cookies are
          // routine and self-heal via auto-login), and repeats of the same
          // status+path are throttled: this fires once per axios attempt,
          // so React Query retries would otherwise emit several events for
          // one user-visible failure.
          logAndCaptureError("Jellyseerr response error", error, {
            status,
            // Relative URLs escape the scheme-anchored scrubber, and search
            // requests put the user's typed query in the query string.
            url: path,
          });
        } else if (!error.response) {
          // No response = connectivity; routine when away from the server,
          // so keep it out of Sentry but in the local log trail.
          writeToLog("WARN", `Jellyseerr unreachable: ${error.toString()}`);
        }
        if (error.response) {
          // Body stays local-only and truncated — a proxy's HTML error page
          // must not bloat the 100-entry log blob.
          writeToLog(
            "DEBUG",
            "Jellyseerr response body",
            truncateForLog(error.response.data),
          );
        }
        if (error.response?.status === 403) {
          clearJellyseerrStorageData();
        }
        return Promise.reject(error);
      },
    );

    this.axios.interceptors.request.use(
      async (config) => {
        // set() rather than index assignment so axios normalizes the name and
        // a differently-cased duplicate cannot be emitted twice.
        for (const [key, value] of Object.entries(this.customHeaders)) {
          config.headers.set(key, value);
        }

        if (this.apiKey) {
          config.headers.set("X-Api-Key", this.apiKey);
        }

        const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);
        if (cookies) {
          const headerName = this.axios.defaults.xsrfHeaderName!;
          const xsrfToken = cookies
            .find((c) => c.includes(headerName))
            ?.split(`${headerName}=`)?.[1];
          if (xsrfToken) {
            config.headers[headerName] = xsrfToken;
          }
        }
        return config;
      },
      (error) => {
        logAndCaptureError("Jellyseerr request setup failed", error);
        // Without re-rejecting, axios would proceed with an undefined config
        // and fail somewhere unrelated.
        return Promise.reject(error);
      },
    );
  }
}

const jellyseerrUserAtom = atom(storage.get<JellyseerrUser>(JELLYSEERR_USER));

export const useJellyseerr = () => {
  const { settings, updateSettings } = useSettings();
  const [jellyseerrUser, setJellyseerrUser] = useAtom(jellyseerrUserAtom);
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const queryClient = useNetworkAwareQueryClient();

  const jellyseerrApi = useMemo(() => {
    const cookies = storage.get<string[]>(JELLYSEERR_COOKIES);
    const apiKey = settings?.jellyseerrApiKey;
    if (
      settings?.jellyseerrServerUrl &&
      jellyseerrUser &&
      (cookies || apiKey)
    ) {
      const api = new JellyseerrApi(
        settings.jellyseerrServerUrl,
        getIntegrationHeaders("jellyseerr"),
        apiKey,
      );
      api.actAsUserId = jellyseerrUser.id;
      return api;
    }
    return undefined;
    // customHeadersVersion: rebuild the client when the headers change.
  }, [
    settings?.jellyseerrServerUrl,
    settings?.jellyseerrApiKey,
    jellyseerrUser,
    customHeadersVersion,
  ]);

  const clearAllJellyseerData = useCallback(async () => {
    clearJellyseerrStorageData();
    setJellyseerrUser(undefined);
    updateSettings({
      jellyseerrServerUrl: undefined,
      jellyseerrApiKey: undefined,
    });
  }, []);

  const requestMedia = useCallback(
    (title: string, request: MediaRequestBody, onSuccess?: () => void) => {
      jellyseerrApi?.request?.(request)?.then(async (mediaRequest) => {
        await queryClient.invalidateQueries({
          queryKey: ["search", "jellyseerr"],
        });

        switch (mediaRequest.status) {
          case MediaRequestStatus.PENDING:
          case MediaRequestStatus.APPROVED:
            toast.success(
              t("jellyseerr.toasts.requested_item", { item: title }),
            );
            onSuccess?.();
            break;
          case MediaRequestStatus.DECLINED:
            toast.error(
              t("jellyseerr.toasts.you_dont_have_permission_to_request"),
            );
            break;
          case MediaRequestStatus.FAILED:
            toast.error(
              t("jellyseerr.toasts.something_went_wrong_requesting_media"),
            );
            break;
        }
      });
    },
    [jellyseerrApi],
  );

  const isJellyseerrMovieOrTvResult = (
    items: any | null | undefined,
  ): items is MovieResult | TvResult => {
    return (
      items &&
      Object.hasOwn(items, "mediaType") &&
      (items.mediaType === MediaType.MOVIE || items.mediaType === MediaType.TV)
    );
  };

  const getTitle = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ) => {
    return isJellyseerrMovieOrTvResult(item)
      ? item.mediaType === MediaType.MOVIE
        ? item?.title
        : item?.name
      : item?.mediaInfo?.mediaType === MediaType.MOVIE
        ? (item as MovieDetails)?.title
        : (item as TvDetails)?.name;
  };

  const getYear = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ) => {
    return new Date(
      (isJellyseerrMovieOrTvResult(item)
        ? item.mediaType === MediaType.MOVIE
          ? item?.releaseDate
          : item?.firstAirDate
        : item?.mediaInfo?.mediaType === MediaType.MOVIE
          ? (item as MovieDetails)?.releaseDate
          : (item as TvDetails)?.firstAirDate) || "",
    )?.getFullYear?.();
  };

  const getMediaType = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ): MediaType | undefined => {
    if (!item) return undefined;
    // Check direct mediaType (MovieResult/TvResult), then mediaInfo (Details), then infer from properties
    if (isJellyseerrMovieOrTvResult(item)) {
      return item.mediaType as MediaType;
    }
    if (item.mediaInfo?.mediaType) {
      return item.mediaInfo.mediaType;
    }
    // Fallback: movies have 'title', TV shows have 'name'
    if ("title" in item && item.title) return MediaType.MOVIE;
    if ("name" in item && item.name) return MediaType.TV;
    return undefined;
  };

  const jellyseerrRegion = useMemo(
    // streamingRegion and discoverRegion exists. region doesn't
    () => jellyseerrUser?.settings?.discoverRegion || "US",
    [jellyseerrUser],
  );

  const jellyseerrLocale = useMemo(() => {
    return jellyseerrUser?.settings?.locale || "en";
  }, [jellyseerrUser]);

  return {
    jellyseerrApi,
    jellyseerrUser,
    setJellyseerrUser,
    clearAllJellyseerData,
    isJellyseerrMovieOrTvResult,
    getTitle,
    getYear,
    getMediaType,
    jellyseerrRegion,
    jellyseerrLocale,
    requestMedia,
  };
};
