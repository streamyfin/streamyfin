import type { Api } from "@jellyfin/sdk";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import axios from "axios";
import type { JellyseerrApi } from "@/hooks/useJellyseerr";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";
import { writeToLog } from "@/utils/log";

/**
 * Signing in to Seerr without a password and without an admin API key.
 *
 * Seerr's `/auth/jellyfin` wants the Jellyfin password, which a Quick Connect or
 * OIDC session does not have. The workaround shipped so far is an admin API key
 * distributed to every device, where attribution is an `actAsUserId` the client
 * picks, so whoever holds a copy acts as anyone.
 *
 * Seerr 3.4.0 removed the need for either. It can start a Jellyfin Quick Connect
 * request of its own, and this app is a signed-in Jellyfin client, so it approves
 * that request with the token it already holds. Seerr ends up with an ordinary
 * per-user session and the key never enters the picture.
 */

/** Why the attempt stopped, when it stopped for a reason rather than an error. */
export type QuickConnectDecline =
  /** The Jellyfin admin has Quick Connect switched off. */
  | "quick-connect-disabled"
  /** Seerr predates 3.4.0, so the route does not exist. */
  | "seerr-has-no-route"
  /** Seerr is pointed at a different Jellyfin than the one we are signed in to. */
  | "different-jellyfin-server"
  /** The code exists but this account was not allowed to approve it. */
  | "not-approved"
  /** The account moved on while the three round trips were in flight. */
  | "session-moved-on";

export type QuickConnectOutcome =
  | { user: JellyseerrUser }
  | { declined: QuickConnectDecline };

export interface QuickConnectSteps {
  /** Whether the Jellyfin server allows Quick Connect at all. */
  isEnabled: () => Promise<boolean>;
  /**
   * A GET to Seerr before the first POST.
   *
   * With CSRF protection switched on, Seerr refuses a POST from a client it has
   * not handed its cookies to yet, and on a fresh install none of the three
   * entry points has made a request before this one.
   */
  prime: () => Promise<void>;
  /** Seerr asks its own Jellyfin for a code. Undefined when it has no such route. */
  initiate: () => Promise<{ code: string; secret: string } | undefined>;
  /**
   * This device approves the code as the user it is signed in as.
   *
   * Three answers rather than two: a code the server has never heard of and a
   * code it refuses to approve are different problems, and only the first one
   * means the administrator pointed Seerr somewhere else.
   */
  approve: (code: string) => Promise<"approved" | "unknown-code" | "refused">;
  /** Seerr turns the approved secret into a session. */
  authenticate: (secret: string) => Promise<JellyseerrUser>;
  /**
   * Whether the account this started for is still the one signed in.
   *
   * Three round trips is long enough to log out or switch account in, and the
   * session Seerr opens belongs to whoever approved the code. Applying it after
   * that would hand the previous user's Seerr account to the current one.
   */
  stillCurrent: () => boolean;
  /**
   * Drops any Seerr session this attempt stored, cookies included.
   *
   * Only the last step opens a session, and its response cookies land in shared
   * storage through the client's interceptor before the caller can look. If the
   * account has moved on by then, those cookies must go, or the next account
   * inherits the previous one's Seerr session.
   */
  forget: () => void;
}

/**
 * The four steps in order, with each refusal named.
 *
 * Kept apart from the two clients it drives so the order and the refusals can be
 * tested without a Jellyfin server and a Seerr next to it.
 */
export const attemptQuickConnectSignIn = async (
  steps: QuickConnectSteps,
): Promise<QuickConnectOutcome> => {
  // Asked before initiating rather than after failing: a disabled server makes
  // Seerr's initiate fail from the far side, which reads like a broken Seerr
  // instead of a deliberate Jellyfin policy.
  if (!(await steps.isEnabled())) return { declined: "quick-connect-disabled" };

  await steps.prime();

  const request = await steps.initiate();
  if (!request) return { declined: "seerr-has-no-route" };

  // A code Jellyfin does not know means Seerr asked a different server than the
  // one this device is signed in to. That is an administrator's mistake to fix,
  // not a transport failure, so it is named rather than thrown.
  const approval = await steps.approve(request.code);
  if (approval === "unknown-code")
    return { declined: "different-jellyfin-server" };
  if (approval === "refused") return { declined: "not-approved" };

  // Checked on both sides of the call: before, so a session that has already
  // moved on does not open a Seerr session nobody asked for, and after, because
  // that is the window this guard exists for.
  if (!steps.stillCurrent()) return { declined: "session-moved-on" };

  const user = await steps.authenticate(request.secret);

  if (!steps.stillCurrent()) {
    // authenticate already opened a session, and its cookies are in shared
    // storage by now; drop them so the account that took over cannot reuse it.
    steps.forget();
    return { declined: "session-moved-on" };
  }

  return { user };
};

/** The two clients wired into the four steps. */
export const quickConnectSteps = (
  seerr: JellyseerrApi,
  api: Api,
  stillCurrent: () => boolean,
): QuickConnectSteps => ({
  stillCurrent,

  isEnabled: async () =>
    (await getQuickConnectApi(api).getQuickConnectEnabled()).data === true,

  prime: () => seerr.prime(),

  forget: () => seerr.forget(),

  initiate: () => seerr.initiateQuickConnect(),

  // No userId: QuickConnectController authorizes the caller, and naming someone
  // else is the part that needs elevation. This is why the flow works for an
  // ordinary account and why it cannot be turned against another user.
  approve: async (code) => {
    try {
      const { data } = await getQuickConnectApi(api).authorizeQuickConnect({
        code,
      });
      return data ? "approved" : "refused";
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404)
        return "unknown-code";
      throw e;
    }
  },

  authenticate: (secret) => seerr.authenticateQuickConnect(secret),
});

/**
 * The whole attempt, for callers that only want a user or nothing.
 *
 * Every caller has another way to sign in behind this one, so a refusal and a
 * failure both come back as undefined and land in the log rather than in a
 * toast: none of the three entry points is something the user asked for by name.
 */
export const signInWithQuickConnect = async (
  seerr: JellyseerrApi,
  api: Api,
  stillCurrent: () => boolean,
): Promise<JellyseerrUser | undefined> => {
  try {
    const outcome = await attemptQuickConnectSignIn(
      quickConnectSteps(seerr, api, stillCurrent),
    );
    if ("user" in outcome) {
      // Stored only once the account it belongs to is confirmed to still be
      // the one signed in, which is why authenticateQuickConnect does not.
      seerr.remember(outcome.user);
      return outcome.user;
    }

    writeToLog(
      "INFO",
      `Seerr Quick Connect sign-in declined: ${outcome.declined}`,
    );
    return undefined;
  } catch (e) {
    writeToLog(
      "WARN",
      `Seerr Quick Connect sign-in failed: ${
        e instanceof Error ? e.message : e
      }`,
    );
    return undefined;
  }
};
