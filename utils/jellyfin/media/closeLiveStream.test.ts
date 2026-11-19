import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
jest.mock(
  "expo",
  () => jest.requireActual("@/test-utils/stubModules").expoWithoutNativeModule,
);

import { makeApi } from "@/test-utils/jellyfinApi";
import { closeLiveStream } from "./closeLiveStream";

const CLOSE = /\/LiveStreams\/Close\?liveStreamId=live-1/;
const noWait = { retryDelayMs: 0 };

describe("closeLiveStream", () => {
  test("is sent once when the server answers", async () => {
    const api = makeApi();
    api.mock.onPost(CLOSE).reply(204);

    await closeLiveStream(api, "live-1", noWait);

    expect(api.mock.history.post).toHaveLength(1);
  });

  // The server took the reference off before the error: a 500 comes from
  // closing the stream once the count has dropped. Sent again, the close
  // would take another session's reference on a shared channel.
  test("is not sent again once the server answered with an error", async () => {
    const api = makeApi();
    api.mock.onPost(CLOSE).reply(500);

    await expect(closeLiveStream(api, "live-1", noWait)).rejects.toThrow();

    expect(api.mock.history.post).toHaveLength(1);
  });

  // A gateway answers in the server's place, and a 504 can come from a close
  // the server is still waiting to make, behind a tuner being opened.
  test("is not sent again after a gateway timeout", async () => {
    const api = makeApi();
    api.mock.onPost(CLOSE).reply(504);

    await expect(closeLiveStream(api, "live-1", noWait)).rejects.toThrow();

    expect(api.mock.history.post).toHaveLength(1);
  });

  test("is tried again when no answer came back", async () => {
    const api = makeApi();
    api.mock.onPost(CLOSE).networkErrorOnce();
    api.mock.onPost(CLOSE).reply(204);

    await closeLiveStream(api, "live-1", noWait);

    expect(api.mock.history.post).toHaveLength(2);
  });

  test("gives up after its last attempt", async () => {
    const api = makeApi();
    api.mock.onPost(CLOSE).networkError();

    await expect(
      closeLiveStream(api, "live-1", { attempts: 3, retryDelayMs: 0 }),
    ).rejects.toThrow();

    expect(api.mock.history.post).toHaveLength(3);
  });

  test("waits before each retry, twice as long as before the last one", async () => {
    jest.useFakeTimers();
    try {
      const api = makeApi();
      api.mock.onPost(CLOSE).networkError();
      const closing = closeLiveStream(api, "live-1", {
        attempts: 3,
        retryDelayMs: 1_000,
      }).catch(() => {});

      await jest.advanceTimersByTimeAsync(999);
      expect(api.mock.history.post).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(api.mock.history.post).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(1_999);
      expect(api.mock.history.post).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(api.mock.history.post).toHaveLength(3);
      await closing;
    } finally {
      jest.useRealTimers();
    }
  });
});
