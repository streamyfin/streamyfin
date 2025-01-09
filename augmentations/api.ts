import {Api, AUTHORIZATION_HEADER} from "@jellyfin/sdk";
import {AxiosRequestConfig, AxiosResponse} from "axios";
import {StreamyfinPluginConfig} from "@/utils/atoms/settings";

declare module '@jellyfin/sdk' {
  interface Api {
    get<T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<AxiosResponse<T>>
    post<T, D = any>(url: string, data: D, config?: AxiosRequestConfig<D>): Promise<AxiosResponse<T>>
    getStreamyfinPluginConfig(): Promise<AxiosResponse<StreamyfinPluginConfig>>
  }
}

Api.prototype.get = function <T, D = any> (url: string, config: AxiosRequestConfig<D> = {}): Promise<AxiosResponse<T>> {
  return this.axiosInstance.get<T>(url, {
    ...(config ?? {}),
    headers: { [AUTHORIZATION_HEADER]: this.authorizationHeader }
  })
}

Api.prototype.post = function <T, D = any> (url: string, data: D, config: AxiosRequestConfig<D>): Promise<AxiosResponse<T>> {
  return this.axiosInstance.get<T>(`${this.basePath}${url}`, {
    ...(config || {}),
    data,
    headers: { [AUTHORIZATION_HEADER]: this.authorizationHeader }}
  )
}

Api.prototype.getStreamyfinPluginConfig = function (): Promise<AxiosResponse<StreamyfinPluginConfig>> {
  return this.get<StreamyfinPluginConfig>("/Streamyfin/config")
}