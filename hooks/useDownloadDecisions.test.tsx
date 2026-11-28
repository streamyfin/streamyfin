import { renderHook, waitFor } from "@testing-library/react-native";
import { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { getDownloadDecision } from "@/utils/jellyfin/media/downloadDecision";
import type { DownloadRequestParams } from "@/utils/jellyfin/media/getStreamUrl";
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
});
