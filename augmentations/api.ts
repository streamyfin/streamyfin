import type { StreamyfinPluginConfig } from "@/utils/atoms/settings";
import { AUTHORIZATION_HEADER, Api } from "@jellyfin/sdk";
import type { AxiosRequestConfig, AxiosResponse } from "axios";

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
