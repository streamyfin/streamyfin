import type { Api } from "@jellyfin/sdk";
import type { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import {
  JELLYFIN_RECEIVER_CLIENT,
  RECEIVER_LIVENESS_WINDOW_MS,
  RECEIVER_STOP_GRACE_MS,
} from "@/constants/Cast";
import { getJellyfinHeaders } from "@/utils/customHeaders";

/**
 * The official receiver only reports /Sessions/Playing/Stopped from its
 * MEDIA_FINISHED handler. Ending the Cast session from the phone (the native
 * "Stop casting" button, the notification) closes the receiver app outright,
 * so that report never goes out: the server keeps the item "playing" until its
 * idle check gives up 5 to 10 minutes later, and the dashboard card freezes on
 * it. jellyfin-web avoids this by sending Stop and waiting a second before
 * closing the app, which the native controls give us no hook for.
 *
 * So once a session has ended, the phone reports the stop on the receiver's
 * behalf if the server still has it playing.
 */

/**
 * The receiver strips these characters from the name it is given before using
 * it as its Jellyfin device name, so compare against the same cleanup.
 */
export const toReceiverDeviceName = (friendlyName: string): string =>
  friendlyName.replace(/[^\w\s]/gi, "");

export interface EndedReceiverSession {
  api: Api;
  userId: string;
  deviceName: string;
  /**
   * True when the Cast SDK ended the session with no error, which it only does
   * when casting was stopped: the receiver app is closed, so there is nothing
   * to wait for. False on a connection loss, where the TV may still be playing.
   */
  receiverClosed: boolean;
  /**
   * The item the phone last saw the receiver play, from its media customData.
   * Only that playback gets stopped: anything else on the receiver was started
   * after this session.
   */
  itemId: string;
  playSessionId?: string;
  /** Aborted when a new Cast session starts or the user or server changes. */
  signal?: AbortSignal;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const findPlayingReceiverSession = async ({
  api,
  userId,
  deviceName,
  itemId,
  signal,
}: EndedReceiverSession): Promise<SessionInfoDto | undefined> => {
  const { data } = await getSessionApi(api).getSessions(
    { activeWithinSeconds: 960 },
    { signal },
  );

  // Admins get every user's sessions back, and two TVs can share a name, so
  // the user has to match as well as the device.
  return data.find(
    (session) =>
      session.Client === JELLYFIN_RECEIVER_CLIENT &&
      session.UserId === userId &&
      session.DeviceName === deviceName &&
      session.NowPlayingItem?.Id === itemId,
  );
};

/**
 * Resolves the receiver session to stop, or undefined when it reported the
 * stop itself or is still alive.
 */
const findOrphanedReceiverSession = async (
  ended: EndedReceiverSession,
): Promise<SessionInfoDto | undefined> => {
  // No timers on this path: React Native on Android does not fire them while
  // the app is in the background, and stopping a cast hands the screen back to
  // an app the user usually leaves straight away. A wait here sat frozen until
  // the app was reopened, and the dashboard with it.
  if (ended.receiverClosed) return findPlayingReceiverSession(ended);

  await sleep(RECEIVER_STOP_GRACE_MS, ended.signal);
  if (ended.signal?.aborted) return undefined;
  const before = await findPlayingReceiverSession(ended);
  if (!before) return undefined;

  await sleep(RECEIVER_LIVENESS_WINDOW_MS, ended.signal);
  if (ended.signal?.aborted) return undefined;
  const after = await findPlayingReceiverSession(ended);
  const stillCheckingIn =
    !after ||
    after.Id !== before.Id ||
    after.LastPlaybackCheckIn !== before.LastPlaybackCheckIn;

  return stillCheckingIn ? undefined : after;
};

/**
 * Written the way the receiver identifies itself, so the server resolves it to
 * the receiver's own session. The server lets a "Chromecast" client share a
 * token without rewriting the token's device, so this leaves the phone's
 * device record alone.
 */
const receiverAuthorization = (session: SessionInfoDto, token: string) =>
  `MediaBrowser Client="${JELLYFIN_RECEIVER_CLIENT}", Device="${encodeURIComponent(
    session.DeviceName ?? "",
  )}", DeviceId="${encodeURIComponent(
    session.DeviceId ?? "",
  )}", Version="${encodeURIComponent(
    session.ApplicationVersion ?? "",
  )}", Token="${token}"`;

/**
 * Returns true when a stop was reported, false when there was nothing to do
 * (the receiver reported it, moved on, is still alive, or the check was
 * cancelled).
 */
export const reportOrphanedReceiverStop = async (
  ended: EndedReceiverSession,
): Promise<boolean> => {
  try {
    return await reportStop(ended);
  } catch (error) {
    // A cancelled request rejects on its own; cancelling is not a failure.
    if (ended.signal?.aborted) return false;
    throw error;
  }
};

const reportStop = async (ended: EndedReceiverSession): Promise<boolean> => {
  const { api, playSessionId, signal } = ended;
  if (!api.accessToken) return false;

  const session = await findOrphanedReceiverSession(ended);
  if (!session || signal?.aborted) return false;

  // Plain fetch rather than api.axiosInstance: a 401 there would sign the user
  // out, and this request speaks for the receiver, not for the app.
  const gatewayHeaders = Object.fromEntries(
    Object.entries(getJellyfinHeaders(api.basePath)).filter(
      ([key]) => key.toLowerCase() !== "authorization",
    ),
  );

  const response = await fetch(`${api.basePath}/Sessions/Playing/Stopped`, {
    method: "POST",
    signal,
    headers: {
      ...gatewayHeaders,
      "Content-Type": "application/json",
      Authorization: receiverAuthorization(session, api.accessToken),
    },
    body: JSON.stringify({
      ItemId: session.NowPlayingItem?.Id,
      MediaSourceId: session.PlayState?.MediaSourceId ?? undefined,
      PositionTicks: session.PlayState?.PositionTicks ?? undefined,
      // Lets the server kill the receiver's transcode right away.
      PlaySessionId: playSessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Reporting the receiver stop failed: ${response.status}`);
  }

  return true;
};
