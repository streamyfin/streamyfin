import { File } from "expo-file-system";
import { BackgroundDownloader } from "@/modules";
import { getResumeState, saveResumeState } from "./resumeState";

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

class ChunkCoordinator {
  private activeLoops = new Map<string, boolean>();

  public async startLoop(
    processId: string,
    url: string,
    destPath: string,
    totalBytes: number,
    initialBytesDownloaded: number,
    onProgress: (bytesWritten: number) => void,
    onComplete: (filePath: string) => void,
    onError: (error: string) => void,
  ) {
    this.activeLoops.set(processId, true);

    const file = new File(destPath);
    // If the logical resume state says 0 bytes, but the file exists (orphaned ghost file from prior runs), purge it so we don't skip the download.
    if (initialBytesDownloaded === 0 && file.exists) {
      try {
        await file.delete();
      } catch (_e) {}
    }

    let bytesDownloaded = file.exists ? file.info().size || 0 : 0;

    try {
      while (bytesDownloaded < totalBytes && this.activeLoops.get(processId)) {
        const endByte = Math.min(
          bytesDownloaded + CHUNK_SIZE - 1,
          totalBytes - 1,
        );
        const bytesWritten = await BackgroundDownloader.downloadChunk(
          url,
          destPath,
          bytesDownloaded,
          endByte,
        );

        if (bytesWritten > 0) {
          bytesDownloaded += bytesWritten;
          onProgress(bytesDownloaded);

          // Continuously update mmkv
          const state = getResumeState(processId);
          if (state) {
            saveResumeState({
              ...state,
              bytesDownloaded,
              jobStatus: {
                ...state.jobStatus,
                bytesDownloaded,
                progress: Math.floor((bytesDownloaded / totalBytes) * 100),
              },
            });
          }
        } else {
          // End of file gracefully reached
          break;
        }
      }

      if (this.activeLoops.get(processId)) {
        // Either we reached totalBytes or we successfully broke out at EOF via 0 bytes
        onComplete(destPath);
      }
    } catch (error) {
      if (this.activeLoops.get(processId)) {
        onError(error instanceof Error ? error.message : "Unknown error");
      }
    } finally {
      this.activeLoops.delete(processId);
    }
  }

  public pauseLoop(processId: string) {
    this.activeLoops.set(processId, false);
  }

  public cancelLoop(processId: string) {
    this.activeLoops.delete(processId);
  }
}

export const chunkCoordinator = new ChunkCoordinator();
