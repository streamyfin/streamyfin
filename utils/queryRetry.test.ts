import { onlineManager } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import { MAX_QUERY_RETRIES } from "@/constants/Query";
import { shouldRetryQuery } from "./queryRetry";

const STALE = "5e1c0f9d2b7a4c38a6e2d4f1b3c5a7e9";

const httpError = (path: string, status: number, data?: unknown) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    {
      method: "get",
      url: `https://jellyfin.example.com${path}`,
      headers: {} as never,
    },
    {},
    {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
      data,
      config: {},
    } as unknown as AxiosResponse,
  );

beforeEach(() => {
  onlineManager.setOnline(true);
});

afterAll(() => {
  onlineManager.setOnline(true);
});

describe("shouldRetryQuery", () => {
  // React Query passes how many times the query was already tried again: 0
  // when its first attempt fails.
  test("a failure is tried again until the limit", () => {
    const error = httpError("/Items", 500);
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, error)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, error)).toBe(false);
    expect(shouldRetryQuery(0, new Error("boom"))).toBe(true);
  });

  test("nothing is tried again while offline", () => {
    onlineManager.setOnline(false);
    expect(shouldRetryQuery(0, httpError("/Items", 500))).toBe(false);
  });

  // A library renamed or deleted: Jellyfin answers its old id with the same
  // 400 every time, and three more attempts would only hold the error back
  // for seven seconds.
  test("an id the server no longer has is not tried again", () => {
    expect(
      shouldRetryQuery(
        0,
        httpError(
          `/Items?userId=u1&parentId=${STALE}&recursive=true`,
          400,
          "Error processing request.",
        ),
      ),
    ).toBe(false);
  });

  // Only that answer: the same words for a fault of the request, or a
  // series' 404, are tried again as any failure is.
  test("what only resembles it is tried again", () => {
    expect(
      shouldRetryQuery(
        0,
        httpError(
          `/Items?userId=u1&parentId=${STALE}&years=NaN`,
          400,
          "Error processing request.",
        ),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        0,
        httpError(
          `/Shows/${STALE}/Episodes?userId=u1`,
          404,
          "Series not found",
        ),
      ),
    ).toBe(true);
  });
});
