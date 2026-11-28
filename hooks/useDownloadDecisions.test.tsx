import * as Sentry from "@sentry/react-native";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { getDownloadDecision } from "@/utils/jellyfin/media/downloadDecision";
import type { DownloadRequestParams } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import { reportDataError } from "@/utils/reportDataError";
import { useDownloadDecisions } from "./useDownloadDecisions";

jest.mock("@/utils/jellyfin/media/downloadDecision");

const api = makeApi();

const request = (
  id: string,
  maxStreamingBitrate?: number,
): DownloadRequestParams => ({
  api,
  item: { Id: id, Type: "Episode" },
  userId: "user-1",
  mediaSourceId: `source-${id}`,
  audioStreamIndex: 1,
  subtitleStreamIndex: -1,
  maxStreamingBitrate,
  audioMode: "auto",
});

describe("useDownloadDecisions", () => {
  beforeEach(() => {
    jest.mocked(getDownloadDecision).mockReset();
  });

  it("counts direct, transcoded and failed items", async () => {
    jest.mocked(getDownloadDecision).mockImplementation(async (params) => {
      if (params.item?.Id === "a") return { kind: "direct" };
      if (params.item?.Id === "b") {
        return { kind: "transcode", reasons: ["AudioCodecNotSupported"] };
      }
      throw new Error("500");
    });

    const { result } = await renderHook(
      () =>
        useDownloadDecisions([request("a"), request("b"), request("c")], true),
      { wrapper: QueryWrapper },
    );

    await waitFor(() => expect(result.current.checked).toBe(3));
    expect(result.current).toMatchObject({
      total: 3,
      direct: 1,
      transcode: 1,
      failed: 1,
    });
    expect(result.current.items[1]).toMatchObject({
      status: "done",
      decision: { kind: "transcode", reasons: ["AudioCodecNotSupported"] },
    });
    expect(result.current.items[2].status).toBe("failed");
  });

  // Changing the quality must not leave the previous quality's answer on screen.
  it("shows only answers for the current choices", async () => {
    jest
      .mocked(getDownloadDecision)
      .mockImplementation((params) =>
        params.maxStreamingBitrate === undefined
          ? Promise.resolve({ kind: "direct" })
          : new Promise(() => {}),
      );

    const { result, rerender } = await renderHook(
      ({ bitrate }: { bitrate?: number }) =>
        useDownloadDecisions([request("a", bitrate)], true),
      { wrapper: QueryWrapper, initialProps: { bitrate: undefined } },
    );
    await waitFor(() => expect(result.current.direct).toBe(1));

    await rerender({ bitrate: 4_000_000 });

    expect(result.current).toMatchObject({ checked: 0, direct: 0 });
    expect(result.current.items[0].status).toBe("checking");
  });

  it("sends nothing while disabled", async () => {
    const { result } = await renderHook(
      () => useDownloadDecisions([request("a")], false),
      { wrapper: QueryWrapper },
    );

    expect(getDownloadDecision).not.toHaveBeenCalled();
    expect(result.current.checked).toBe(0);
  });

  // The app reports every failed query (app/_layout.tsx). A check the server
  // could not answer is shown as unchecked; it is not a defect of the app.
  it("keeps a failed check out of Sentry and in the local log", async () => {
    jest
      .mocked(getDownloadDecision)
      .mockRejectedValue(new Error("No media source offered for download"));
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) =>
          reportDataError("query", query.queryKey, error),
      }),
      // No garbage collection timer: it would keep Jest from exiting.
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    const AppClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(
      () => useDownloadDecisions([request("a")], true),
      { wrapper: AppClient },
    );

    await waitFor(() => expect(result.current.failed).toBe(1));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(writeToLog).toHaveBeenCalledWith(
      "WARN",
      expect.any(String),
      expect.anything(),
    );
    client.clear();
  });

  // A stale answer whose refetch fails keeps its data in React Query; counted
  // as both, the totals came to more than the items (CodeRabbit on #2568).
  it("counts an item whose re-check failed as failed only", async () => {
    jest.mocked(getDownloadDecision).mockResolvedValue({ kind: "direct" });
    const client = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    const AppClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(
      () => useDownloadDecisions([request("a")], true),
      { wrapper: AppClient },
    );
    await waitFor(() => expect(result.current.direct).toBe(1));

    jest.mocked(getDownloadDecision).mockRejectedValue(new Error("500"));
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() => expect(result.current.failed).toBe(1));
    expect(result.current).toMatchObject({ direct: 0, checked: 1 });
    client.clear();
  });
});
