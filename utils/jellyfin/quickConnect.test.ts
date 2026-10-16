import { AxiosError, type AxiosResponse } from "axios";
import {
  approveQuickConnectCode,
  isQuickConnectEnabled,
} from "@/utils/jellyfin/quickConnect";

const mockAuthorize = jest.fn();
const mockEnabled = jest.fn();
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getQuickConnectApi: () => ({
    authorizeQuickConnect: (params: { code: string }) => mockAuthorize(params),
    getQuickConnectEnabled: () => mockEnabled(),
  }),
}));

const api = {} as Parameters<typeof approveQuickConnectCode>[0];

const httpError = (status: number) =>
  new AxiosError("request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
  } as AxiosResponse);

describe("approveQuickConnectCode", () => {
  beforeEach(() => mockAuthorize.mockReset());

  test("approves as the signed-in user, without naming one", async () => {
    mockAuthorize.mockResolvedValue({ data: true });
    await expect(approveQuickConnectCode(api, "123456")).resolves.toBe(
      "approved",
    );
    expect(mockAuthorize).toHaveBeenCalledWith({ code: "123456" });
  });

  test("tells a code the server refuses", async () => {
    mockAuthorize.mockResolvedValue({ data: false });
    await expect(approveQuickConnectCode(api, "123456")).resolves.toBe(
      "refused",
    );
  });

  // Jellyfin answers 404 for a code it does not hold: expired, mistyped, or
  // started on another server.
  test("tells a code the server does not know", async () => {
    mockAuthorize.mockRejectedValue(httpError(404));
    await expect(approveQuickConnectCode(api, "123456")).resolves.toBe(
      "unknown-code",
    );
  });

  test("leaves every other failure to the caller", async () => {
    mockAuthorize.mockRejectedValue(httpError(500));
    await expect(approveQuickConnectCode(api, "123456")).rejects.toThrow(
      "request failed",
    );
  });
});

describe("isQuickConnectEnabled", () => {
  test("is true only when the server says so", async () => {
    mockEnabled.mockResolvedValueOnce({ data: true });
    await expect(isQuickConnectEnabled(api)).resolves.toBe(true);
    mockEnabled.mockResolvedValueOnce({ data: false });
    await expect(isQuickConnectEnabled(api)).resolves.toBe(false);
  });
});
