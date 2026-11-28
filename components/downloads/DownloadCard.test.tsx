import { act, render, screen } from "@testing-library/react-native";
import { DOWNLOAD_STALL_AFTER_MS } from "@/constants/Downloads";
import type { JobStatus } from "@/providers/Downloads/types";
import { DownloadCard } from "./DownloadCard";

jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ cancelDownload: jest.fn() }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/utils/mmkv", () => ({
  storage: { getString: () => undefined },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const job = (overrides: Partial<JobStatus> = {}) =>
  ({
    id: "item",
    status: "downloading",
    progress: 86,
    bytesDownloaded: 355 * 1024 * 1024,
    estimatedTotalSizeBytes: 411 * 1024 * 1024,
    speed: 4 * 1024 * 1024,
    lastProgressUpdateTime: new Date(),
    item: { Id: "item", Name: "Episode 5", Type: "Episode" },
    maxBitrate: { key: "Max", value: undefined },
    ...overrides,
  }) as JobStatus;

describe("DownloadCard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the speed while progress arrives", async () => {
    await render(<DownloadCard process={job()} />);

    expect(screen.getByText("4.00 MB/s")).toBeTruthy();
    expect(screen.queryByText("home.downloads.stalled")).toBeNull();
  });

  it("swaps the frozen speed for a stalled label once progress stops", async () => {
    await render(<DownloadCard process={job()} />);

    await act(async () => {
      jest.advanceTimersByTime(DOWNLOAD_STALL_AFTER_MS);
    });

    expect(screen.getByText("home.downloads.stalled")).toBeTruthy();
    expect(screen.queryByText("4.00 MB/s")).toBeNull();
  });

  // A bare 0 from `speed && ...` is text outside <Text>, which React Native refuses to render.
  it("renders a speed of zero without a stray value", async () => {
    await render(<DownloadCard process={job({ speed: 0 })} />);

    expect(screen.queryByText("0.00 MB/s")).toBeNull();
    expect(screen.getByText("86%")).toBeTruthy();
  });
});
