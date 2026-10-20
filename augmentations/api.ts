import { Api, AUTHORIZATION_HEADER } from "@jellyfin/sdk";
import type {
  AxiosRequestConfig,
  AxiosResponse,
  RawAxiosRequestHeaders,
} from "axios";
import type { StreamyfinPluginConfig } from "@/utils/atoms/settings";

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

// A request's own headers go along, those of a custom home section's endpoint
// for one. The session's authorization is set last, so none replaces it.
const withAuthorization = (
  api: Api,
  headers: AxiosRequestConfig["headers"],
): RawAxiosRequestHeaders => ({
  ...(headers ?? {}),
  [AUTHORIZATION_HEADER]: api.authorizationHeader,
});

Api.prototype.get = function <T, D = any>(
  url: string,
  config: AxiosRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.get<T>(`${this.basePath}${url}`, {
    ...(config ?? {}),
    headers: withAuthorization(this, config?.headers),
  });
};

Api.prototype.post = function <T, D = any>(
  url: string,
  data: D,
  config: AxiosRequestConfig<D>,
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.post<T>(`${this.basePath}${url}`, data, {
    ...(config || {}),
    headers: withAuthorization(this, config?.headers),
  });
};

Api.prototype.delete = function <T, D = any>(
  url: string,
  config: AxiosRequestConfig<D>,
): Promise<AxiosResponse<T>> {
  return this.axiosInstance.delete<T>(`${this.basePath}${url}`, {
    ...(config || {}),
    headers: withAuthorization(this, config?.headers),
  });
};

Api.prototype.getStreamyfinPluginConfig = function (): Promise<
  AxiosResponse<StreamyfinPluginConfig>
> {
  return this.get<StreamyfinPluginConfig>("/Streamyfin/config");
};
