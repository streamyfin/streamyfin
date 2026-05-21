import axios, { type AxiosError, type AxiosInstance } from "axios";
import { atom } from "jotai";
import { useAtom } from "jotai/index";
import { inRange } from "lodash";
import type { User as SeerrUser } from "@/utils/jellyseerr/server/entity/User";
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
import { writeErrorLog } from "@/utils/log";

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

const SEERR_USER = "SEERR_USER";
const SEERR_COOKIES = "SEERR_COOKIES";

// One-time migration of the legacy Jellyseerr storage keys to the Seerr-branded
// keys. Runs at module load, before seerrUserAtom reads SEERR_USER, so logged-in
// users keep their session through the rename instead of being silently logged out.
const LEGACY_USER_KEY = "JELLYSEERR_USER";
const LEGACY_COOKIES_KEY = "JELLYSEERR_COOKIES";

function migrateLegacySeerrStorage() {
  const legacyUser = storage.get<SeerrUser>(LEGACY_USER_KEY);
  if (
    legacyUser !== undefined &&
    storage.get<SeerrUser>(SEERR_USER) === undefined
  ) {
    storage.setAny(SEERR_USER, legacyUser);
  }

  const legacyCookies = storage.get<string[]>(LEGACY_COOKIES_KEY);
  if (
    legacyCookies !== undefined &&
    storage.get<string[]>(SEERR_COOKIES) === undefined
  ) {
    storage.setAny(SEERR_COOKIES, legacyCookies);
  }

  storage.remove(LEGACY_USER_KEY);
  storage.remove(LEGACY_COOKIES_KEY);
}

migrateLegacySeerrStorage();

