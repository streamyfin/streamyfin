import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";

export class DownloadManager {
  private progressSubscription: any;
  private completeSubscription: any;
  private errorSubscription: any;
  private activeDownloads = new Map<
    number,
    { url: string; progress: number }
  >();

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    this.progressSubscription = BackgroundDownloader.addProgressListener(
      (event: DownloadProgressEvent) => {
        const download = this.activeDownloads.get(event.taskId);
        if (download) {
          download.progress = event.progress;
          console.log(
            `Download ${event.taskId}: ${Math.floor(event.progress * 100)}%`,
          );
        }
      },
    );

    this.completeSubscription = BackgroundDownloader.addCompleteListener(
      (event: DownloadCompleteEvent) => {
        console.log("Download complete:", event.filePath);
        this.activeDownloads.delete(event.taskId);
      },
    );

    this.errorSubscription = BackgroundDownloader.addErrorListener(
      (event: DownloadErrorEvent) => {
        console.error("Download error:", event.error);
        this.activeDownloads.delete(event.taskId);
      },
    );
  }

  async startDownload(url: string, destinationPath?: string): Promise<number> {
    const taskId = await BackgroundDownloader.startDownload(
      url,
      destinationPath,
    );
    this.activeDownloads.set(taskId, { url, progress: 0 });
    return taskId;
  }

  cancelDownload(taskId: number): void {
    BackgroundDownloader.cancelDownload(taskId);
    this.activeDownloads.delete(taskId);
  }

  cancelAllDownloads(): void {
    BackgroundDownloader.cancelAllDownloads();
    this.activeDownloads.clear();
  }

  async getActiveDownloads() {
    return await BackgroundDownloader.getActiveDownloads();
  }

  cleanup(): void {
    this.progressSubscription?.remove();
    this.completeSubscription?.remove();
    this.errorSubscription?.remove();
  }
}

const downloadManager = new DownloadManager();

export async function downloadFile(
  url: string,
  destinationPath?: string,
): Promise<number> {
  return await downloadManager.startDownload(url, destinationPath);
}

export function cancelDownload(taskId: number): void {
  downloadManager.cancelDownload(taskId);
}

export function cancelAllDownloads(): void {
  downloadManager.cancelAllDownloads();
}

export async function getActiveDownloads() {
  return await downloadManager.getActiveDownloads();
}
