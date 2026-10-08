import type { User as SeerrUser } from "@/utils/seerr/types";
import type {
  SeerrApiKeySignIn,
  SeerrSignInAtLogin,
} from "./seerrSignInAtLogin";

const mockWriteErrorLog = jest.fn();

// The log module reaches Sentry and MMKV, so it is stubbed with the surface
// this spec's module under test actually calls.
jest.mock("@/utils/log", () => ({
  writeErrorLog: (...args: unknown[]) => mockWriteErrorLog(...args),
}));

import { store } from "@/utils/store";
import {
  holdSeerrSignIn,
  seerrSignInsAtLoginAtom,
  signInToSeerrAtLogin,
  signInToSeerrWithApiKey,
} from "./seerrSignInAtLogin";

const QUICK_CONNECTED = { id: 7 } as SeerrUser;
const WITH_PASSWORD = { id: 8 } as SeerrUser;

/** What each step did, so the order and the short-circuits can be asserted. */
interface Calls {
  tested: number;
  loggedIn: number;
  forgot: number;
  signedIn: SeerrUser[];
  remembered: number;
}

const steps = (
  over: Partial<SeerrSignInAtLogin> = {},
): { steps: SeerrSignInAtLogin; calls: Calls } => {
  const calls: Calls = {
    tested: 0,
    loggedIn: 0,
    forgot: 0,
    signedIn: [],
    remembered: 0,
  };
  return {
    calls,
    steps: {
      quickConnect: async () => undefined,
      test: async () => {
        calls.tested += 1;
        return { isValid: true, requiresPass: true };
      },
      login: async () => {
        calls.loggedIn += 1;
        return WITH_PASSWORD;
      },
      forget: () => {
        calls.forgot += 1;
      },
      stillCurrent: () => true,
      signedIn: (user) => {
        calls.signedIn.push(user);
      },
      rememberPassword: () => {
        calls.remembered += 1;
      },
      ...over,
    },
  };
};

/** True for the first `times` calls, false after: the account leaves then. */
const leavesAfter = (times: number) => {
  let asked = 0;
  return () => {
    asked += 1;
    return asked <= times;
  };
};

describe("signInToSeerrAtLogin", () => {
  beforeEach(() => mockWriteErrorLog.mockClear());

  // Quick Connect needs no password, so a server that supports it never sees
  // one and nothing is stored.
  test("takes Quick Connect's session and never sends the password", async () => {
    const { steps: s, calls } = steps({
      quickConnect: async () => QUICK_CONNECTED,
    });

    await signInToSeerrAtLogin(s);

    expect(calls.signedIn).toEqual([QUICK_CONNECTED]);
    expect(calls.tested).toBe(0);
    expect(calls.loggedIn).toBe(0);
    expect(calls.remembered).toBe(0);
  });

  // Quick Connect checks the account before it stores the session, and the
  // account can still move on before the session is handed over.
  test("drops Quick Connect's session for an account that left before it was handed over", async () => {
    const { steps: s, calls } = steps({
      quickConnect: async () => QUICK_CONNECTED,
      stillCurrent: () => false,
    });

    await signInToSeerrAtLogin(s);

    expect(calls.forgot).toBe(1);
    expect(calls.signedIn).toEqual([]);
  });

  test("signs in with the password when Quick Connect could not", async () => {
    const { steps: s, calls } = steps();

    await signInToSeerrAtLogin(s);

    expect(calls.signedIn).toEqual([WITH_PASSWORD]);
    expect(calls.remembered).toBe(1);
  });

  test("leaves a server that wants no password alone", async () => {
    const { steps: s, calls } = steps({
      test: async () => ({ isValid: true, requiresPass: false }),
    });

    await signInToSeerrAtLogin(s);

    expect(calls.loggedIn).toBe(0);
    expect(calls.signedIn).toEqual([]);
  });

  test("leaves a server it cannot reach alone", async () => {
    const { steps: s, calls } = steps({
      test: async () => ({ isValid: false }),
    });

    await signInToSeerrAtLogin(s);

    expect(calls.loggedIn).toBe(0);
    expect(calls.signedIn).toEqual([]);
  });

  test("asks nothing of Seerr for an account that has already left", async () => {
    const { steps: s, calls } = steps({ stillCurrent: () => false });

    await signInToSeerrAtLogin(s);

    expect(calls.tested).toBe(0);
    expect(calls.loggedIn).toBe(0);
  });

  // A sign-out while the server is tested wipes the Seerr data. Signing in
  // after that would store a session for the account that left, and the next
  // account would find it and act in Seerr as the previous one.
  test("opens no session for an account that left while the server was tested", async () => {
    const { steps: s, calls } = steps({ stillCurrent: leavesAfter(1) });

    await signInToSeerrAtLogin(s);

    expect(calls.tested).toBe(1);
    expect(calls.loggedIn).toBe(0);
    expect(calls.signedIn).toEqual([]);
  });

  // login stores the session it opens before the account can be checked
  // again, so leaving during it means that session has to go.
  test("drops the session of an account that left while it was opening", async () => {
    const { steps: s, calls } = steps({ stillCurrent: leavesAfter(2) });

    await signInToSeerrAtLogin(s);

    expect(calls.loggedIn).toBe(1);
    expect(calls.forgot).toBe(1);
    expect(calls.signedIn).toEqual([]);
    expect(calls.remembered).toBe(0);
  });

  // It runs after the login has resolved, with nobody left to catch for.
  test("logs a failed sign-in rather than throwing it", async () => {
    const failure = new Error("Seerr said no");
    const { steps: s, calls } = steps({
      login: async () => {
        throw failure;
      },
    });

    await expect(signInToSeerrAtLogin(s)).resolves.toBeUndefined();

    expect(calls.signedIn).toEqual([]);
    expect(mockWriteErrorLog).toHaveBeenCalledWith(
      "Seerr sign-in at login failed: Seerr said no",
    );
  });
});

