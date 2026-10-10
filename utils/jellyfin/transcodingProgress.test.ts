import type { TranscodingInfo } from "@jellyfin/sdk/lib/generated-client";
import {
  describeTranscodingProgress,
  pickTranscodingInfo,
} from "./transcodingProgress";

const TRANSCODE: TranscodingInfo = {
  CompletionPercentage: 42.345,
  Framerate: 61.4,
  HardwareAccelerationType: "vaapi",
  IsVideoDirect: false,
};

describe("pickTranscodingInfo", () => {
  test("takes the session that is transcoding", () => {
    expect(
      pickTranscodingInfo([
        { Id: "stale" },
        { Id: "current", TranscodingInfo: TRANSCODE },
      ]),
    ).toBe(TRANSCODE);
  });

  test("finds nothing when no session transcodes", () => {
    expect(pickTranscodingInfo([{ Id: "direct" }])).toBeNull();
    expect(pickTranscodingInfo([])).toBeNull();
  });

  // Same proxy caveat as hooks/useSessions: the body is not always the array
  // the SDK types promise.
  test.each([undefined, null, "<html>502</html>", { error: "bad gateway" }])(
    "finds nothing in a body that is not a session list: %p",
    (body) => {
      expect(pickTranscodingInfo(body)).toBeNull();
    },
  );
});

describe("describeTranscodingProgress", () => {
  test("formats the progress, the speed and the encoder", () => {
    expect(describeTranscodingProgress(TRANSCODE)).toEqual({
      percent: "42.3",
      fps: "61",
      hardware: "vaapi",
    });
  });

  test("keeps a transcode that has only just started", () => {
    expect(
      describeTranscodingProgress({ ...TRANSCODE, CompletionPercentage: 0 }),
    ).toMatchObject({ percent: "0.0" });
  });

  // The server blanks the type to "none" for every user who is not an
  // administrator (SessionManager.GetSessions), so "none" printed as a fact
  // would deny a hardware transcode that is running.
  test("says nothing about the encoder when the server answers none", () => {
    expect(
      describeTranscodingProgress({
        ...TRANSCODE,
        HardwareAccelerationType: "none",
      }),
    ).toEqual({ percent: "42.3", fps: "61" });
  });

  test("leaves out what the server has not reported yet", () => {
    expect(
      describeTranscodingProgress({
        CompletionPercentage: null,
        Framerate: null,
        HardwareAccelerationType: "qsv",
      }),
    ).toEqual({ hardware: "qsv" });
  });

  // An audio-only transcode copies the video: there is no encode speed and
  // no encoder to name, only the progress.
  test("reports only the progress when the video is copied", () => {
    expect(
      describeTranscodingProgress({
        CompletionPercentage: 10,
        Framerate: 0,
        HardwareAccelerationType: "none",
        IsVideoDirect: true,
      }),
    ).toEqual({ percent: "10.0" });
  });

  test("has nothing to say without transcoding info", () => {
    expect(describeTranscodingProgress(null)).toBeNull();
    expect(describeTranscodingProgress(undefined)).toBeNull();
    expect(describeTranscodingProgress({})).toBeNull();
  });
});
