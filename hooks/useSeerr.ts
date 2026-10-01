import axios, { type AxiosError, type AxiosInstance } from "axios";
import { atom, useAtomValue } from "jotai";
import { useAtom } from "jotai/index";
import { inRange } from "lodash";
import { Image } from "react-native";
import {
  SEERR_COOKIES_STORAGE_KEY,
  SEERR_IMAGE_QUALITY,
  SEERR_USER_STORAGE_KEY,
} from "@/constants/Seerr";
import { storage } from "@/utils/mmkv";
import type { Results, User as SeerrUser } from "@/utils/seerr/types";
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
import { logAndCaptureError, writeErrorLog, writeToLog } from "@/utils/log";
import { tmdbImageUrl } from "@/utils/seerr/images";
import {
  isMovieOrTvResult,
  mediaTypeOf,
  titleOf,
  yearOf,
} from "@/utils/seerr/media";
import { isSeerrQuery, touchedByRequest } from "@/utils/seerr/queries";
import { endsSeerrSession, sendSeerrRequest } from "@/utils/seerr/requestFlow";
import { seerrQueryString } from "@/utils/seerr/search";
import { rememberSeerrSession } from "@/utils/seerr/session";
import type {
  CombinedCredit,
  DiscoverSlider,
  GenreSliderItem,
  Issue,
  MediaRequest,
  MediaRequestBody,
  MediaResultsResponse,
  MovieDetails,
  PersonDetails,
  PublicSettings,
  QuotaResponse,
  RequestResultsResponse,
  RTRating,
  SeasonWithEpisodes,
  ServiceCommonServer,
  ServiceCommonServerWithDetails,
  TvDetails,
  UserResultsResponse,
} from "@/utils/seerr/types";
import { IssueStatus, type IssueType } from "@/utils/seerr/types";
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

// The app's own placeholder for an image Seerr has none of. The server's
// changed name twice (overseerr_ up to Jellyseerr 2.3, jellyseerr_ up to 2.7,
// seerr_ since Seerr 3), and a name it does not know answers with its HTML
// page, a broken image.
const POSTER_PLACEHOLDER = Image.resolveAssetSource(
  require("@/assets/images/seerr-poster-placeholder.png"),
).uri;

export const clearSeerrStorageData = () => {
  storage.remove(SEERR_USER_STORAGE_KEY);
  storage.remove(SEERR_COOKIES_STORAGE_KEY);
};

export enum Endpoints {
  STATUS = "/status",
  API_V1 = "/api/v1",
  SEARCH = "/search",
  REQUEST = "/request",
  MEDIA = "/media",
  PERSON = "/person",
  COMBINED_CREDITS = "/combined_credits",
  MOVIE = "/movie",
  RATINGS = "/ratings",
  ISSUE = "/issue",
  USER = "/user",
  SERVICE = "/service",
  TV = "/tv",
  SETTINGS = "/settings",
  PUBLIC = "/public",
  QUOTA = "/quota",
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
  AUTH_JELLYFIN_QUICK_CONNECT_INITIATE = `${AUTH_JELLYFIN}/quickconnect/initiate`,
  AUTH_JELLYFIN_QUICK_CONNECT_AUTHENTICATE = `${AUTH_JELLYFIN}/quickconnect/authenticate`,
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
const recentSeerrReports = new Map<string, number>();
const SEERR_REPORT_THROTTLE_MS = 60_000;

const shouldReportSeerrError = (
  status: number | undefined,
  path: string | undefined,
  method?: string,
): boolean => {
  if (status === 401 || status === 403) return false;
  // Answers Seerr gives in the normal course of business, not defects:
  // - /ratings 404/500: no Rotten Tomatoes entry for the title (404) or its
  //   ratings upstream failed (500) — the badge simply doesn't render.
  // - /user/jellyfin/:id 404: Seerr servers predating the route (seerr#2074);
  //   the caller falls back to password login.
  // - /auth/jellyfin/quickconnect/initiate 404: Seerr predating 3.4.0; the
  //   caller falls back to the key or the password.
  // - POST /request 400: request validation (already requested, no seasons
  //   selected) — the request flow surfaces it to the user.
  if (path?.endsWith(Endpoints.RATINGS) && (status === 404 || status === 500))
    return false;
  if (status === 404 && path?.includes(Endpoints.USER_JELLYFIN)) return false;
  if (
    status === 404 &&
    path?.endsWith(Endpoints.AUTH_JELLYFIN_QUICK_CONNECT_INITIATE)
  )
    return false;
  if (
    status === 400 &&
    method?.toUpperCase() === "POST" &&
    path?.endsWith(Endpoints.REQUEST)
  )
    return false;
  const key = `${status}|${path}`;
  const now = Date.now();
  const last = recentSeerrReports.get(key);
  if (last !== undefined && now - last < SEERR_REPORT_THROTTLE_MS) {
    return false;
  }
  recentSeerrReports.set(key, now);
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

export class SeerrApi {
  axios: AxiosInstance;
  /** Proxy auth headers for a Seerr behind an access gateway. */
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
    const user = storage.get<SeerrUser>(SEERR_USER_STORAGE_KEY);
    const cookies = storage.get<string[]>(SEERR_COOKIES_STORAGE_KEY);

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
              `Seerr version ${data.version} is below the required 2.0.0`,
            );
            toast.error(t("seerr.toasts.seerr_does_not_meet_requirements"));
            // Return rather than throw: the catch below exists for transport
            // failures and would stack a second, misleading "could not test
            // the server URL" toast on top of this precise one.
            return {
              isValid: false,
              requiresPass: false,
            };
          }

