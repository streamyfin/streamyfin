import { beforeEach, describe, expect, mock, test } from "bun:test";
import { atom } from "jotai";
import { stubCustomHeaders } from "@/test-utils/customHeaders";
import { clearMmkv, stubMmkv } from "@/test-utils/mmkv";
import { stubReactNative } from "@/test-utils/reactNative";
import type { PendingDownload } from "./pendingDownloads";

stubMmkv();
stubReactNative();
stubCustomHeaders();
const secureValues = new Map<string, string>();
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => secureValues.get(key) ?? null,
  setItem: (key: string, value: string) => void secureValues.set(key, value),
  deleteItemAsync: async (key: string) => void secureValues.delete(key),
}));
mock.module("@/utils/log", () => ({
  logAndCaptureError: mock(),
  writeToLog: mock(),
  writeInfoLog: mock(),
  writeErrorLog: mock(),
  writeDebugLog: mock(),
  readFromLog: () => [],
  useLog: () => ({ logs: [], clearLogs: () => undefined }),
  LogProvider: ({ children }: { children: unknown }) => children,
  default: atom([]),
}));

const enqueueSingle = mock(async () => 17);
const enqueueBundle = mock(async () => 23);
mock.module("@/modules/background-downloader", () => ({
  default: {
    enqueueDownload: enqueueSingle,
    enqueueMultiTrackDownload: enqueueBundle,
  },
}));

let documentPath = "file:///first-container/Documents";
let publishedSize = 0;
mock.module("expo-file-system", () => ({
  Directory: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    create() {}
  },
  File: class {
    uri: string;
    get exists() {
      return publishedSize > 0;
    }
    get size() {
      return publishedSize;
    }
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
  },
  Paths: {
    get document() {
      return documentPath;
    },
  },
}));

const {
  enqueuePendingDownload,
  finalizePendingDownload,
  getPendingDownload,
  savePendingDownload,
  updatePendingDownload,
} = await import("./pendingDownloads");
const { clearAllDownloadedItems, getDownloadedItemById } = await import(
  "./database"
);
const { reconcileMultiTrackRecord } = await import(
  "./hooks/useDownloadReconciliation"
);

/** A persisted job with non-contiguous Jellyfin indices. */
function bundle(): PendingDownload {
  return {
    itemId: "movie-1",
    status: "queued",
    enqueuedAt: "2026-09-29T00:00:00.000Z",
    inputUrl: "https://server.example/Videos/movie-1/stream.mp4",
    videoFileName: "movie-1.mkv",
    item: { Id: "movie-1", Type: "Movie", Name: "Test" },
    mediaSource: {
      Id: "source-1",
      Container: "mkv",
      MediaStreams: [
        { Type: "Video", Index: 0, Codec: "h264" },
        { Type: "Audio", Index: 7, Codec: "aac" },
        { Type: "Audio", Index: 3, Codec: "aac" },
      ],
    },
    audioStreamIndex: 7,
    subtitleStreamIndex: -1,
    maxBitrate: { key: "Max", value: undefined },
    deviceId: "device-1",
    activityMetadata: {
      itemId: "movie-1",
      title: "Test",
      subtitle: "",
      labels: {},
    },
    multiTrack: {
      audioUrls: [
        "https://server.example/Videos/movie-1/stream.mp4?AudioStreamIndex=3",
      ],
      audioTitles: ["English", "Japanese"],
      audioLanguages: ["eng", "jpn"],
    },
  };
}

beforeEach(() => {
  clearMmkv();
  secureValues.clear();
  clearAllDownloadedItems();
  enqueueSingle.mockClear();
  enqueueBundle.mockClear();
  documentPath = "file:///first-container/Documents";
  publishedSize = 0;
});

describe("multi-track cold-start recovery", () => {
  test("retains preparation while native waits for foreground, without needing network credentials", async () => {
    savePendingDownload(bundle());
    const process = await reconcileMultiTrackRecord(bundle(), {
      taskId: -10,
      itemId: "movie-1",
      url: bundle().inputUrl,
      state: "queued",
      stage: "remuxing",
      requiresHeaders: true,
      progress: 0.9,
      bytesWritten: 1234,
    });
    expect(process?.status).toBe("preparing");
    expect(process?.progress).toBe(90);
    expect(process?.bytesDownloaded).toBe(1234);
    expect(getPendingDownload("movie-1")?.status).toBe("preparing");
    expect(enqueueBundle).not.toHaveBeenCalled();
    expect(getDownloadedItemById("movie-1")).toBeUndefined();
  });

  test("restores headers for the next input even when the first transfer is still running", async () => {
    const record = savePendingDownload(bundle(), { "X-Media": "secret" });
    const process = await reconcileMultiTrackRecord(record, {
      taskId: -10,
      url: record.inputUrl,
      state: "running",
      stage: "downloading",
      requiresHeaders: true,
    });
    expect(process?.status).toBe("downloading");
    expect(enqueueBundle).toHaveBeenCalledWith(
      expect.anything(),
      record.activityMetadata,
      { "X-Media": "secret" },
    );
  });

  test("shows failures received while JS was dead without retrying them in a loop", async () => {
    savePendingDownload(bundle());
    const process = await reconcileMultiTrackRecord(bundle(), {
      taskId: -10,
      url: bundle().inputUrl,
      state: "queued",
      stage: "downloading",
      error: "Disk full",
    });
    expect(process?.status).toBe("error");
    expect(process?.error).toBe("Disk full");
    expect(enqueueBundle).not.toHaveBeenCalled();
  });

  test("re-enqueues interrupted bundles instead of dropping their pending record", async () => {
    const record = { ...bundle(), status: "downloading" as const };
    savePendingDownload(record);
    const process = await reconcileMultiTrackRecord(record);
    expect(process?.status).toBe("queued");
    expect(enqueueBundle).toHaveBeenCalledTimes(1);
    expect(getPendingDownload("movie-1")).toBeDefined();
  });

  test("only publishes the atomic final path after an offline completion", async () => {
    savePendingDownload(bundle());
    publishedSize = 500;
    expect(await reconcileMultiTrackRecord(bundle())).toBeUndefined();
    expect(getDownloadedItemById("movie-1")?.videoFileSize).toBe(500);
    expect(enqueueBundle).not.toHaveBeenCalled();
  });
});

