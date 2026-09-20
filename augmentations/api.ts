import { Api, AUTHORIZATION_HEADER } from "@jellyfin/sdk";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type {
  SleepTimerType,
  StreamyfinPluginConfig,
} from "@/utils/atoms/settings";

// Contract: https://github.com/jon4hz/jellyfin-plugin-jellysleep (Models/*.cs)
export interface SleepTimerRequest {
  type: SleepTimerType;
  duration?: number;
  episodeCount?: number;
}

export interface SleepTimerResponse {
  success: boolean;
  error?: string;
}

export interface SleepTimerStatusResponse {
  isActive: boolean;
  type?: SleepTimerType;
  duration?: number;
  episodeCount?: number;
  remainingMinutes?: number;
  remainingEpisodes?: number;
}

declare module "@jellyfin/sdk" {
  interface Api {
    get<T, D = any>(
      url: string,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    post<T, D = any>(
      url: string,
      data: D,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    delete<T, D = any>(
      url: string,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    getStreamyfinPluginConfig(): Promise<AxiosResponse<StreamyfinPluginConfig>>;

    startSleepTimer(
      request: SleepTimerRequest,
    ): Promise<AxiosResponse<SleepTimerResponse>>;
    cancelSleepTimer(): Promise<AxiosResponse<{ message: string }>>;
    getSleepTimerStatus(): Promise<AxiosResponse<SleepTimerStatusResponse>>;
  }
}

Api.prototype.get = function <T, D = any>(
  url: string,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.get<T>(`${this.basePath}${url}`, {
    ...(config ?? {}),
    headers: { [AUTHORIZATION_HEADER]: this.authorizationHeader },
  });
};

Api.prototype.post = function <T, D = any>(
  url: string,
  data: D,
  config: AxiosRequestConfig<D>,
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.post<T>(`${this.basePath}${url}`, data, {
    ...(config || {}),
    headers: { [AUTHORIZATION_HEADER]: this.authorizationHeader },
  });
};

Api.prototype.delete = function <T, D = any>(
  url: string,
  config: AxiosRequestConfig<D>,
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.delete<T>(`${this.basePath}${url}`, {
    ...(config || {}),
    headers: { [AUTHORIZATION_HEADER]: this.authorizationHeader },
  });
};

Api.prototype.getStreamyfinPluginConfig = function (): Promise<
  AxiosResponse<StreamyfinPluginConfig>
> {
  return this.get<StreamyfinPluginConfig>("/Streamyfin/config");
};

Api.prototype.startSleepTimer = function (request) {
  return this.post("/Plugin/Jellysleep/StartTimer", request);
};

Api.prototype.cancelSleepTimer = function () {
  return this.post("/Plugin/Jellysleep/CancelTimer", {});
};

Api.prototype.getSleepTimerStatus = function () {
  return this.get("/Plugin/Jellysleep/Status");
};
