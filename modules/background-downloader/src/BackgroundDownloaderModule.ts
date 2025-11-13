import { requireNativeModule } from "expo-modules-core";
import type { BackgroundDownloaderModuleType } from "./BackgroundDownloader.types";

const BackgroundDownloaderModule: BackgroundDownloaderModuleType =
  requireNativeModule("BackgroundDownloader");

export default BackgroundDownloaderModule;
