import { endsSeerrSession, sendSeerrRequest } from "./requestFlow";
import { type MediaRequest, MediaRequestStatus } from "./types";

const answer = (status: MediaRequestStatus) =>
  ({ id: 1, status }) as unknown as MediaRequest;

// Seerr refuses a request with a status and its reason in `message`.
const refusal = (status: number, message?: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: message ? { message } : {} },
  });

// The request sheet closes on Seerr's answer: the rows it shows reload behind
// it, and a refusal says why rather than nothing.
describe("sendSeerrRequest", () => {
  test("tells of the request as soon as Seerr takes it", async () => {
    const outcomes: unknown[] = [];
    const refresh = jest.fn(() => new Promise<void>(() => {}));
    await sendSeerrRequest({
      key: "movie-603",
      send: async () => answer(MediaRequestStatus.PENDING),
      refresh,
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    expect(outcomes).toEqual([{ kind: "requested" }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("reads an approved request as requested too", async () => {
    const outcomes: unknown[] = [];
    await sendSeerrRequest({
      key: "movie-603",
      send: async () => answer(MediaRequestStatus.APPROVED),
      refresh: async () => {},
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    expect(outcomes).toEqual([{ kind: "requested" }]);
  });

  test("tells of a request Seerr declined or that failed", async () => {
    const outcomes: unknown[] = [];
    for (const status of [
      MediaRequestStatus.DECLINED,
      MediaRequestStatus.FAILED,
    ]) {
      await sendSeerrRequest({
        key: "movie-603",
        send: async () => answer(status),
        refresh: async () => {},
        onOutcome: (outcome) => outcomes.push(outcome),
      });
    }
    expect(outcomes).toEqual([{ kind: "declined" }, { kind: "failed" }]);
  });

  test("passes on why Seerr refused, and still reloads", async () => {
    const outcomes: unknown[] = [];
    const refresh = jest.fn(async () => {});
    await sendSeerrRequest({
      key: "movie-603",
      send: async () => {
        throw refusal(403, "Series Quota exceeded.");
      },
      refresh,
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    expect(outcomes).toEqual([
      { kind: "refused", message: "Series Quota exceeded." },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("refuses without a reason when Seerr gives none", async () => {
    const outcomes: unknown[] = [];
    await sendSeerrRequest({
      key: "movie-603",
      send: async () => {
        throw new Error("Network Error");
      },
      refresh: async () => {},
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    expect(outcomes).toEqual([{ kind: "refused", message: undefined }]);
  });
});

// Seerr answers 403 both to a request without a session and to an action the
// user may not take, such as a request past the quota. Only a read tells the
// session is gone: a refused action is about that action.
// Android TV can deliver one press twice, and Seerr, asked for the same title
// twice at once, can file both: it looks for a request before saving its own.
describe("sendSeerrRequest, the same request twice", () => {
  const pending = () => {
    let answerSeerr: (request: MediaRequest) => void = () => {};
    const send = jest.fn(
      () =>
        new Promise<MediaRequest>((resolve) => {
          answerSeerr = resolve;
        }),
    );
    return { send, answer: (request: MediaRequest) => answerSeerr(request) };
  };

  test("sends a request already on its way once", async () => {
    const seerr = pending();
    const outcomes: unknown[] = [];
    const flow = {
      key: "movie-603",
      send: seerr.send,
      refresh: async () => {},
      onOutcome: (outcome: unknown) => outcomes.push(outcome),
    };
    const first = sendSeerrRequest(flow);
    await sendSeerrRequest(flow);
    expect(seerr.send).toHaveBeenCalledTimes(1);
    seerr.answer(answer(MediaRequestStatus.PENDING));
    await first;
    expect(outcomes).toEqual([{ kind: "requested" }]);
  });

  test("sends another request at the same time", async () => {
    const first = pending();
    const second = pending();
    const flow = { refresh: async () => {}, onOutcome: () => {} };
    const sent = [
      sendSeerrRequest({ ...flow, key: "tv-1399-1", send: first.send }),
      sendSeerrRequest({ ...flow, key: "tv-1399-2", send: second.send }),
    ];
    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).toHaveBeenCalledTimes(1);
    first.answer(answer(MediaRequestStatus.PENDING));
    second.answer(answer(MediaRequestStatus.PENDING));
    await Promise.all(sent);
  });

  // The season sheet stays open after a refusal, to try again.
  test("sends it again once Seerr has answered, a refusal included", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(refusal(403, "Series Quota exceeded."))
      .mockResolvedValueOnce(answer(MediaRequestStatus.PENDING));
    const flow = {
      key: "tv-1399-1",
      send,
      refresh: async () => {},
      onOutcome: () => {},
    };
    await sendSeerrRequest(flow);
    await sendSeerrRequest(flow);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("endsSeerrSession", () => {
  test("ends it on a read refused", () => {
    expect(endsSeerrSession(403, "get", "/api/v1/discover/movies")).toBe(true);
    expect(endsSeerrSession(403, undefined, "/api/v1/auth/me")).toBe(true);
  });

  test("keeps it when an action is refused", () => {
    expect(endsSeerrSession(403, "post", "/api/v1/request")).toBe(false);
    expect(endsSeerrSession(403, "put", "/api/v1/request/7")).toBe(false);
  });

  // Another user's request, read without Manage Requests.
  test("keeps it when a request's own detail is refused", () => {
    expect(endsSeerrSession(403, "get", "/api/v1/request/42")).toBe(false);
  });

  test("keeps it for any other answer", () => {
    expect(endsSeerrSession(401, "get", "/api/v1/discover/movies")).toBe(false);
    expect(endsSeerrSession(500, "get", "/api/v1/discover/movies")).toBe(false);
    expect(endsSeerrSession(undefined, "get", "/api/v1/status")).toBe(false);
  });
});
