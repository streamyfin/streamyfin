import { NativeModule, requireNativeModule } from "expo";
import { ExpoHlsDownloaderModuleEvents } from "./ExpoHlsDownloader.types";

declare class ExpoHlsDownloaderModule extends NativeModule<ExpoHlsDownloaderModuleEvents> {
  downloadHLSAsset(url: string, assetTitle: string): void;
}

export default requireNativeModule<ExpoHlsDownloaderModule>(
  "ExpoHlsDownloader"
);