const WITH_KEY = { id: 9 } as SeerrUser;

/** What each step of the API-key sign-in did. */
interface KeyCalls {
  usedKey: number;
  forgot: number;
  signedIn: SeerrUser[];
}

const keySteps = (
  over: Partial<SeerrApiKeySignIn> = {},
): { steps: SeerrApiKeySignIn; calls: KeyCalls } => {
  const calls: KeyCalls = { usedKey: 0, forgot: 0, signedIn: [] };
  return {
    calls,
    steps: {
      quickConnect: async () => undefined,
      loginWithApiKey: async () => {
        calls.usedKey += 1;
        return WITH_KEY;
      },
      forget: () => {
        calls.forgot += 1;
      },
      stillCurrent: () => true,
      signedIn: (user) => {
        calls.signedIn.push(user);
      },
      ...over,
    },
  };
};

// JellyfinProvider runs it for each account whose plugin gives an API key. A
// sign-out or an account switch clears the Seerr data, and a sign-in still on
// its way would bring the previous account's session back for the next one.
describe("signInToSeerrWithApiKey", () => {
  beforeEach(() => mockWriteErrorLog.mockClear());

  test("takes Quick Connect's session and never uses the key", async () => {
    const { steps: s, calls } = keySteps({
      quickConnect: async () => QUICK_CONNECTED,
    });

    await signInToSeerrWithApiKey(s);

    expect(calls.signedIn).toEqual([QUICK_CONNECTED]);
    expect(calls.usedKey).toBe(0);
  });

  test("signs in with the key when Quick Connect could not", async () => {
    const { steps: s, calls } = keySteps();

    await signInToSeerrWithApiKey(s);

    expect(calls.signedIn).toEqual([WITH_KEY]);
  });

  test("uses no key for an account that has already left", async () => {
    const { steps: s, calls } = keySteps({ stillCurrent: () => false });

    await signInToSeerrWithApiKey(s);

    expect(calls.usedKey).toBe(0);
    expect(calls.signedIn).toEqual([]);
  });

  test("drops the session of an account that left while the key signed it in", async () => {
    const { steps: s, calls } = keySteps({ stillCurrent: leavesAfter(1) });

    await signInToSeerrWithApiKey(s);

    expect(calls.usedKey).toBe(1);
    expect(calls.forgot).toBe(1);
    expect(calls.signedIn).toEqual([]);
  });

  test("drops Quick Connect's session for an account that left before it was handed over", async () => {
    const { steps: s, calls } = keySteps({
      quickConnect: async () => QUICK_CONNECTED,
      stillCurrent: () => false,
    });

    await signInToSeerrWithApiKey(s);

    expect(calls.forgot).toBe(1);
    expect(calls.signedIn).toEqual([]);
  });

  test("logs a failed sign-in rather than throwing it", async () => {
    const { steps: s } = keySteps({
      loginWithApiKey: async () => {
        throw new Error("Seerr said no");
      },
    });

    await expect(signInToSeerrWithApiKey(s)).resolves.toBeUndefined();

    expect(mockWriteErrorLog).toHaveBeenCalledWith(
      "Seerr API-key sign-in failed: Seerr said no",
    );
  });
});

// SeerrAutoLogin waits while a password sign-in is signing the same user in to
// Seerr, or both run Quick Connect and race to open the session.
describe("holding SeerrAutoLogin off", () => {
  const held = (userId: string) =>
    store.get(seerrSignInsAtLoginAtom).has(userId);

  afterEach(() => store.set(seerrSignInsAtLoginAtom, new Map()));

  test("holds the user while the sign-in runs, and lets go with it", () => {
    const end = holdSeerrSignIn("alex");
    expect(held("alex")).toBe(true);

    end();
    expect(held("alex")).toBe(false);
  });

  // A URL sign-in and a submitted form can both be signing the same user in,
  // and they need not end in the order they started.
  test.each([
    ["the first", 0],
    ["the second", 1],
  ])(
    "holds until the last of two sign-ins ends, %s ending first",
    (_case, first) => {
      const ends = [holdSeerrSignIn("alex"), holdSeerrSignIn("alex")];

      ends[first]();
      expect(held("alex")).toBe(true);

      ends[1 - first]();
      expect(held("alex")).toBe(false);
    },
  );

  test("holds one user, not the next", () => {
    const end = holdSeerrSignIn("alex");

    expect(held("sam")).toBe(false);
    end();
  });

  test("a sign-in without a user holds nothing and takes nothing away", () => {
    const endNamed = holdSeerrSignIn("alex");
    const endUnnamed = holdSeerrSignIn(undefined);

    expect([...store.get(seerrSignInsAtLoginAtom).keys()]).toEqual(["alex"]);
    endUnnamed();
    expect(held("alex")).toBe(true);
    endNamed();
  });

  test("ending twice takes nothing from another sign-in", () => {
    const endFirst = holdSeerrSignIn("alex");
    const endSecond = holdSeerrSignIn("alex");

    endFirst();
    endFirst();
    expect(held("alex")).toBe(true);

    endSecond();
    expect(held("alex")).toBe(false);
  });
});