describe("pending multi-track downloads", () => {
  test("persists extras but derives the destination in the current app container", async () => {
    savePendingDownload(bundle());
    documentPath = "file:///new-container/Documents";
    const record = getPendingDownload("movie-1")!;
    await enqueuePendingDownload(record, { "X-Proxy": "test" });

    expect(enqueueSingle).not.toHaveBeenCalled();
    expect(enqueueBundle).toHaveBeenCalledWith(
      {
        ...record.multiTrack,
        videoUrl: record.inputUrl,
        destinationPath: "/new-container/Documents/movie-1.mkv",
      },
      record.activityMetadata,
      { "X-Proxy": "test" },
    );
    expect(getPendingDownload("movie-1")?.taskId).toBe(23);
    expect(JSON.stringify(getPendingDownload("movie-1"))).not.toContain(
      "X-Proxy",
    );
  });

  test("retries the identical bundle so native can reuse completed inputs", async () => {
    savePendingDownload(bundle());
    updatePendingDownload("movie-1", { status: "error", error: "Interrupted" });
    await enqueuePendingDownload(getPendingDownload("movie-1")!);
    expect(getPendingDownload("movie-1")?.status).toBe("downloading");
    expect(getPendingDownload("movie-1")?.error).toBeUndefined();
    expect(getPendingDownload("movie-1")?.multiTrack).toEqual(
      bundle().multiTrack,
    );
  });

  test("keeps required headers in SecureStore and restores them on retry", async () => {
    savePendingDownload(bundle(), { "X-Media-Token": "private-media-token" });
    const record = getPendingDownload("movie-1")!;
    expect(JSON.stringify(record)).not.toContain("private-media-token");
    expect(record.requiredHttpHeaders?.[0].secureValueKey).toBeDefined();
    await enqueuePendingDownload(record, { "X-Proxy": "proxy-value" });
    expect(enqueueBundle).toHaveBeenCalledWith(
      expect.anything(),
      record.activityMetadata,
      { "X-Proxy": "proxy-value", "X-Media-Token": "private-media-token" },
    );
    finalizePendingDownload(record, 12345);
    expect(secureValues.size).toBe(0);
  });

  test("never retries with missing or conflicting required credentials", async () => {
    savePendingDownload(bundle(), { "X-Media-Token": "private-media-token" });
    const record = getPendingDownload("movie-1")!;
    await expect(
      enqueuePendingDownload(record, { "x-media-token": "different" }),
    ).rejects.toThrow("conflict");
    secureValues.clear();
    await expect(enqueuePendingDownload(record)).rejects.toThrow(
      "credentials are unavailable",
    );
    expect(enqueueBundle).not.toHaveBeenCalled();
  });

  test("does not publish a download merely because all requests were enqueued", async () => {
    savePendingDownload(bundle());
    await enqueuePendingDownload(bundle());
    expect(getDownloadedItemById("movie-1")).toBeUndefined();
    expect(getPendingDownload("movie-1")).toBeDefined();
  });

  test("finalizes both selected audio tracks and keeps their original indices", () => {
    const record = bundle();
    savePendingDownload(record);
    const result = finalizePendingDownload(record, 12345);
    expect(result.userData).toEqual({
      audioStreamIndex: 7,
      subtitleStreamIndex: -1,
      isTranscoded: true,
      isMultiTrack: true,
    });
    expect(
      result.mediaSource.MediaStreams?.filter((s) => s.Type === "Audio").map(
        (s) => s.Index,
      ),
    ).toEqual([7, 3]);
    expect(result.videoFileName).toBe("movie-1.mkv");
    expect(getPendingDownload("movie-1")).toBeUndefined();
    expect(getDownloadedItemById("movie-1")?.videoFileSize).toBe(12345);
  });

  test("legacy single-file downloads still use the existing native API", async () => {
    const record = {
      ...bundle(),
      multiTrack: undefined,
      videoFileName: "movie-1.mp4",
    };
    savePendingDownload(record);
    await enqueuePendingDownload(record);
    expect(enqueueBundle).not.toHaveBeenCalled();
    expect(enqueueSingle).toHaveBeenCalledWith(
      record.inputUrl,
      "/first-container/Documents/movie-1.mp4",
      record.activityMetadata,
      undefined,
    );
    expect(
      finalizePendingDownload(record, 10, true).userData.isMultiTrack,
    ).toBeUndefined();
  });

  test("never publishes an empty remux result or discards its retry record", () => {
    savePendingDownload(bundle());
    expect(() => finalizePendingDownload(bundle(), 0)).toThrow("non-empty MKV");
    expect(getDownloadedItemById("movie-1")).toBeUndefined();
    expect(getPendingDownload("movie-1")).toBeDefined();
  });

  test("rejects incomplete native metadata without deleting the pending record", async () => {
    const record = { ...bundle(), activityMetadata: undefined };
    savePendingDownload(record);
    await expect(enqueuePendingDownload(record)).rejects.toThrow(
      "missing its native metadata",
    );
    expect(getPendingDownload("movie-1")).toBeDefined();
    expect(enqueueBundle).not.toHaveBeenCalled();
  });
});
