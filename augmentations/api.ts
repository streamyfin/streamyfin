import { Api } from "@jellyfin/sdk";
import { AUTHORIZATION_HEADER } from "@jellyfin/sdk/lib/constants";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { PluginLockableSettings } from "@/utils/atoms/settings";
import { readPluginSettings } from "@/utils/pluginSettingsSource";

declare module "@jellyfin/sdk" {
  interface Api {
    /** For plugin routes not represented by the Jellyfin SDK. */
    pluginGet<T, D = unknown>(
      url: string,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    /** For plugin routes not represented by the Jellyfin SDK. */
    pluginPost<T, D = unknown>(
      url: string,
      data: D,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    /** For plugin routes not represented by the Jellyfin SDK. */
    pluginPut<T, D = unknown>(
      url: string,
      data: D,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    /** For plugin routes not represented by the Jellyfin SDK. */
    pluginDelete<T, D = unknown>(
      url: string,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    getStreamyfinPluginSettings(): Promise<PluginLockableSettings | undefined>;
  }
}

const pluginOptions = <D>(api: Api, config: AxiosRequestConfig<D>) =>
  axios.mergeConfig(config, {
    headers: { [AUTHORIZATION_HEADER]: api.authorizationHeader },
  });

Api.prototype.pluginGet = function <T, D = unknown>(
  url: string,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.get<T>(
    `${this.basePath}${url}`,
    pluginOptions(this, config),
  );
};

Api.prototype.pluginPost = function <T, D = unknown>(
  url: string,
  data: D,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.post<T>(
    `${this.basePath}${url}`,
    data,
    pluginOptions(this, config),
  );
};

Api.prototype.pluginPut = function <T, D = unknown>(
  url: string,
  data: D,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.put<T>(
    `${this.basePath}${url}`,
    data,
    pluginOptions(this, config),
  );
};

Api.prototype.pluginDelete = function <T, D = unknown>(
  url: string,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.delete<T>(
    `${this.basePath}${url}`,
    pluginOptions(this, config),
  );
};

Api.prototype.getStreamyfinPluginSettings = function (): Promise<
  PluginLockableSettings | undefined
> {
  return readPluginSettings(this);
};