export const clearSeerrStorageData = () => {
  storage.remove(SEERR_USER);
  storage.remove(SEERR_COOKIES);
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

/**
 * Normalizes a URL by ensuring it has a protocol prefix (https:// or http://)
 * @param url - The URL to normalize
 * @returns The normalized URL with protocol prefix
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, ""); // Remove trailing slashes
  if (trimmed.match(/^https?:\/\//i)) {
    return trimmed;
  }
  // Default to https if no protocol is specified
  return `https://${trimmed}`;
}

export class SeerrApi {
  axios: AxiosInstance;

  constructor(baseUrl: string) {
    const normalizedUrl = normalizeUrl(baseUrl);
    this.axios = axios.create({
      baseURL: normalizedUrl,
      withCredentials: true,
      withXSRFToken: true,
      xsrfHeaderName: "XSRF-TOKEN",
    });

    this.setInterceptors();
  }

  async test(): Promise<TestResult> {
    const user = storage.get<SeerrUser>(SEERR_USER);
    const cookies = storage.get<string[]>(SEERR_COOKIES);

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
          if (data.version < "2.0.0") {
            const error = t("seerr.toasts.seer_does_not_meet_requirements");
            toast.error(error);
            throw Error(error);
          }

          storage.setAny(
            SEERR_COOKIES,
            headers["set-cookie"]?.flatMap((c) => c.split("; ")) ?? [],
          );
          return {
            isValid: true,
            requiresPass: true,
          };
        }
        toast.error(t("seerr.toasts.seerr_test_failed"));
        writeErrorLog(
          `Seerr returned a ${status} for url:\n${response.config.url}`,
          response.data,
        );
        return {
          isValid: false,
          requiresPass: false,
        };
      })
      .catch((e) => {
        const msg = t("seerr.toasts.failed_to_test_seerr_server_url");
        toast.error(msg);
        console.error(msg, e);
        return {
          isValid: false,
          requiresPass: false,
        };
      });
  }

  async login(username: string, password: string): Promise<SeerrUser> {
    return this.axios
      ?.post<SeerrUser>(Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN, {
        username,
        password,
        email: username,
      })
      .then((response) => {
        const user = response?.data;
        if (!user) throw Error("Login failed");
        storage.setAny(SEERR_USER, user);
        return user;
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
    return this.axios
      ?.post<MediaRequest>(Endpoints.API_V1 + Endpoints.REQUEST, request)
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
          toast.success(t("seerr.toasts.issue_submitted"));
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
            SEERR_COOKIES,
            response.headers["set-cookie"]?.flatMap((c) => c.split("; ")),
          );
        }
        return response;
      },
      (error: AxiosError) => {
        writeErrorLog(
          `Seerr response error\nerror: ${error.toString()}\nurl: ${error?.config?.url}`,
          error.response?.data,
        );
        if (error.response?.status === 403) {
          clearSeerrStorageData();
        }
        return Promise.reject(error);
      },
    );

    this.axios.interceptors.request.use(
      async (config) => {
        const cookies = storage.get<string[]>(SEERR_COOKIES);
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
        console.error("Seerr request error", error);
        return Promise.reject(error);
      },
    );
  }
}

const seerrUserAtom = atom(storage.get<SeerrUser>(SEERR_USER));

export const useSeerr = () => {
  const { settings, updateSettings } = useSettings();
  const [seerrUser, setSeerrUser] = useAtom(seerrUserAtom);
  const queryClient = useNetworkAwareQueryClient();

  const seerrApi = useMemo(() => {
    const cookies = storage.get<string[]>(SEERR_COOKIES);
    if (settings?.seerrServerUrl && cookies && seerrUser) {
      return new SeerrApi(settings?.seerrServerUrl);
    }
    return undefined;
  }, [settings?.seerrServerUrl, seerrUser]);

  const clearAllSeerrData = useCallback(async () => {
    clearSeerrStorageData();
    setSeerrUser(undefined);
    updateSettings({ seerrServerUrl: undefined });
  }, [setSeerrUser, updateSettings]);

  const requestMedia = useCallback(
    (title: string, request: MediaRequestBody, onSuccess?: () => void) => {
      seerrApi?.request?.(request)?.then(async (mediaRequest) => {
        await queryClient.invalidateQueries({
          queryKey: ["search", "seerr"],
        });

        switch (mediaRequest.status) {
          case MediaRequestStatus.PENDING:
          case MediaRequestStatus.APPROVED:
            toast.success(t("seerr.toasts.requested_item", { item: title }));
            onSuccess?.();
            break;
          case MediaRequestStatus.DECLINED:
            toast.error(t("seerr.toasts.you_dont_have_permission_to_request"));
            break;
          case MediaRequestStatus.FAILED:
            toast.error(
              t("seerr.toasts.something_went_wrong_requesting_media"),
            );
            break;
        }
      });
    },
    [seerrApi, queryClient],
  );

  const isSeerrMovieOrTvResult = useCallback(
    (items: any | null | undefined): items is MovieResult | TvResult => {
      return (
        items &&
        Object.hasOwn(items, "mediaType") &&
        (items.mediaType === MediaType.MOVIE ||
          items.mediaType === MediaType.TV)
      );
    },
    [],
  );

  const getTitle = (
    item?: TvResult | TvDetails | MovieResult | MovieDetails | PersonCreditCast,
  ) => {
    return isSeerrMovieOrTvResult(item)
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
      (isSeerrMovieOrTvResult(item)
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
  ): MediaType => {
    return isSeerrMovieOrTvResult(item)
      ? (item.mediaType as MediaType)
      : item?.mediaInfo?.mediaType;
  };

  const seerrRegion = useMemo(
    // streamingRegion and discoverRegion exists. region doesn't
    () => seerrUser?.settings?.discoverRegion || "US",
    [seerrUser],
  );

  const seerrLocale = useMemo(() => {
    const locale = seerrUser?.settings?.locale || "en";
    // Use regex to check if locale already contains region code (e.g., zh-CN, pt-BR)
    // If not, append the region to create a valid BCP 47 locale string
    return /^[a-z]{2,3}-/i.test(locale) ? locale : `${locale}-${seerrRegion}`;
  }, [seerrUser, seerrRegion]);

  return {
    seerrApi,
    seerrUser,
    setSeerrUser,
    clearAllSeerrData,
    isSeerrMovieOrTvResult,
    getTitle,
    getYear,
    getMediaType,
    seerrRegion,
    seerrLocale,
    requestMedia,
  };
};
