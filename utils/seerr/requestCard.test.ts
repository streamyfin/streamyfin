import {
  downloadProgress,
  requestBadge,
  requestDownloads,
  seerrAvatarUrl,
} from "./requestCard";
import {
  type DownloadingItem,
  type MediaInfo,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "./types";

const media = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
  id: 1,
  tmdbId: 1399,
  status: MediaStatus.PROCESSING,
  mediaType: MediaType.TV,
  ...overrides,
});

const request = (overrides: Partial<MediaRequest> = {}): MediaRequest =>
  ({
    id: 7,
    status: MediaRequestStatus.APPROVED,
    is4k: false,
    type: MediaType.TV,
    media: media(),
    seasons: [{ id: 1, seasonNumber: 2, status: MediaRequestStatus.APPROVED }],
    ...overrides,
  }) as MediaRequest;

const download = (seasonNumber: number, size = 100, sizeLeft = 40) =>
  ({
    size,
    sizeLeft,
    episode: {
      seasonNumber,
      episodeNumber: 1,
      absoluteEpisodeNumber: 1,
      id: 1,
    },
  }) as DownloadingItem;

// What Seerr's RequestCard draws under a request (AvailabilityBadge, then
// StatusBadge for the media).
describe("requestBadge", () => {
  test("tells a declined or failed request first", () => {
    expect(
      requestBadge(request({ status: MediaRequestStatus.DECLINED })),
    ).toEqual({ tone: "danger", label: "declined" });
    expect(
      requestBadge(request({ status: MediaRequestStatus.FAILED })),
    ).toEqual({ tone: "danger", label: "failed" });
  });

  test("reads a pending request on a title the library lost as pending", () => {
    expect(
      requestBadge(
        request({
          status: MediaRequestStatus.PENDING,
          media: media({ status: MediaStatus.DELETED }),
        }),
      ),
    ).toEqual({ tone: "warning", label: "pending" });
  });

  test("otherwise tells where the title stands", () => {
    const withStatus = (status: MediaStatus) =>
      requestBadge(request({ media: media({ status }) }));
    expect(withStatus(MediaStatus.AVAILABLE)).toEqual({
      tone: "success",
      label: "available",
    });
    expect(withStatus(MediaStatus.PARTIALLY_AVAILABLE)).toEqual({
      tone: "success",
      label: "partially_available",
    });
    expect(withStatus(MediaStatus.PROCESSING)).toEqual({
      tone: "primary",
      label: "requested",
    });
    expect(withStatus(MediaStatus.PENDING)).toEqual({
      tone: "warning",
      label: "pending",
    });
    expect(withStatus(MediaStatus.BLOCKLISTED)).toEqual({
      tone: "danger",
      label: "blocklisted",
    });
    expect(withStatus(MediaStatus.DELETED)).toEqual({
      tone: "danger",
      label: "deleted",
    });
  });

  test("draws nothing for a title Seerr does not know", () => {
    expect(
      requestBadge(request({ media: media({ status: MediaStatus.UNKNOWN }) })),
    ).toBeUndefined();
    expect(requestBadge(request({ media: undefined }))).toBeUndefined();
  });

  test("shows a download under way, with how far it is", () => {
    expect(
      requestBadge(
        request({ media: media({ downloadStatus: [download(2, 200, 50)] }) }),
      ),
    ).toEqual({ tone: "primary", label: "processing", progress: 75 });
  });

  test("reads the 4K side of a 4K request", () => {
    expect(
      requestBadge(
        request({
          is4k: true,
          media: media({
            status: MediaStatus.UNKNOWN,
            status4k: MediaStatus.AVAILABLE,
          }),
        }),
      ),
    ).toEqual({ tone: "success", label: "available" });
  });
});

// Seerr's getRequestDownloadStatus: a series' downloads, only for the seasons
// this request asked for.
describe("requestDownloads", () => {
  test("keeps the seasons this request asked for", () => {
    const items = [download(1), download(2)];
    expect(
      requestDownloads(request({ media: media({ downloadStatus: items }) })),
    ).toEqual([items[1]]);
  });

  test("keeps every download of a film", () => {
    const items = [{ size: 10, sizeLeft: 5 } as DownloadingItem];
    expect(
      requestDownloads(
        request({
          type: MediaType.MOVIE,
          seasons: [],
          media: media({ downloadStatus: items }),
        }),
      ),
    ).toEqual(items);
  });
});

describe("downloadProgress", () => {
  test("is the share already down, rounded", () => {
    expect(downloadProgress(download(1, 300, 100))).toBe(67);
  });

  test("is nothing while the size is not known yet", () => {
    expect(downloadProgress(download(1, 0, 0))).toBe(0);
  });
});

// Seerr hands a Jellyfin user's avatar as a path on itself, served without a
// session (/avatarproxy), and a Gravatar or Plex one as a full address.
describe("seerrAvatarUrl", () => {
  const base = "https://seerr.example";

  test("puts a path on the Seerr server", () => {
    expect(seerrAvatarUrl(base, "/avatarproxy/abc?v=1")).toBe(
      "https://seerr.example/avatarproxy/abc?v=1",
    );
  });

  test("keeps a full address", () => {
    expect(seerrAvatarUrl(base, "https://gravatar.com/avatar/x")).toBe(
      "https://gravatar.com/avatar/x",
    );
  });

  test("has none without an avatar", () => {
    expect(seerrAvatarUrl(base, undefined)).toBeUndefined();
    expect(seerrAvatarUrl(base, "")).toBeUndefined();
  });
});
