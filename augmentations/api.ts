import { Api, AUTHORIZATION_HEADER } from "@jellyfin/sdk";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type { StreamyfinPluginConfig } from "@/utils/atoms/settings";
import { SleepTimerType } from "@/utils/atoms/settings";

export interface SleepTimerRequest {
  type: SleepTimerType;
  duration?: number;
  episodeCount?: number;
  label?: string;
  endTime?: string;
}

export interface SleepTimerResponse {
  success: boolean;
  timerId?: string;
  type?: SleepTimerType;
  duration?: number;
  episodeCount?: number;
  endTime?: string;
  label?: string;
  message: string;
  error?: string;
}

export interface SleepTimerStatusResponse {
  isActive: boolean;
  timerId?: string;
  type?: SleepTimerType;
  duration?: number;
  episodeCount?: number;
  episodePlayed?: number;
  endTime?: string;
  remainingMinutes?: number;
  remainingEpisodes?: number;
  label?: string;
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

    // Jellysleep API methods
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

// Jellysleep API implementations
Api.prototype.startSleepTimer = function (
  request: SleepTimerRequest,
): Promise<AxiosResponse<SleepTimerResponse>> {
  return this.post<SleepTimerResponse, SleepTimerRequest>(
    "/Plugin/Jellysleep/StartTimer",
    request,
    {},
  );
};

Api.prototype.cancelSleepTimer = function (): Promise<
  AxiosResponse<{ message: string }>
> {
  return this.post<{ message: string }>("/Plugin/Jellysleep/CancelTimer", {});
};

Api.prototype.getSleepTimerStatus = function (): Promise<
  AxiosResponse<SleepTimerStatusResponse>
> {
  return this.get<SleepTimerStatusResponse>("/Plugin/Jellysleep/Status");
};