          storage.setAny(
            SEERR_COOKIES_STORAGE_KEY,
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
        this.remember(user);
        return user;
      });
  }

  /**
   * Passwordless sign-in: resolve the Seerr account linked to a Jellyfin user
   * through GET /user/jellyfin/{jellyfinUserId}. Needs the admin API key; the
   * route 404s on Seerr servers that predate it.
   */
  async loginWithApiKey(jellyfinUserId: string): Promise<SeerrUser> {
    return this.axios
      .get<SeerrUser>(
        `${Endpoints.API_V1}${Endpoints.USER_JELLYFIN}/${jellyfinUserId}`,
      )
      .then(({ data }) => {
        if (!data) throw Error("Login failed");
        storage.setAny(SEERR_USER_STORAGE_KEY, data);
        return data;
      });
  }

  /**
   * One GET, for the cookies. Seerr with CSRF protection on hands out its token
   * on every response and expects it back on every POST, so a client that has
   * only ever POSTed never gets one. The response interceptor stores whatever
   * arrives, which is why nothing is read here.
   */
  async prime(): Promise<void> {
    await this.axios.get(Endpoints.API_V1 + Endpoints.STATUS);
  }

  /**
   * Quick Connect sign-in, first half: Seerr asks its own Jellyfin server for a
   * code, and this device approves it with the token it already holds.
   *
   * Undefined rather than a throw on a 404, which is how a Seerr older than
   * 3.4.0 says it has no such route. Only a 404 counts: a server that is down
   * must not be mistaken for one that is merely old, and a 200 whose body has
   * no code or secret is a broken 3.4.0, not a missing route, so it throws
   * rather than reading as an absent one in the log.
   */
  async initiateQuickConnect(): Promise<
    { code: string; secret: string } | undefined
  > {
    try {
      const { data } = await this.axios.post<{ code: string; secret: string }>(
        Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN_QUICK_CONNECT_INITIATE,
      );
      if (data?.code && data?.secret) return data;
      throw new Error("Quick Connect initiate returned no code or secret");
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return undefined;
      throw e;
    }
  }

  /**
   * Quick Connect sign-in, second half: the approved secret becomes an ordinary
   * Seerr session for the Jellyfin user who approved it.
   *
   * A session per device, which is the part an API key acting as its owner
   * could never give: two devices sharing one key share one identity, and the
   * only thing separating them is a header the client fills in itself.
   *
   * Nothing is stored here, unlike the other two sign-ins. Three round trips
   * pass between the start of this flow and its end, which is long enough for
   * the user to log out or switch account, so whether the result still belongs
   * to anyone is the caller's to decide.
   */
  async authenticateQuickConnect(secret: string): Promise<SeerrUser> {
    const { data } = await this.axios.post<SeerrUser>(
      Endpoints.API_V1 + Endpoints.AUTH_JELLYFIN_QUICK_CONNECT_AUTHENTICATE,
      { secret },
    );
    if (!data) throw Error("Login failed");
    return data;
  }

  /** Persists a session this client just opened. */
  remember(user: SeerrUser) {
    rememberSeerrSession(storage, user);
  }

  /** Drops the stored Seerr session, cookies included. */
  forget() {
    clearSeerrStorageData();
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

  /** What the server makes public: whether it shows specials, takes partial requests. */
  async publicSettings(): Promise<PublicSettings | undefined> {
    return this.axios
      ?.get<PublicSettings>(
        `${Endpoints.API_V1}${Endpoints.SETTINGS}${Endpoints.PUBLIC}`,
      )
      .then(({ data }) => data);
  }

  /** A user's quotas. Another user's takes Manage Users and Manage Requests. */
  async userQuota(userId: number): Promise<QuotaResponse | undefined> {
    return this.axios
      ?.get<QuotaResponse>(
        `${Endpoints.API_V1}${Endpoints.USER}/${userId}${Endpoints.QUOTA}`,
      )
      .then(({ data }) => data);
  }

  async search(params: SearchParams): Promise<SearchResults> {
    // Written by hand: axios would send a space as "+", which Seerr refuses.
    return this.axios
      ?.get<SearchResults>(
        `${Endpoints.API_V1}${Endpoints.SEARCH}?${seerrQueryString({ ...params })}`,
      )
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

  /**
   * What the library gained last, the way Seerr's recently added row asks
   * for it (RecentlyAddedSlider).
   */
  async recentlyAdded(): Promise<MediaResultsResponse> {
    return this.axios
      ?.get<MediaResultsResponse>(Endpoints.API_V1 + Endpoints.MEDIA, {
        params: { filter: "allavailable", take: 20, sort: "mediaAdded" },
      })
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
    // Seerr's recent requests row: the ones added last.
    params = {
      filter: "all",
      take: 10,
      sort: "added",
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

  imageProxy(
    path?: string | null,
    filter = "original",
    width = 1920,
    quality = SEERR_IMAGE_QUALITY,
  ) {
    return (
      tmdbImageUrl(this.axios.defaults.baseURL ?? "", path, {
        filter,
        width,
        quality,
      }) ?? POSTER_PLACEHOLDER
    );
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
            SEERR_COOKIES_STORAGE_KEY,
            response.headers["set-cookie"]?.flatMap((c) => c.split("; ")),
          );
        }
        return response;
      },
      (error: AxiosError) => {
        const status = error.response?.status;
        const path = error.config?.url?.split("?")[0];
        if (
          error.response &&
          shouldReportSeerrError(status, path, error.config?.method)
        ) {
          // A real server response — one capture covers the entire
          // Seerr surface. 401/403 are excluded (expired cookies are
          // routine and self-heal via auto-login), and repeats of the same
          // status+path are throttled: this fires once per axios attempt,
          // so React Query retries would otherwise emit several events for
          // one user-visible failure.
          logAndCaptureError("Seerr response error", error, {
            status,
            // Relative URLs escape the scheme-anchored scrubber, and search
            // requests put the user's typed query in the query string.
            url: path,
          });
        } else if (!error.response) {
          // No response = connectivity; routine when away from the server,
          // so keep it out of Sentry but in the local log trail.
          writeToLog("WARN", `Seerr unreachable: ${error.toString()}`);
        }
        if (error.response) {
          // Body stays local-only and truncated — a proxy's HTML error page
          // must not bloat the 100-entry log blob.
          writeToLog(
            "DEBUG",
            "Seerr response body",
            truncateForLog(error.response.data),
          );
        }
        // Only a read refused means the session is gone: a request past the
        // quota is refused with a 403 too, and signed the user out of Seerr.
        if (endsSeerrSession(status, error.config?.method, path)) {
          clearSeerrStorageData();
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

        const cookies = storage.get<string[]>(SEERR_COOKIES_STORAGE_KEY);
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
        logAndCaptureError("Seerr request setup failed", error);
        // Without re-rejecting, axios would proceed with an undefined config
        // and fail somewhere unrelated.
        return Promise.reject(error);
      },
    );
  }
}

