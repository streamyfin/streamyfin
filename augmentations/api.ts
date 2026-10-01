import { Api, AUTHORIZATION_HEADER } from "@jellyfin/sdk";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type { PluginLockableSettings } from "@/utils/atoms/settings";
import { fetchPluginSettings } from "@/utils/pluginSettingsSource";

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
    getStreamyfinPluginSettings(): Promise<PluginLockableSettings | undefined>;
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

Api.prototype.getStreamyfinPluginSettings = function (): Promise<
  PluginLockableSettings | undefined
> {
  return fetchPluginSettings(this);
};
