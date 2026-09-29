import { Api } from "@jellyfin/sdk";
import { AUTHORIZATION_HEADER } from "@jellyfin/sdk/lib/constants";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import type { StreamyfinPluginConfig } from "@/utils/atoms/settings";

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
    pluginDelete<T, D = unknown>(
      url: string,
      config?: AxiosRequestConfig<D>,
    ): Promise<AxiosResponse<T>>;
    getStreamyfinPluginConfig(): Promise<AxiosResponse<StreamyfinPluginConfig>>;
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

Api.prototype.pluginDelete = function <T, D = unknown>(
  url: string,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.delete<T>(
    `${this.basePath}${url}`,
    pluginOptions(this, config),
  );
};

Api.prototype.getStreamyfinPluginConfig = function (): Promise<
  AxiosResponse<StreamyfinPluginConfig>
> {
  return this.pluginGet<StreamyfinPluginConfig>("/Streamyfin/config");
};