const seerrUserAtom = atom(storage.get<SeerrUser>(SEERR_USER_STORAGE_KEY));

export const useSeerr = () => {
  const { settings, updateSettings } = useSettings();
  const [seerrUser, setSeerrUser] = useAtom(seerrUserAtom);
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const queryClient = useNetworkAwareQueryClient();

  const seerrApi = useMemo(() => {
    const cookies = storage.get<string[]>(SEERR_COOKIES_STORAGE_KEY);
    const apiKey = settings?.seerrApiKey;
    if (settings?.seerrServerUrl && seerrUser && (cookies || apiKey)) {
      const api = new SeerrApi(
        settings.seerrServerUrl,
        getIntegrationHeaders("seerr"),
        apiKey,
      );
      api.actAsUserId = seerrUser.id;
      return api;
    }
    return undefined;
    // customHeadersVersion: rebuild the client when the headers change.
  }, [
    settings?.seerrServerUrl,
    settings?.seerrApiKey,
    seerrUser,
    customHeadersVersion,
  ]);

  const clearAllSeerrData = useCallback(async () => {
    clearSeerrStorageData();
    // The cache outlives the session, on the device for a day: the next
    // Seerr would show this one's quota, seasons and settings.
    queryClient.removeQueries({
      predicate: (query) => isSeerrQuery(query.queryKey),
    });
    setSeerrUser(undefined);
    updateSettings({
      seerrServerUrl: undefined,
      seerrApiKey: undefined,
    });
  }, [queryClient]);

  // Marks what a request, an approval or a decline changed as stale, so each
  // page shows it once the user is back there, and an open sheet's quota at
  // once.
  const refreshAfterRequest = useCallback(
    (title?: { mediaType: string; mediaId: number }) =>
      queryClient.invalidateQueries({
        predicate: (query) => touchedByRequest(title)(query.queryKey),
      }),
    [queryClient],
  );

  // Resolves once Seerr has answered, for a sheet to know the request ended,
  // or at once when the same request is already on its way.
  const requestMedia = useCallback(
    (
      title: string,
      request: MediaRequestBody,
      onSuccess?: () => void,
    ): Promise<void> => {
      if (!seerrApi) return Promise.resolve();
      return sendSeerrRequest({
        key: JSON.stringify(request),
        send: () => seerrApi.request(request),
        refresh: () =>
          refreshAfterRequest({
            mediaType: request.mediaType,
            mediaId: request.mediaId,
          }),
        onOutcome: (outcome) => {
          switch (outcome.kind) {
            case "requested":
              toast.success(t("seerr.toasts.requested_item", { item: title }));
              onSuccess?.();
              break;
            case "declined":
              toast.error(
                t("seerr.toasts.you_dont_have_permission_to_request"),
              );
              break;
            case "failed":
              toast.error(
                t("seerr.toasts.something_went_wrong_requesting_media"),
              );
              break;
            // Seerr's own reason under the app's words, such as "Series
            // Quota exceeded.".
            case "refused":
              toast.error(
                t("seerr.toasts.something_went_wrong_requesting_media"),
                { description: outcome.message },
              );
              break;
          }
        },
      });
    },
    [seerrApi, refreshAfterRequest],
  );

  const seerrRegion = useMemo(
    // streamingRegion and discoverRegion exists. region doesn't
    () => seerrUser?.settings?.discoverRegion || "US",
    [seerrUser],
  );

  const seerrLocale = useMemo(() => {
    return seerrUser?.settings?.locale || "en";
  }, [seerrUser]);

  return {
    seerrApi,
    seerrUser,
    setSeerrUser,
    clearAllSeerrData,
    isSeerrMovieOrTvResult: isMovieOrTvResult,
    getTitle: titleOf,
    getYear: yearOf,
    getMediaType: mediaTypeOf,
    seerrRegion,
    seerrLocale,
    requestMedia,
    refreshAfterRequest,
  };
};
