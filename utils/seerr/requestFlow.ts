import { type MediaRequest, MediaRequestStatus } from "./types";

/** What Seerr made of a request, for the user to hear of it. */
export type RequestOutcome =
  | { kind: "requested" }
  | { kind: "declined" }
  | { kind: "failed" }
  /** Seerr would not take it, with its reason when it gives one. */
  | { kind: "refused"; message: string | undefined };

/** The reason Seerr gives when it refuses something ("Series Quota exceeded."). */
const refusalMessage = (error: unknown): string | undefined => {
  const data = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data;
  return typeof data?.message === "string" ? data.message : undefined;
};

const outcomeOf = (request: MediaRequest): RequestOutcome => {
  switch (request.status) {
    case MediaRequestStatus.DECLINED:
      return { kind: "declined" };
    case MediaRequestStatus.FAILED:
      return { kind: "failed" };
    default:
      return { kind: "requested" };
  }
};

/** The requests on their way, by key: see sendSeerrRequest. */
const sending = new Set<string>();

/**
 * Sends a request and tells what came of it on Seerr's answer. The rows and
 * pages it changes reload in the background: waiting for them kept the sheet
 * open, its button live, for as long as every Discover row took to reload.
 * They reload after a refusal too, which can mean the view was out of date.
 *
 * The same request goes once at a time, from any screen: Android TV can
 * deliver one press twice, and Seerr, asked for the same title twice at
 * once, can file both, as it looks for a request before saving its own.
 */
export const sendSeerrRequest = async ({
  key,
  send,
  refresh,
  onOutcome,
}: {
  /** What tells this request from another, such as its body. */
  key: string;
  send: () => Promise<MediaRequest>;
  refresh: () => Promise<unknown>;
  onOutcome: (outcome: RequestOutcome) => void;
}): Promise<void> => {
  if (sending.has(key)) return;
  sending.add(key);
  let outcome: RequestOutcome;
  try {
    outcome = outcomeOf(await send());
  } catch (error) {
    outcome = { kind: "refused", message: refusalMessage(error) };
  } finally {
    sending.delete(key);
  }
  refresh().catch(() => {});
  onOutcome(outcome);
};

/**
 * Whether a Seerr answer means the session is gone. Seerr answers 403 both
 * to a request without a session and to an action the user may not take,
 * such as a request past the quota: only a read refused tells the first, and
 * not the detail of another user's request.
 */
export const endsSeerrSession = (
  status: number | undefined,
  method: string | undefined,
  path: string | undefined,
): boolean =>
  status === 403 &&
  (method ?? "get").toLowerCase() === "get" &&
  !/\/request\/\d+$/.test(path ?? "");
