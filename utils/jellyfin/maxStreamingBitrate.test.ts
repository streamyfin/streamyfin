import { makeApi } from "@/test-utils/jellyfinApi";
import { writeToLog } from "@/utils/log";
import { resolveMaxStreamingBitrate } from "./maxStreamingBitrate";

const mockDetectBitrate = jest.fn();

jest.mock("./bitrateTest", () => ({
  detectBitrate: (...args: unknown[]) => mockDetectBitrate(...args),
}));
jest.mock("@/utils/log", () => ({
  writeToLog: jest.fn(),
  logAndCaptureError: jest.fn(),
}));

const api = makeApi();

beforeEach(() => {
  mockDetectBitrate.mockReset();
  jest.mocked(writeToLog).mockClear();
});

describe("resolveMaxStreamingBitrate", () => {
  test("asks the server for what Auto measures", async () => {
    mockDetectBitrate.mockResolvedValue(12_000_000);

    await expect(resolveMaxStreamingBitrate(api, "auto")).resolves.toBe(
      12_000_000,
    );
    expect(mockDetectBitrate).toHaveBeenCalledWith(api);
  });

  // The stream then goes out as it did under Max, the default until Auto.
  test("sets no cap when Auto cannot measure anything", async () => {
    mockDetectBitrate.mockRejectedValue(new Error("nothing measured"));

    await expect(
      resolveMaxStreamingBitrate(api, "auto"),
    ).resolves.toBeUndefined();
    // A slow or unreachable server is the user's network, not an app bug.
    expect(writeToLog).toHaveBeenCalledWith(
      "WARN",
      expect.any(String),
      expect.anything(),
    );
  });

  test("measures nothing for Max, which sets no cap", async () => {
    await expect(
      resolveMaxStreamingBitrate(api, undefined),
    ).resolves.toBeUndefined();
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  test("measures nothing for a fixed quality", async () => {
    await expect(resolveMaxStreamingBitrate(api, 8_000_000)).resolves.toBe(
      8_000_000,
    );
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  test("sets no cap for Auto without a server to measure", async () => {
    await expect(
      resolveMaxStreamingBitrate(null, "auto"),
    ).resolves.toBeUndefined();
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });
});
