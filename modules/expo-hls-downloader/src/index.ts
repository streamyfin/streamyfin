// Reexport the native module. On web, it will be resolved to ExpoHlsDownloaderModule.web.ts
// and on native platforms to ExpoHlsDownloaderModule.ts
import ExpoHlsDownloaderModule from "./ExpoHlsDownloaderModule";
export { default } from "./ExpoHlsDownloaderModule";
export { default as ExpoHlsDownloaderView } from "./ExpoHlsDownloaderView";
export * from "./ExpoHlsDownloader.types";

export function downloadHLSAsset(url: string, assetTitle: string): void {
  return ExpoHlsDownloaderModule.downloadHLSAsset(url, assetTitle);
}
