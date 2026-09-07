import { describe, expect, mock, test } from "bun:test";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";
import type { QuickConnectSteps } from "./jellyseerrQuickConnect";

// Bun's mock.module retroactively re-links every module already importing the
// specifier, so a log mock must cover the module's full function surface —
// a missing name breaks OTHER test files' modules that import it.
mock.module("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  logAndCaptureError: () => undefined,
  readFromLog: () => [],
}));

const { attemptQuickConnectSignIn } = await import("./jellyseerrQuickConnect");

const SEERR_USER = { id: 7 } as JellyseerrUser;

/** What each step did, so the order and the short-circuits can be asserted. */
interface Calls {
  primed: number;
  forgot: number;
  initiated: number;
  approvedCodes: string[];
  authenticatedSecrets: string[];
}

const steps = (
  over: Partial<QuickConnectSteps> = {},
): { steps: QuickConnectSteps; calls: Calls } => {
  const calls: Calls = {
    primed: 0,
    forgot: 0,
    initiated: 0,
    approvedCodes: [],
    authenticatedSecrets: [],
  };

  return {
    calls,
    steps: {
      isEnabled: async () => true,
      prime: async () => {
        calls.primed += 1;
      },
      initiate: async () => {
        calls.initiated += 1;
        return { code: "123456", secret: "SECRET" };
      },
      approve: async (code) => {
        calls.approvedCodes.push(code);
        return "approved";
      },
      authenticate: async (secret) => {
        calls.authenticatedSecrets.push(secret);
        return SEERR_USER;
      },
      stillCurrent: () => true,
      forget: () => {
        calls.forgot += 1;
      },
      ...over,
    },
  };
};

describe("attemptQuickConnectSignIn", () => {
  test("signs in with neither a password nor an API key", async () => {
    const { steps: s, calls } = steps();

    expect(await attemptQuickConnectSignIn(s)).toEqual({ user: SEERR_USER });
    expect(calls.initiated).toBe(1);
    expect(calls.approvedCodes).toEqual(["123456"]);
  });

  test("approves the code and claims the secret", async () => {
    // Two values of the same shape arrive together, and sending the code where
    // the secret belongs authenticates nobody while looking like it worked.
    const { steps: s, calls } = steps();

    await attemptQuickConnectSignIn(s);

    expect(calls.authenticatedSecrets).toEqual(["SECRET"]);
  });

  test("asks Seerr for its cookies before the first POST", async () => {
    // With CSRF protection on, Seerr refuses a POST from a client it has not
    // handed cookies to yet, and a fresh install holds none. A GET first is
    // what lets the initiate below land.
    const order: string[] = [];
    const { steps: s } = steps({
      prime: async () => {
        order.push("prime");
      },
      initiate: async () => {
        order.push("initiate");
        return { code: "123456", secret: "SECRET" };
      },
    });

    await attemptQuickConnectSignIn(s);

    expect(order).toEqual(["prime", "initiate"]);
  });

  test("stops when the Jellyfin server has Quick Connect switched off", async () => {
    const { steps: s, calls } = steps({ isEnabled: async () => false });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "quick-connect-disabled",
    });
    // Nothing is asked of Seerr: a disabled server would fail the initiate from
    // the far side, which reads as a broken Seerr rather than a server policy.
    expect(calls.primed).toBe(0);
    expect(calls.initiated).toBe(0);
  });

  test("stops when Seerr predates the route", async () => {
    const { steps: s, calls } = steps({ initiate: async () => undefined });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "seerr-has-no-route",
    });
    expect(calls.approvedCodes).toEqual([]);
  });

  test("stops when Seerr points at a different Jellyfin server", async () => {
    const { steps: s, calls } = steps({ approve: async () => "unknown-code" });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "different-jellyfin-server",
    });
    // Claiming a secret the Jellyfin server never approved would hand back
    // whatever Seerr makes of it, so the attempt ends here.
    expect(calls.authenticatedSecrets).toEqual([]);
  });

  test("tells a refused code apart from one the server never issued", async () => {
    // Both end the attempt, but only the first means an administrator pointed
    // Seerr at another server, and that is the one worth reading in a log.
    const { steps: s } = steps({ approve: async () => "refused" });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "not-approved",
    });
  });

  test("does not sign in for an account that has since been left", async () => {
    // Three round trips is long enough to log out or switch account in, and the
    // Seerr session belongs to whoever approved the code, so applying it late
    // would hand the previous user's Seerr account to the current one.
    const { steps: s, calls } = steps({ stillCurrent: () => false });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "session-moved-on",
    });
    // Not even started: an abandoned session should not open a Seerr session
    // nobody is going to use.
    expect(calls.authenticatedSecrets).toEqual([]);
    // No authenticate ran, so no session cookie was stored, so nothing to drop.
    expect(calls.forgot).toBe(0);
  });

  test("checks again after authenticating, which is the window that matters", async () => {
    // The account can be left while the last call is in flight, and by then a
    // Seerr session exists. It just must not become this device's.
    let current = true;
    const { steps: s, calls } = steps({
      stillCurrent: () => current,
      authenticate: async () => {
        current = false;
        return SEERR_USER;
      },
    });

    expect(await attemptQuickConnectSignIn(s)).toEqual({
      declined: "session-moved-on",
    });
    // authenticate opened a Seerr session whose cookie the interceptor stored;
    // it must be dropped so a later account cannot reuse it.
    expect(calls.forgot).toBe(1);
  });

  test("lets a transport failure through rather than calling it a refusal", async () => {
    const { steps: s } = steps({
      initiate: async () => {
        throw new Error("socket hang up");
      },
    });

    // A refusal is a decision the caller logs and moves past. An unreachable
    // server is not one, and swallowing it here would hide it from the caller
    // that decides whether it is worth a toast.
    await expect(attemptQuickConnectSignIn(s)).rejects.toThrow(
      "socket hang up",
    );
  });
});
