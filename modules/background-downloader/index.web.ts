// Web (desktop) shim: background downloading is an OS-level service
// (URLSession / WorkManager) with no browser equivalent. Offline downloads are
// therefore unavailable on desktop; every call is inert and the active-download
// list stays empty, which is the state the download UI already renders as
// "no active downloads".
import type { EventSubscription } from "expo-modules-core";
import type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./src/BackgroundDownloader.types";

const UNSUPPORTED = "Background downloads are not available on desktop";

const subscription = (): EventSubscription =>
  ({ remove: () => undefined }) as EventSubscription;

const BackgroundDownloader = {
  async startDownload(): Promise<number> {
    throw new Error(UNSUPPORTED);
  },
  async enqueueDownload(): Promise<number> {
    throw new Error(UNSUPPORTED);
  },
  cancelDownload(_taskId: number): void {},
  cancelQueuedDownload(_url: string): void {},
  cancelAllDownloads(): void {},
  async getActiveDownloads(): Promise<ActiveDownload[]> {
    return [];
  },
  addProgressListener(
    _listener: (event: DownloadProgressEvent) => void,
  ): EventSubscription {
    return subscription();
  },
  addCompleteListener(
    _listener: (event: DownloadCompleteEvent) => void,
  ): EventSubscription {
    return subscription();
  },
  addErrorListener(
    _listener: (event: DownloadErrorEvent) => void,
  ): EventSubscription {
    return subscription();
  },
  addStartedListener(
    _listener: (event: DownloadStartedEvent) => void,
  ): EventSubscription {
    return subscription();
  },
};

export default BackgroundDownloader;
export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./src/BackgroundDownloader.types";
